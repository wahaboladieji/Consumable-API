import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildSuccess, handleApiError } from "@/lib/http/envelope";
import { NotFoundError } from "@/lib/http/errors";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { validateParams } from "@/lib/middleware/validate";
import { idParamSchema } from "@/lib/validation/pagination.schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  let rateLimitHeaders: Record<string, string> = {};
  try {
    const rateLimit = checkRateLimit(req);
    rateLimitHeaders = rateLimit.headers;

    const { id } = validateParams(idParamSchema, params);

    const menuItem = await prisma.menuItem.findUnique({
      where: { id },
    });

    if (!menuItem) {
      throw new NotFoundError(`Menu item with id '${id}' not found`);
    }

    return buildSuccess(menuItem, {}, 200, rateLimitHeaders);
  } catch (error) {
    return handleApiError(error, rateLimitHeaders);
  }
}
