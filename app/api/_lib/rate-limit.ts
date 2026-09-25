import { RateLimitError } from "@/lib/data/errors";

/**
 * A best-effort, in-process request budget for the **unauthenticated** corners
 * of `/api/v1`.
 *
 * `POST /api/v1/agents/register` takes no credential — that is the whole point
 * of a front door a stranger can walk through — so the only thing between it
 * and a thousand junk Passports is a per-IP budget.
 *
 * Deliberately honest about what it is:
 *
 * - **In-process.** Each serverless instance keeps its own counter, so the real
 *   ceiling is `limit × instances`. It stops a loop, not a botnet; a deployment
 *   that needs a real limiter puts one in front (Vercel's, or a KV store).
 * - **A fixed window.** A caller can spend one window's budget at the end of a
 *   window and the next one's at the start. For "five registrations a minute"
 *   that is fine and it costs one integer per caller.
 * - **Memory-bounded.** Expired buckets are swept on write, and the map is
 *   capped, so a spray of one-request-each IPs cannot grow it without limit.
 */

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 5_000;

/**
 * The buckets live on `globalThis` for the same reason the demo repository
 * does: Next emits this module into more than one server bundle, and a
 * module-scoped `Map` would give each bundle its own budget.
 */
const SLOT = Symbol.for("agentdistrict.rateLimitBuckets");
type LimiterGlobal = { [SLOT]?: Map<string, Bucket> };
const limiterGlobal = globalThis as unknown as LimiterGlobal;

function buckets(): Map<string, Bucket> {
  return (limiterGlobal[SLOT] ??= new Map());
}

function sweep(store: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
  // Still full after a sweep: every bucket is live, so drop the oldest few
  // rather than grow without bound. Losing a counter fails *open* for that
  // caller, which is the right way for a best-effort limiter to break.
  if (store.size > MAX_BUCKETS) {
    const excess = store.size - MAX_BUCKETS;
    let dropped = 0;
    for (const key of store.keys()) {
      store.delete(key);
      if (++dropped >= excess) break;
    }
  }
}

/**
 * The caller's IP, as far as it can be known behind a proxy.
 *
 * `x-forwarded-for` is a client-controlled header everywhere except behind a
 * proxy that rewrites it (Vercel does). The **first** entry is the client; the
 * rest are hops. On a deployment without a trusted proxy this is spoofable —
 * which is exactly why this limiter is a speed bump and not an access control.
 */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Spend one unit of `name`'s budget for this caller, or throw `RateLimitError`
 * (429, with a `Retry-After`).
 */
export function rateLimit(
  request: Request,
  name: string,
  options: { limit?: number; windowMs?: number; message?: string } = {},
): void {
  const limit = options.limit ?? 5;
  const windowMs = options.windowMs ?? WINDOW_MS;
  const now = Date.now();
  const store = buckets();
  sweep(store, now);

  const key = `${name}:${callerKey(request)}`;
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new RateLimitError(
      options.message ??
        `Too many requests — this endpoint allows ${limit} per minute. Try again in ${retryAfter}s.`,
      retryAfter,
    );
  }
}

/** Test seam: forget every counter. */
export function resetRateLimitsForTests(): void {
  buckets().clear();
}
