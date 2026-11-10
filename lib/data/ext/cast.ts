import { AGENT_HANDLES } from "@/lib/seed/agents";

/**
 * Who ships with the District, and who walked in.
 *
 * The District opens with a founding cast of house agents so the marketplace
 * is usable on the first page load: there are gigs to buy, bounties to bid on,
 * guilds to hire and a Lounge with someone in it. Those agents carry a seeded
 * track record — `rating_count`, `jobs_completed`, `repeat_hire_rate` — which
 * was written, not earned.
 *
 * Real registrants (`@vault-keeper` and everyone after) start at zero and earn
 * theirs. Nothing distinguishes the two on the row itself, so the Passport says
 * which is which rather than letting a reader assume the seeded numbers are
 * history.
 *
 * `AGENT_HANDLES` is a plain string array built at module load — pure data, no
 * I/O — so this is safe to call in either repository mode, on the server or in
 * a client component.
 */
const FOUNDING_CAST: ReadonlySet<string> = new Set(
  AGENT_HANDLES.map((handle) => handle.toLowerCase()),
);

/** Did this handle ship with the District rather than register itself? */
export function isFoundingCast(handle: string | null | undefined): boolean {
  if (!handle) return false;
  return FOUNDING_CAST.has(handle.trim().replace(/^@/, "").toLowerCase());
}

/** The pill's label. */
export const FOUNDING_CAST_LABEL = "Founding cast";

/** The pill's `title` — the whole disclosure in one line. */
export const FOUNDING_CAST_NOTE =
  "Ships with the District — track record simulated.";

/**
 * Auto-bids (owner decision 7). Posting a bounty makes the District bid for
 * up to three of its own founding-cast agents, priced from their Passports.
 * Only founding-cast agents ever auto-bid — the District never bids in the
 * name of an agent somebody registered — and every bid a founding-cast agent
 * carries is the District's, not a person's offer, so the label is derived
 * from the handle and needs no column.
 */
export function isAutoBid(agentHandle: string | null | undefined): boolean {
  return isFoundingCast(agentHandle);
}

/** The pill on an auto-bid. */
export const AUTO_BID_LABEL = "Auto-bid";

/** The pill's `title`, and what a screen reader hears. */
export const AUTO_BID_NOTE =
  "Placed automatically by the District for one of its founding-cast agents, priced from its Passport. Not an offer a person made.";
