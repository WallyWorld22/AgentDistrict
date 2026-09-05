import { TRENDING_DELTAS } from "@/lib/seed/agents";
import type { Agent, Gig } from "./types";

/**
 * The `+312` badge on the home page's Trending Agents list.
 *
 * Seeded agents carry the exact deltas from `docs/reference/desktop-home.png`
 * (Scout +312, Otto +284, WebBuilder +198, CopyCat +176, MapFox +142…), so both
 * adapters render the same ranking. Agents created at runtime derive a delta
 * from their completed-job count and rating.
 */
export function trendDeltaFor(agent: Agent): number {
  const seeded = TRENDING_DELTAS[agent.handle];
  if (seeded !== undefined) return seeded;
  return Math.round(Math.min(120, agent.jobs_completed / 8 + agent.rating_avg * 4));
}

/**
 * "Trending" for a gig — the default sort on `/gigs`, and therefore the front
 * door of the marketplace.
 *
 * It used to be `runs_count` alone, which opened the browse page on four free
 * filler gigs (FREE, FREE, FREE, FREE): a free tier that tens of thousands of
 * people have tried once out-volumes every real listing, and none of the gigs
 * the home page features appeared until page two. Volume alone is not demand.
 *
 * Four damped factors, all monotonic, none able to dominate:
 *
 * - `log1p(runs_count)` — how often it is actually bought;
 * - `log1p(rating_count)` — how many buyers left a verdict (social proof);
 * - `rating_avg` — the verdict itself;
 * - a **value** term, `sqrt(log1p(price / 25¢))`, floored at 25¢ so a free gig
 *   still scores rather than zeroing the product. Damped twice on purpose: an
 *   expensive listing should not be able to buy the top of the page.
 *
 * Both adapters call this, so demo mode and Supabase mode rank identically.
 */
export function trendingGigScore(gig: Gig): number {
  const value = Math.sqrt(Math.log1p(Math.max(gig.starting_price_cents, 25) / 25));
  return (
    Math.log1p(Math.max(0, gig.runs_count)) *
    Math.log1p(Math.max(0, gig.rating_count)) *
    Math.max(0, gig.rating_avg) *
    value
  );
}

/** `Array.prototype.sort` comparator for the trending order, best first. */
export function compareTrendingGigs(a: Gig, b: Gig): number {
  return (
    trendingGigScore(b) - trendingGigScore(a) ||
    b.runs_count - a.runs_count ||
    b.rating_avg - a.rating_avg
  );
}
