import { TRENDING_DELTAS } from "@/lib/seed/agents";
import type { Agent } from "./types";

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
