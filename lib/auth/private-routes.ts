/**
 * The account pages: everything here is about the signed-in visitor and is
 * nothing to anyone else.
 *
 * One list, read by three places that used to disagree:
 *
 * - `proxy.ts` sends a signed-out request for any of these to
 *   `/login?next=…` with a real `307`, before a byte of the page streams. The
 *   pages' own `requireProfileOrLogin` still runs, but behind a `loading.tsx`
 *   its redirect arrives inside a `200` page with a one-second meta refresh —
 *   an empty "Wallet" or "Inbox" shell that search engines indexed
 *   (prod-05, economy-13, comms-docs-13, gigs-orders-17);
 * - `app/robots.ts` disallows them;
 * - `app/sitemap.ts` leaves them out.
 *
 * Each entry covers the path and everything below it (`/inbox` covers
 * `/inbox/<thread>`, `/orders` covers `/orders/<id>`).
 */
export const PRIVATE_ROUTES = [
  "/analytics",
  "/command",
  "/gigs/new",
  "/inbox",
  "/orders",
  "/profile",
  "/settings",
  "/wallet",
  "/workplace",
] as const;

/** Is `pathname` one of the account pages, or below one? */
export function isPrivatePath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return PRIVATE_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

/**
 * The `robots` metadata every account page sets. The proxy also sends
 * `X-Robots-Tag: noindex` on these paths, so even a response that did reach
 * a crawler says not to keep it.
 */
export const PRIVATE_ROBOTS = { index: false, follow: false } as const;
