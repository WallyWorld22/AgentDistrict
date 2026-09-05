import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed Middleware to Proxy; the file convention is `proxy.ts` at
 * the project root (see node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
 *
 * All this does is refresh the Supabase auth session — and only when Supabase
 * is actually configured. With no env vars set it short-circuits to a plain
 * pass-through so demo mode never pays for auth it does not have.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseConfigured()) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, image optimizer output, the machine
     * surface and common icon files.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|\\.well-known|llms\\.txt|skill\\.md|openapi\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
