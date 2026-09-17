import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildSuccess, handleApiError } from "@/lib/http/envelope";
import { NotFoundError } from "@/lib/http/errors";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { parsePaginationParams, encodeCursor } from "@/lib/pagination";
import { idParamSchema } from "@/lib/validation/pagination.schema";
import { validateParams } from "@/lib/middleware/validate";

export const dynamic = "force-dynamic";

const ALLOWED_SORTS = ["createdAt", "totalKobo"];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  let rateLimitHeaders: Record<string, string> = {};
  try {
    const rateLimit = checkRateLimit(req);
    rateLimitHeaders = rateLimit.headers;

    const { id: customerId } = validateParams(idParamSchema, params);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundError(`Customer with id '${customerId}' not found`);
    }

    const url = new URL(req.url);
    const pag = parsePaginationParams(url.searchParams, ALLOWED_SORTS, "createdAt", "desc");

    const where: any = { customerId };

    if (pag.decodedCursor) {
      const { v, id } = pag.decodedCursor;
      const op = pag.order === "desc" ? "lt" : "gt";
      const cursorVal = pag.sort === "totalKobo" ? BigInt(v as number) : v;
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

    const items = await prisma.order.findMany({
      where,
      orderBy,
      take,
      skip,
      include: {
        items: true,
      },
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
      total = await prisma.order.count({ where: { ...where, OR: undefined } });
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
