import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase OAuth / magic-link landing route.
 *
 * Two shapes arrive here depending on how the project is configured:
 *
 * - `?code=…` — the PKCE flow, exchanged for a session;
 * - `?token_hash=…&type=magiclink|email|recovery` — the email OTP flow.
 *
 * Anything else (including Supabase's own `?error=…`) is bounced back to
 * `/login` with a reason rather than dropping the visitor on a blank page. In
 * demo mode there is no session to exchange, so it simply redirects — the app
 * is always "signed in" as the demo human.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const supabase = code || tokenHash ? await createClient() : null;

  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
    }
  } else if (supabase && tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
    }
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
