import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { errorMessage, log } from "./log";

type LocalBucket = { count: number; resetAt: number };
const localBuckets = new Map<string, LocalBucket>();

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
  /** "shared" = PostgreSQL counter (all instances), "local" = per-process fallback. */
  source: "shared" | "local";
};

function localLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = localBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    localBuckets.set(key, { count: 1, resetAt: now + windowMs });
    if (localBuckets.size > 10_000) {
      for (const [id, value] of localBuckets) if (value.resetAt <= now) localBuckets.delete(id);
    }
    return { allowed: true, limit, remaining: limit - 1, retryAfter: 0, source: "local" };
  }
  if (bucket.count >= limit) {
    return { allowed: false, limit, remaining: 0, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)), source: "local" };
  }
  bucket.count += 1;
  return { allowed: true, limit, remaining: limit - bucket.count, retryAfter: 0, source: "local" };
}

/**
 * Fixed-window rate limit shared through PostgreSQL, so every web instance and
 * the monitoring worker count against the same budget. The window is claimed in
 * a single atomic upsert, which keeps concurrent instances correct.
 *
 * If the database is unreachable the limiter falls back to a per-process window
 * instead of failing the request: availability is preferred over strictness for
 * login and account recovery, and `source: "local"` reports the degradation.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count", "resetAt"
    `;
    const row = rows[0];
    if (!row) return localLimit(key, limit, windowMs);
    const allowed = row.count <= limit;
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - row.count),
      retryAfter: allowed ? 0 : Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - now.getTime()) / 1000)),
      source: "shared",
    };
  } catch (error) {
    log("warn", "rate_limit.shared_unavailable", { scope: key.split(":")[0], error: errorMessage(error) });
    return localLimit(key, limit, windowMs);
  }
}

/** Caller identity for a limiter key: the proxied client address when present. */
export function requestKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${scope}:${forwarded || "unknown"}`;
}

export function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(
    { error: "Too many attempts. Try again later." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(result.retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}
