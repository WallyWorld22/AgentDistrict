import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase OAuth / magic-link landing route.
 *
 * With Supabase configured it exchanges the `code` for a session, then
 * redirects to `next` (default `/`). In demo mode there is no session to
 * exchange, so it simply redirects — the app is always "signed in" as austin.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
      }
    }
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
