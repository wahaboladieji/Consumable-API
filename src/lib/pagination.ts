import { BadRequestError } from "./http/errors";
import { config } from "./config";

/**
 * Shared pagination, cursor, and sorting helper module.
 * Governance: PRD §6.5, pagination-cursor-implementation/SKILL.md.
 */

export interface DecodedCursor {
  v: string | number | boolean | Date;
  id: string;
}

export interface PaginationParams {
  limit: number;
  offset?: number;
  cursor?: string;
  decodedCursor?: DecodedCursor;
  sort: string;
  order: "asc" | "desc";
}

/**
 * Encodes a sort field value and primary key ID into an opaque Base64 cursor string.
 */
export function encodeCursor(value: unknown, id: string): string {
  let safeValue = value;
  if (typeof value === "bigint") {
    safeValue = Number(value);
  } else if (value !== null && typeof value === "object" && typeof (value as any).toNumber === "function") {
    safeValue = (value as any).toNumber();
  }
  const payload = { v: safeValue, id };
  const jsonStr = JSON.stringify(payload);
  return Buffer.from(jsonStr, "utf-8").toString("base64url");
}

/**
 * Decodes and validates an opaque Base64 cursor string.
 * Throws BadRequestError on malformed input.
 */
export function decodeCursor(cursorStr: string): DecodedCursor {
  try {
    const jsonStr = Buffer.from(cursorStr, "base64url").toString("utf-8");
    const payload = JSON.parse(jsonStr);

    if (
      !payload ||
      typeof payload !== "object" ||
      !("v" in payload) ||
      !("id" in payload) ||
      typeof payload.id !== "string"
    ) {
      throw new Error("Invalid cursor shape");
    }

    return payload as DecodedCursor;
  } catch {
    throw new BadRequestError("Malformed or invalid cursor parameter");
  }
}

/**
 * Parses and validates common pagination and sorting query parameters.
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  allowedSortFields: string[],
  defaultSortField: string,
  defaultOrder: "asc" | "desc" = "desc"
): PaginationParams {
  const rawLimit = searchParams.get("limit");
  const rawOffset = searchParams.get("offset");
  const rawCursor = searchParams.get("cursor");
  const rawSort = searchParams.get("sort");
  const rawOrder = searchParams.get("order");

  // Both cursor and offset present -> 400
  if (rawCursor !== null && rawOffset !== null) {
    throw new BadRequestError("Cannot specify both 'cursor' and 'offset' in the same request");
  }

  // Parse and clamp limit
  let limit = config.pagination.defaultLimit;
  if (rawLimit !== null) {
    const parsedLimit = parseInt(rawLimit, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
      throw new BadRequestError("Parameter 'limit' must be a positive integer");
    }
    limit = Math.min(parsedLimit, config.pagination.maxLimit);
  }

  // Parse offset
  let offset: number | undefined;
  if (rawOffset !== null) {
    const parsedOffset = parseInt(rawOffset, 10);
    if (Number.isNaN(parsedOffset) || parsedOffset < 0) {
      throw new BadRequestError("Parameter 'offset' must be a non-negative integer");
    }
    offset = parsedOffset;
  }

  // Parse cursor
  let decodedCursor: DecodedCursor | undefined;
  if (rawCursor !== null) {
    decodedCursor = decodeCursor(rawCursor);
  }

  // Validate sort field
  const sort = rawSort !== null ? rawSort : defaultSortField;
  if (!allowedSortFields.includes(sort)) {
    throw new BadRequestError(
      `Invalid sort field '${sort}'. Allowed fields: ${allowedSortFields.join(", ")}`
    );
  }

  // Validate order direction
  const order = (rawOrder !== null ? rawOrder.toLowerCase() : defaultOrder) as "asc" | "desc";
  if (order !== "asc" && order !== "desc") {
    throw new BadRequestError("Parameter 'order' must be either 'asc' or 'desc'");
  }

  return {
    limit,
    offset,
    cursor: rawCursor || undefined,
    decodedCursor,
    sort,
    order,
  };
}
