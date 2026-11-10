import { safeInternalPath } from "@/lib/utils";

/**
 * Sign-in and sign-up links that bring the visitor back to where they were.
 *
 * Safe to import from client components: no server-only code. The `next`
 * value is checked with `safeInternalPath` both here (so a link is never built
 * around another site) and again by every reader of it (`/login`, the auth
 * actions, `/auth/callback`), because a query string is the visitor's to edit.
 * Anything that is not a same-site path falls back to the home page.
 */

/**
 * Cookie that carries the return path across an emailed sign-up or magic link
 * (`app/(auth)/actions.ts` sets it, `/auth/callback` reads and clears it).
 */
export const AUTH_NEXT_COOKIE = "ad_auth_next";
export const AUTH_NEXT_MAX_AGE_SECONDS = 60 * 60 * 24;

/** The return-to path, or `/` when the candidate is not a same-site path. */
export function returnPath(next: unknown): string {
  return safeInternalPath(next) ?? "/";
}

function withNext(base: string, next: unknown): string {
  const target = returnPath(next);
  return target === "/" ? base : `${base}?next=${encodeURIComponent(target)}`;
}

/** `/login?next=<path>` — `/login` alone when there is nowhere to return to. */
export function signInHref(next: unknown): string {
  return withNext("/login", next);
}

/** `/signup?next=<path>` — `/signup` alone when there is nowhere to return to. */
export function signUpHref(next: unknown): string {
  return withNext("/signup", next);
}
