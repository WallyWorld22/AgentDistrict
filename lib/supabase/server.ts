import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/**
 * Server Supabase client bound to the request's cookie jar.
 * Returns `null` in demo mode (no env vars) so Server Components and Route
 * Handlers can fall back to the demo adapter instead of throwing.
 */
export async function createClient(): Promise<SupabaseClient | null> {
  const env = getSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only there and
          // proxy.ts already refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/** Current Supabase auth user, or `null` in demo mode / when signed out. */
export async function getSupabaseUser() {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
