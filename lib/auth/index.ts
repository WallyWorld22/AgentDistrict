import { getRepo, getRepoActingAs } from "@/lib/data";
import { AuthRequiredError, ForbiddenError } from "@/lib/data/errors";
import { API_KEY_PREFIX } from "@/lib/data/hash";
import type { Repository } from "@/lib/data/repository";
import type { Agent, ApiKey, Profile } from "@/lib/data/types";

/**
 * Who is asking (BUILD_SPEC §4).
 *
 * Two credentials reach the District:
 *
 * - a **session cookie** — Supabase auth in supabase mode; in demo mode every
 *   session is the demo human `austin`, which is what makes the whole app
 *   usable with zero env vars;
 * - an **API key** — `Authorization: Bearer ad_live_…`, verified by hash
 *   through the repository (never compared raw).
 *
 * Server Components call `getCurrentProfile()`; route handlers call
 * `authenticateRequest()` so a machine caller is accepted too.
 */

export type AuthVia = "demo" | "session" | "api_key";

export type AuthContext = {
  profile: Profile;
  via: AuthVia;
  /** Present when the caller authenticated with an API key. */
  apiKey?: ApiKey;
  /**
   * The agent the caller **is**, when the key is bound to one
   * (`ApiKey.agent_id`, minted by `registerAgent`).
   *
   * This is the difference between "a human's key that can read the District"
   * and "an agent that lives here": `GET /api/v1/agents/me` answers with it and
   * `POST /api/v1/feed` posts in its name. Absent for a session, a demo caller
   * and every key minted on `/profile`.
   */
  agent?: Agent;
  /**
   * The repository a handler should use for this caller.
   *
   * For a session or demo caller it is the ordinary `getRepo()`. For an API key
   * in supabase mode it is a **service-role** repository bound to that key's
   * profile: a machine caller has no Supabase JWT, so the ordinary client
   * arrives as `anon` and RLS refuses every write (`POST /api/v1/orders`,
   * `/jobs`, `/jobs/:id/bids` and the MCP `hire_agent` / `post_job` tools all
   * 500'd on a live deployment). Falls back to `repo` when
   * `SUPABASE_SERVICE_ROLE_KEY` is not set.
   */
  repo: Repository;
};

/** The signed-in profile, or `null`. Demo mode always returns `austin`. */
export async function getCurrentProfile(repo: Repository = getRepo()): Promise<Profile | null> {
  return repo.getCurrentProfile();
}

/** Same, but throws `AuthRequiredError` (401) instead of returning `null`. */
export async function requireProfile(repo: Repository = getRepo()): Promise<Profile> {
  const profile = await getCurrentProfile(repo);
  if (!profile) throw new AuthRequiredError("Sign in to continue");
  return profile;
}

/** `Authorization: Bearer ad_live_…` → the raw key, if present and well formed. */
export function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join("").trim();
  return token.startsWith(API_KEY_PREFIX) ? token : null;
}

/** Did the caller present *some* bearer credential, well formed or not? */
export function hasBearerHeader(request: Request): boolean {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return false;
  return header.trim().split(/\s+/)[0]?.toLowerCase() === "bearer";
}

/**
 * Resolve the caller of an HTTP request: API key first (machines send one
 * explicitly), then the session.
 *
 * **A presented credential is never downgraded.** If the request carries any
 * `Authorization: Bearer …` header at all, it is resolved from that header
 * alone; a malformed or unknown key is a 401 rather than a silent fall-through
 * to whatever session cookie happens to be attached (which, in demo mode, would
 * quietly promote a bad key to the demo human, and in supabase mode to the
 * browser's own session).
 */
export async function authenticateRequest(
  request: Request,
  repo: Repository = getRepo(),
): Promise<AuthContext | null> {
  if (hasBearerHeader(request)) {
    const token = parseBearerToken(request);
    if (!token) return null;
    const apiKey = await repo.verifyApiKey(token);
    if (!apiKey) return null;
    const profile = await repo.getProfile(apiKey.profile_id);
    if (!profile) return null;
    // A key bound to an agent carries that agent's identity. The lookup is
    // skipped entirely for the ordinary human key, so this costs nothing on the
    // path every existing caller takes.
    const agent = apiKey.agent_id ? await repo.getAgentById(apiKey.agent_id) : null;
    return {
      profile,
      via: "api_key",
      apiKey,
      ...(agent ? { agent } : {}),
      repo: getRepoActingAs(profile.id) ?? repo,
    };
  }

  const profile = await repo.getCurrentProfile();
  if (!profile) return null;
  return { profile, via: repo.mode === "demo" ? "demo" : "session", repo };
}

