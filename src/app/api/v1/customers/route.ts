import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildSuccess, handleApiError } from "@/lib/http/envelope";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { parsePaginationParams, encodeCursor } from "@/lib/pagination";
import { customerQuerySchema } from "@/lib/validation/customer.schema";
import { validateParams } from "@/lib/middleware/validate";

export const dynamic = "force-dynamic";

const ALLOWED_SORTS = ["createdAt", "fullName"];

export async function GET(req: NextRequest) {
  let rateLimitHeaders: Record<string, string> = {};
  try {
    const rateLimit = checkRateLimit(req);
    rateLimitHeaders = rateLimit.headers;

    const url = new URL(req.url);
    const pag = parsePaginationParams(url.searchParams, ALLOWED_SORTS, "createdAt", "desc");

    const rawFilters: Record<string, string> = {};
    const city = url.searchParams.get("city");
    if (city !== null) rawFilters.city = city;

    const filters = validateParams(customerQuerySchema, rawFilters);

    const where: any = {};
    if (filters.city) where.city = { equals: filters.city, mode: "insensitive" };

    if (pag.decodedCursor) {
      const { v, id } = pag.decodedCursor;
      const op = pag.order === "desc" ? "lt" : "gt";
      where.OR = [
        { [pag.sort]: { [op]: v } },
        { [pag.sort]: v, id: { [op]: id } },
      ];
    }

    const orderBy: any[] = [{ [pag.sort]: pag.order }];
    if (pag.sort !== "id") {
      orderBy.push({ id: pag.order });
    }

    const take = pag.limit + 1;
    const skip = pag.offset !== undefined ? pag.offset : undefined;

    const items = await prisma.customer.findMany({
      where,
      orderBy,
      take,
      skip,
    });

    const hasMore = items.length > pag.limit;
    const data = hasMore ? items.slice(0, pag.limit) : items;

    let nextCursor: string | undefined;
    if (hasMore && data.length > 0) {
      const lastItem = data[data.length - 1] as any;
      const cursorVal = lastItem[pag.sort];
      nextCursor = encodeCursor(cursorVal, lastItem.id);
    }

    let total: number | undefined;
    if (pag.offset !== undefined) {
      total = await prisma.customer.count({ where: { ...where, OR: undefined } });
    }

    return buildSuccess(
      data,
      {
        limit: pag.limit,
        total,
        hasMore,
        nextCursor,
      },
      200,
      rateLimitHeaders
    );
  } catch (error) {
    return handleApiError(error, rateLimitHeaders);
  }
}
