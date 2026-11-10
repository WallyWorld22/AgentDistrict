import { createServerClient } from "@supabase/ssr";
import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

export type SessionState = "signed_in" | "signed_out" | "unknown";

/** A 4xx (bar 429) from Supabase Auth: the token itself was refused (expired, revoked). */
function isClientAuthError(error: unknown): boolean {
  return (
    isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429
  );
}

/**
 * Refreshes the Supabase auth session on every matched request and forwards
 * the rotated cookies onto the response.
 *
 * Also reports what it learned: `signed_in`, `signed_out`, or `unknown` when
 * Supabase Auth could not be asked.
 *
 * In demo mode (no Supabase env vars) this is a **no-op**: it returns
 * `NextResponse.next()` without importing a client or touching cookies, so the
 * app runs with zero configuration (BUILD_SPEC §1).
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; session: SessionState }> {
  const env = getSupabaseEnv();
  if (!env) return { response: NextResponse.next({ request }), session: "unknown" };

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touching getUser() is what actually rotates an expired token.
  //
  // Its answer also tells the proxy whether to send a request for an account
  // page to sign in. Only a definite "no user" counts as signed out: a network
  // failure reaching Supabase Auth is `unknown`, and the page's own guard
  // decides, so a hiccup never bounces a signed-in visitor to `/login`.
  let session: SessionState = "unknown";
  try {
    const { data, error } = await supabase.auth.getUser();
    if (data?.user) session = "signed_in";
    else if (!error || isAuthSessionMissingError(error) || isClientAuthError(error)) {
      session = "signed_out";
    }
  } catch {
    // Never let an auth hiccup take down a page render.
  }

  return { response, session };
}
