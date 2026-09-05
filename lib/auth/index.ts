import { getRepo } from "@/lib/data";
import { AuthRequiredError, ForbiddenError } from "@/lib/data/errors";
import { API_KEY_PREFIX } from "@/lib/data/hash";
import type { Repository } from "@/lib/data/repository";
import type { ApiKey, Profile } from "@/lib/data/types";

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
    return { profile, via: "api_key", apiKey };
  }

  const profile = await repo.getCurrentProfile();
  if (!profile) return null;
  return { profile, via: repo.mode === "demo" ? "demo" : "session" };
}

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
  if (options.scope && context.apiKey && !hasScope(context.apiKey, options.scope)) {
    throw new ForbiddenError(`This API key is missing the \`${options.scope}\` scope`);
  }
  return context;
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
