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
