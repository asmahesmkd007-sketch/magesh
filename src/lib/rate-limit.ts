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

// ── Cooldowns ────────────────────────────────────────────────────────
// A rate limit answers "has this caller had too many turns?" and spends a
// turn to find out. A cooldown answers a different question — "how long
// until the next one?" — and must not spend anything to answer it.
//
// Using rateLimit({ limit: 1 }) as a cooldown conflates the two, and the
// bug that falls out is specific: the turn is spent when the request
// *starts*, so a request that then fails has still burnt the window. The
// user retries and is told to wait instead of being shown the real error.
// A cooldown spaces out the thing that actually happened, so recording it
// belongs *after* that thing succeeds — hence check and mark are separate
// calls, and nothing here is implicit.

const cooldowns = new Map<string, number>();

/** How long is left on `key`, in ms. Zero when free. Never records. */
export function cooldownRemainingMs(key: string, windowMs: number): number {
  const last = cooldowns.get(key);
  if (last === undefined) return 0;
  const remaining = last + windowMs - Date.now();
  return remaining > 0 ? remaining : 0;
}

/** Record that the throttled event just happened. Call it on success. */
export function markCooldown(key: string): void {
  cooldowns.set(key, Date.now());
}

/** Drop a cooldown early (tests, or an explicit "let them retry"). */
export function clearCooldown(key: string): void {
  cooldowns.delete(key);
}

/**
 * Entries older than this are unreachable: every caller passes a window far
 * shorter, so anything this stale can only read as "free" anyway.
 */
const COOLDOWN_MAX_AGE_MS = 60 * 60 * 1000;

/** Occasionally drop expired buckets so the maps don't grow unbounded. */
function sweep() {
  const now = Date.now();
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  for (const [k, at] of cooldowns) if (now - at >= COOLDOWN_MAX_AGE_MS) cooldowns.delete(k);
}
setInterval(sweep, 60_000).unref?.();
