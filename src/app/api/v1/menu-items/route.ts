import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildSuccess, handleApiError } from "@/lib/http/envelope";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { parsePaginationParams, encodeCursor } from "@/lib/pagination";
import { menuItemQuerySchema } from "@/lib/validation/menu-item.schema";
import { validateParams } from "@/lib/middleware/validate";

export const dynamic = "force-dynamic";

const ALLOWED_SORTS = ["priceKobo", "name", "createdAt"];

export async function GET(req: NextRequest) {
  let rateLimitHeaders: Record<string, string> = {};
  try {
    const rateLimit = checkRateLimit(req);
    rateLimitHeaders = rateLimit.headers;

    const url = new URL(req.url);
    const pag = parsePaginationParams(url.searchParams, ALLOWED_SORTS, "priceKobo", "asc");

    const rawFilters: Record<string, string> = {};
    for (const key of ["category", "restaurantId", "isAvailable", "minPrice", "maxPrice"]) {
      const val = url.searchParams.get(key);
      if (val !== null) rawFilters[key] = val;
    }
    const filters = validateParams(menuItemQuerySchema, rawFilters);

    const where: any = {};
    if (filters.category) where.category = { equals: filters.category, mode: "insensitive" };
    if (filters.restaurantId) where.restaurantId = filters.restaurantId;
    if (filters.isAvailable !== undefined) where.isAvailable = filters.isAvailable;
    if (filters.minPrice !== undefined) where.priceKobo = { gte: BigInt(filters.minPrice) };
    if (filters.maxPrice !== undefined) {
      where.priceKobo = { ...where.priceKobo, lte: BigInt(filters.maxPrice) };
    }

    if (pag.decodedCursor) {
      const { v, id } = pag.decodedCursor;
      const op = pag.order === "desc" ? "lt" : "gt";
      const cursorVal = pag.sort === "priceKobo" ? BigInt(v as number) : v;
      where.OR = [
        { [pag.sort]: { [op]: cursorVal } },
        { [pag.sort]: cursorVal, id: { [op]: id } },
      ];
    }

    const orderBy: any[] = [{ [pag.sort]: pag.order }];
    if (pag.sort !== "id") {
      orderBy.push({ id: pag.order });
    }

    const take = pag.limit + 1;
    const skip = pag.offset !== undefined ? pag.offset : undefined;

    const items = await prisma.menuItem.findMany({
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
      total = await prisma.menuItem.count({ where: { ...where, OR: undefined } });
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
