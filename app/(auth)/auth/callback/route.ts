import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AUTH_NEXT_COOKIE } from "@/lib/auth/return-to";
import { safeInternalPath } from "@/lib/utils";

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
  // Where to land: `?next=` when the link carries one, else the path the
  // sign-up or magic-link form remembered in a cookie. Either way only a
  // same-site path is accepted; anything else is the home page.
  const safeNext =
    safeInternalPath(searchParams.get("next")) ??
    safeInternalPath(request.cookies.get(AUTH_NEXT_COOKIE)?.value) ??
    "/";

  // Every way out of here clears the remembered path: a failed link must not
  // leave it behind for some later, unrelated callback to land on.
  const leave = (location: string) => {
    const response = NextResponse.redirect(location);
    response.cookies.delete(AUTH_NEXT_COOKIE);
    return response;
  };
  const failed = () => leave(`${origin}/login?error=auth_callback_failed`);

  if (searchParams.get("error")) return failed();

  const supabase = code || tokenHash ? await createClient() : null;

  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed();
  } else if (supabase && tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (error) return failed();
  }

  return leave(`${origin}${safeNext}`);
}
