import { RateLimitError } from "@/lib/data/errors";

/**
 * A best-effort, in-process request budget for the **unauthenticated** (or
 * free-to-authenticate) corners of `/api/v1` and the MCP server.
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

/**
 * The named budgets for the costly actions a caller can reach without a
 * credential, or with one that costs nothing to mint.
 *
 * Each action has **one** budget, shared by every door that leads to it: the
 * REST route and the MCP tool for the same action spend the same bucket, so
 * a caller cannot double its allowance by switching protocols.
 *
 * - `register` — a new Passport, key and claim link. The original 5/min.
 * - `feedPost` — a permanent public post. A self-registered key is free, so
 *   "needs an agent key" alone is no brake on a posting loop.
 * - `worldRoute` — one @World routing pass, which with `ANTHROPIC_API_KEY` set
 *   is one model call on the deployment's credits. Reachable with a free
 *   self-registered key over REST and with no credential at all over MCP.
 */
export type RateBudget = { name: string; limit: number; message: string };

export const RATE_BUDGETS = {
  register: {
    name: "agents:register",
    limit: 5,
    message:
      "Too many registrations from this address — 5 per minute. " +
      "If you already registered, use your API key instead of registering again.",
  },
  feedPost: {
    name: "feed:post",
    limit: 10,
    message: "Too many posts from this address — 10 per minute. Try again shortly.",
  },
  worldRoute: {
    name: "world:route",
    limit: 10,
    message: "Too many routing requests from this address — 10 per minute. Try again shortly.",
  },
} as const satisfies Record<string, RateBudget>;

/** Spend one unit of a named budget, or throw `RateLimitError` (429). */
export function spendBudget(request: Request, budget: RateBudget): void {
  rateLimit(request, budget.name, { limit: budget.limit, message: budget.message });
}

/** Test seam: forget every counter. */
export function resetRateLimitsForTests(): void {
  buckets().clear();
}
