import { NextRequest } from "next/server";
import { config } from "../config";
import { RateLimitedError } from "../http/errors";

/**
 * In-memory sliding window rate limiter.
 * Governance: PRD §9, security.md rules 1-2, coding-standards.md rule 8.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const ipStore = new Map<string, RateLimitRecord>();

/**
 * Extracts client IP from request headers.
 */
export function getClientIp(req: NextRequest | { headers: Headers }): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  headers: Record<string, string>;
}

/**
 * Checks and updates rate limit for a client IP.
 * Throws RateLimitedError if limit exceeded.
 */
export function checkRateLimit(req: NextRequest | { headers: Headers; url?: string }): RateLimitResult {
  // Exclude /health endpoint from rate limiting per PRD §9
  if ("url" in req && req.url) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/health" || pathname === "/api/health") {
      return {
        allowed: true,
        limit: config.rateLimit.maxRequests,
        remaining: config.rateLimit.maxRequests,
        resetSeconds: Math.ceil(Date.now() / 1000) + config.rateLimit.windowSeconds,
        headers: {},
      };
    }
  }

  const ip = getClientIp(req);
  const now = Date.now();
  const windowMs = config.rateLimit.windowSeconds * 1000;
  const cutoff = now - windowMs;

  let record = ipStore.get(ip);
  if (!record) {
    record = { timestamps: [] };
    ipStore.set(ip, record);
  }

  // Purge timestamps older than window
  record.timestamps = record.timestamps.filter((ts) => ts > cutoff);

  const limit = config.rateLimit.maxRequests;
  const currentCount = record.timestamps.length;
  const remaining = Math.max(0, limit - currentCount - 1);

  // Compute reset time (seconds until window expires for oldest timestamp)
  const oldestTimestamp = record.timestamps[0] || now;
  const resetMs = oldestTimestamp + windowMs;
  const resetSeconds = Math.ceil((resetMs - now) / 1000);
  const retryAfterSeconds = Math.max(1, resetSeconds);

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(resetMs / 1000).toString(),
  };

  if (currentCount >= limit) {
    headers["Retry-After"] = retryAfterSeconds.toString();
    throw new RateLimitedError(retryAfterSeconds, "Rate limit exceeded. Try again later.");
  }

  record.timestamps.push(now);

  return {
    allowed: true,
    limit,
    remaining,
    resetSeconds,
    headers,
  };
}
