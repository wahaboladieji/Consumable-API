import { NextResponse } from "next/server";
import { AppError, ValidationErrorDetail } from "./errors";

/**
 * Standard HTTP response envelopes.
 * Governance: PRD §6.1 & §6.2, AGENTS.md §4, coding-standards.md rule 6.
 */

export interface CollectionMeta {
  limit: number;
  total?: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface SingleMeta {}

/**
 * Recursively converts BigInt and Prisma Decimal values to standard JS Numbers for JSON serialization.
 */
function serializeBigInt<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") {
    return Number(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt) as unknown as T;
  }
  if (typeof obj === "object" && !(obj instanceof Date)) {
    if (typeof (obj as any).toNumber === "function") {
      return (obj as any).toNumber() as unknown as T;
    }
    const res: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      res[key] = serializeBigInt(value);
    }
    return res as T;
  }
  return obj;
}

function mergeCorsHeaders(headers?: Record<string, string>): Headers {
  const h = new Headers(headers || {});
  if (!h.has("Access-Control-Allow-Origin")) {
    h.set("Access-Control-Allow-Origin", "*");
  }
  if (!h.has("Access-Control-Allow-Methods")) {
    h.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  }
  if (!h.has("Access-Control-Allow-Headers")) {
    h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  return h;
}

/**
 * Builds a byte-for-byte standard success response envelope per PRD §6.1.
 */
export function buildSuccess<T>(
  data: T,
  meta: CollectionMeta | SingleMeta = {},
  status = 200,
  headers?: Record<string, string>
): NextResponse {
  const serializedData = serializeBigInt(data);
  const serializedMeta = serializeBigInt(meta);

  return NextResponse.json(
    {
      data: serializedData,
      meta: serializedMeta,
    },
    {
      status,
      headers: mergeCorsHeaders(headers),
    }
  );
}

/**
 * Builds a byte-for-byte standard error response envelope per PRD §6.2.
 */
export function buildError(
  code: string,
  message: string,
  status: number,
  details?: ValidationErrorDetail[],
  headers?: Record<string, string>
): NextResponse {
  const errorObj: {
    code: string;
    message: string;
    details?: ValidationErrorDetail[];
  } = {
    code,
    message,
  };

  if (details && details.length > 0) {
    errorObj.details = details;
  }

  return NextResponse.json(
    {
      error: errorObj,
    },
    {
      status,
      headers: mergeCorsHeaders(headers),
    }
  );
}

/**
 * Helper to handle thrown errors uniformly across all routes.
 */
export function handleApiError(error: unknown, headers?: Record<string, string>): NextResponse {
  if (error instanceof AppError) {
    return buildError(error.code, error.message, error.statusCode, error.details, headers);
  }

  console.error("Unhandled API Error:", error);
  return buildError("INTERNAL_ERROR", "An internal server error occurred", 500, undefined, headers);
}
