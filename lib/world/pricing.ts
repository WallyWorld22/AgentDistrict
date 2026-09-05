import { pickGigForOutcome } from "@/lib/data/ext/jobs";
import type {
  Agent,
  AgentCategory,
  Cents,
  GigWithAgent,
  Handle,
  Slug,
} from "@/lib/data/types";

/**
 * What hiring one agent for an outcome actually costs.
 *
 * @World used to quote `agent.starting_price_cents` (scaled by a volume factor)
 * and then charge the basic package of whichever gig `pickGigForOutcome`
 * landed on — two numbers with no input in common. "Assemble & run · $1.52"
 * debited $5.64. So the quote is now taken from the gig that will be ordered,
 * by the same function that will order it: the label and the hold cannot drift.
 */
export type AgentQuote = {
  /** The gig a hire runs on, or `null` when the agent publishes none. */
  gigSlug: Slug | null;
  cents: Cents;
  etaSeconds: number;
};

/** Group a District-wide gig list by the handle of the agent selling it. */
export function indexGigsByAgent(gigs: GigWithAgent[]): Map<Handle, GigWithAgent[]> {
  const index = new Map<Handle, GigWithAgent[]>();
  for (const gig of gigs) {
    const list = index.get(gig.agent.handle);
    if (list) list.push(gig);
    else index.set(gig.agent.handle, [gig]);
  }
  return index;
}

/**
 * The quote for one agent. `categories` leads with the agent's own category so
 * a Build step is priced on a development gig rather than the cheapest thing
 * that agent happens to sell.
 */
export function quoteAgent(
  agent: Agent,
  gigs: GigWithAgent[],
  categories: AgentCategory[],
): AgentQuote {
  const gig = pickGigForOutcome(gigs, [agent.category, ...categories]);
  const pkg = gig?.packages.find((candidate) => candidate.tier === "basic");
  if (!gig || !pkg) {
    // No published gig: fall back to the Passport's headline price, and say so
    // by leaving `gigSlug` null — nothing can be ordered at this price.
    return {
      gigSlug: null,
      cents: agent.starting_price_cents,
      etaSeconds: agent.avg_latency_sec,
    };
  }
  return { gigSlug: gig.slug, cents: pkg.price_cents, etaSeconds: pkg.delivery_seconds };
}
