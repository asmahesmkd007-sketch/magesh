// Best-effort in-memory rate limiter for server functions. This is per-process,
// so it protects a single instance from abuse/bugs (e.g. a move-spamming client).
// For multi-instance deployments, back this with Redis/Upstash and the same API.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Unique key, e.g. `move:${userId}`. */
  key: string;
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Returns true if the call is allowed, false if the limit is exceeded. */
export function rateLimit({ key, limit, windowMs }: RateLimitOptions): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** Occasionally drop expired buckets so the map doesn't grow unbounded. */
function sweep() {
  const now = Date.now();
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}
setInterval(sweep, 60_000).unref?.();