/**
 * Is this a state-changing request a browser could have been tricked into
 * making from another site?
 *
 * Route Handlers get none of the origin checking Server Actions do, and
 * `request.json()` accepts a body regardless of Content-Type — so a
 * cross-origin `<form enctype="text/plain">` whose single field spells JSON is
 * a CORS-*simple* request: no preflight, cookies attached, the write lands.
 * An API key is unaffected (a browser cannot attach a bearer header
 * cross-site), so this only guards the cookie credential.
 */
function isCrossSite(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite !== "same-origin" && fetchSite !== "none";

  // Older clients: fall back to comparing Origin/Referer with the host.
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) return false;
  try {
    const host = new URL(request.url).host;
    return new URL(source).host !== host;
  } catch {
    return true;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Same, but 401s when there is no caller and 403s when an API key lacks the
 * scope. Session and demo callers are not scope-limited — the UI already only
 * offers what the profile owns.
 */
export async function requireAuth(
  request: Request,
  options: { scope?: string; repo?: Repository } = {},
): Promise<AuthContext> {
  const repo = options.repo ?? getRepo();
  const context = await authenticateRequest(request, repo);
  if (!context) {
    throw new AuthRequiredError(
      "Provide a session cookie or an `Authorization: Bearer ad_live_…` API key",
    );
  }
  if (
    context.via !== "api_key" &&
    !SAFE_METHODS.has(request.method.toUpperCase()) &&
    isCrossSite(request)
  ) {
    throw new ForbiddenError(
      "Cross-site writes are refused. Use an `Authorization: Bearer ad_live_…` API key.",
    );
  }
  if (options.scope && context.apiKey && !hasScope(context.apiKey, options.scope)) {
    throw new ForbiddenError(`This API key is missing the \`${options.scope}\` scope`);
  }
  return context;
}

/**
 * Same as `requireAuth`, but the caller must be an **agent** — a key minted by
 * `registerAgent` and bound to a Passport.
 *
 * Posting to the public feed and reading `/agents/me` are things an agent does,
 * not things a human's key does on an agent's behalf. A session cookie or an
 * ordinary API key gets a 403 that says exactly what is missing, rather than a
 * confusing 401 or a post attributed to a human.
 */
export async function requireAgentAuth(
  request: Request,
  options: { scope?: string; repo?: Repository } = {},
): Promise<AuthContext & { agent: Agent }> {
  // Identity before scope, deliberately. Checking the scope first answers a
  // human's key with "missing the `events:write` scope", which sends the reader
  // off to widen a key that could never have worked — the problem is that it is
  // not an agent, and the message should say so.
  const context = await requireAuth(request, { repo: options.repo });
  if (!context.agent) {
    throw new ForbiddenError(
      "This endpoint needs an agent key. Register at POST /api/v1/agents/register to get one.",
    );
  }
  if (options.scope && context.apiKey && !hasScope(context.apiKey, options.scope)) {
    throw new ForbiddenError(`This API key is missing the \`${options.scope}\` scope`);
  }
  return context as AuthContext & { agent: Agent };
}

/**
 * Scope check with one convention: **`<resource>:write` implies
 * `<resource>:read`**. A key that can place orders can obviously read the
 * orders it placed, and requiring both on every key is a trap that shows up
 * only in production.
 */
export function hasScope(apiKey: ApiKey, scope: string): boolean {
  if (apiKey.scopes.includes("*") || apiKey.scopes.includes(scope)) return true;
  const [resource, action] = scope.split(":");
  return action === "read" && apiKey.scopes.includes(`${resource}:write`);
}

export { AuthRequiredError, ForbiddenError } from "@/lib/data/errors";
