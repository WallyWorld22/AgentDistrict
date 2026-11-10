import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/middleware";

/** A backslash, raw or percent-encoded, in either case. */
const BACKSLASHES = /(?:%5c|\\)+/gi;

/**
 * The address `pathname` was meant to be, or `null` when it has no backslash.
 *
 * Crawlers and scanners mangle links into `/jobs/<id>%5C`, `/tv%5C`, `/%5C`.
 * No route has a backslash in it, and on Vercel such a path does not even
 * reach the 404 page: it falls through to a Pages Router module lookup that
 * does not exist and answers 500 (prod-04). A trailing backslash is dropped
 * (`/tv%5C` → `/tv`), one inside the path becomes the `/` a browser would
 * have read it as (`/a%5Cb` → `/a/b`), and the result loses any trailing
 * slash so the redirect lands on the canonical address in one hop.
 */
export function withoutBackslashes(pathname: string): string | null {
  if (!pathname.match(BACKSLASHES)) return null;
  const cleaned = pathname
    .replace(new RegExp(`${BACKSLASHES.source}$`, "i"), "")
    .replace(BACKSLASHES, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

/**
 * Next.js 16 renamed Middleware to Proxy; the file convention is `proxy.ts` at
 * the project root (see node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
 *
 * It does two things. First, a path with a backslash in it is redirected to
 * the clean address (`withoutBackslashes`) — in both data modes, before
 * anything else runs. Then it refreshes the Supabase auth session, and only
 * when Supabase is actually configured: with no env vars set it is a plain
 * pass-through, so demo mode never pays for auth it does not have.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const clean = withoutBackslashes(request.nextUrl.pathname);
  if (clean !== null) {
    const target = request.nextUrl.clone();
    target.pathname = clean;
    return NextResponse.redirect(target, 308);
  }
  if (!isSupabaseConfigured()) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, image optimizer output, common icon,
     * image and font files, and part of the machine surface: `.well-known/*`,
     * `llms.txt`, `skill.md` and `openapi.json`. The rest of it —
     * `llms-full.txt`, `robots.txt`, `sitemap.xml`, the IndexNow key file, the
     * Open Graph image routes and every `/api/*` route — still goes through
     * the session refresh when Supabase is configured.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|\\.well-known|llms\\.txt|skill\\.md|openapi\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
