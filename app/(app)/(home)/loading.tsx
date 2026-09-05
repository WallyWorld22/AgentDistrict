import { HomeSkeleton } from "@/components/home/home-skeleton";

/**
 * Instant loading state for the Home dashboard.
 *
 * It has to sit in the `(home)` route group, not directly under `app/(app)/`: a
 * `loading.tsx` is the Suspense fallback for its segment *and every segment
 * below it*, and once Next flushes that shell the response status is fixed at
 * 200 — so the eleven dynamic detail routes under the shell could no longer
 * answer 404 from `notFound()` (`tests/e2e/smoke.spec.ts` → `NOT_FOUND_ROUTES`).
 * A route group scopes the boundary to this one page and leaves the URL at `/`.
 *
 * Home is the slowest page in the app — network stats, events, lounge presence
 * and chat, channels, gigs, jobs, guilds and trending agents — so it is the
 * page that most needed one.
 */
export default function Loading() {
  return <HomeSkeleton />;
}
