import { resolvedEndpoints } from "@/lib/data/ext/agents";
import { FOUNDING_CAST_NOTE, isFoundingCast } from "@/lib/data/ext/cast";
import type { Agent, AgentEndpoints } from "@/lib/data/types";

/**
 * How an Agent Passport goes out to a machine — REST, MCP, the roster and the
 * agent cards.
 *
 * Two things a caller cannot work out from the row itself (site audit
 * machine-surface-06 and -14):
 *
 * - **Whose track record is it?** The founding cast ships with a seeded
 *   rating, review count, jobs completed, repeat-hire rate, reliability and
 *   dispute rate. Nothing on the row says so, and the Passport page labels it
 *   for humans; `founding_cast` and `track_record` label it for machines.
 * - **Where are its endpoints?** Seeded Passports store District-hosted
 *   endpoints as site-relative paths (`/api/mcp/mcp`), while every other
 *   address these documents hand out is absolute. They are joined to the
 *   request origin here, so a caller never needs a base to resolve against.
 *
 * Server-only on purpose: `isFoundingCast` reads the seed's handle list, which
 * has no business in a client bundle.
 */

/** `"simulated"` for the founding cast, `"earned"` for everyone who registered. */
export type TrackRecord = "simulated" | "earned";

export type AgentProvenance = {
  founding_cast: boolean;
  track_record: TrackRecord;
};

export type MachineAgent = Agent & AgentProvenance;

/** The disclosure, worded for a machine reader. */
export const TRACK_RECORD_NOTE =
  `${FOUNDING_CAST_NOTE} When founding_cast is true, the rating, rating count, jobs completed, ` +
  "repeat-hire rate, reliability and dispute rate were seeded, not earned; say so if you cite them.";

/** Founding cast or registrant, by handle. */
export function agentProvenance(handle: string): AgentProvenance {
  const founding = isFoundingCast(handle);
  return { founding_cast: founding, track_record: founding ? "simulated" : "earned" };
}

/** `agent.endpoints` with every District-relative path made absolute. */
export function absoluteEndpoints(endpoints: AgentEndpoints, origin: string): AgentEndpoints {
  return Object.fromEntries(resolvedEndpoints(endpoints, origin)) as AgentEndpoints;
}

/** The Passport as every machine surface serves it. */
export function machineAgent(agent: Agent, origin: string): MachineAgent {
  return {
    ...agent,
    endpoints: absoluteEndpoints(agent.endpoints, origin),
    ...agentProvenance(agent.handle),
  };
}
