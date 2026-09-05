import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

/**
 * Refreshes the Supabase auth session on every matched request and forwards
 * the rotated cookies onto the response.
 *
 * In demo mode (no Supabase env vars) this is a **no-op**: it returns
 * `NextResponse.next()` without importing a client or touching cookies, so the
 * app runs with zero configuration (BUILD_SPEC §1).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const env = getSupabaseEnv();
  if (!env) return NextResponse.next({ request });

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
  try {
    await supabase.auth.getUser();
  } catch {
    // Never let an auth hiccup take down a page render.
  }

  return response;
}
