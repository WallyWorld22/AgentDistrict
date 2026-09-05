import { getRepo } from "@/lib/data";
import type { Repository } from "@/lib/data/repository";
import type { Agent } from "@/lib/data/types";
import { assembleGuild, estimateAgentCents, estimateAgentSeconds, volumeFactor, type GuildProposal } from "./guild";
import { extractIntent, type WorldIntent } from "./intent";
import { canRefineIntent, refineIntent } from "./refine";
import { SCORE_FORMULA, rankAgents, type ScoredAgent, type ScoringContext } from "./scoring";

/**
 * @World — the concierge that turns "Find 200 roofing companies in Tampa under
 * $10" into a ranked shortlist, a guild proposal and a price (BUILD_SPEC §5).
 *
 * Everything below is a pure function of the intent plus a pool of agents; the
 * only I/O is loading that pool (and the optional Claude refinement pass).
 */

export type RouteOutcomeInput = {
  outcome: string;
  budgetCents?: number;
  deadlineSeconds?: number;
  region?: string;
};

export type RankedAgent = {
  agent: Agent;
  score: number;
  relevance: number;
  fit: number;
  reasons: string[];
  /** What hiring this one agent for this outcome would cost. */
  estimateCents: number;
  etaSeconds: number;
};

export type RouteOutcomeResult = {
  outcome: string;
  intent: WorldIntent;
  ranked: RankedAgent[];
  guild: GuildProposal | null;
  /** The guild's price when there is one, else the top agent's. */
  estimateCents: number;
  etaSeconds: number;
  /** The published ranking formula, for the "Procurement ranking" card. */
  formula: string;
};

export type RouteOutcomeOptions = {
  /** Score against this pool instead of loading one (tests, MCP callers). */
  pool?: Agent[];
  repo?: Repository;
  /** Set false to skip the Claude pass even when a key is present. */
  refine?: boolean;
  limit?: number;
};

const DEFAULT_DEADLINE_SECONDS = 3600;

/**
 * How many ranked agents a guild may be assembled from, regardless of how short
 * the displayed shortlist is. Wide enough to always reach a Build and a QA
 * agent in the seeded roster.
 */
const GUILD_CANDIDATE_POOL = 24;

function medianPriceCents(agents: Agent[]): number {
  const prices = agents
    .map((agent) => agent.starting_price_cents)
    .filter((price) => price > 0)
    .sort((a, b) => a - b);
  if (prices.length === 0) return 500;
  return prices[Math.floor(prices.length / 2)];
}

export async function routeOutcome(
  input: RouteOutcomeInput,
  options: RouteOutcomeOptions = {},
): Promise<RouteOutcomeResult> {
  const outcome = input.outcome.trim();
  const pool = options.pool ?? (await (options.repo ?? getRepo()).listAgents({ limit: 200 }));

  let intent = extractIntent(outcome);
  if (options.refine !== false && canRefineIntent()) {
    intent = await refineIntent(outcome, intent);
  }

  // Explicit form fields always win over anything inferred from prose.
  intent = {
    ...intent,
    budgetCents: input.budgetCents ?? intent.budgetCents,
    deadlineSeconds: input.deadlineSeconds ?? intent.deadlineSeconds,
    region: input.region ?? intent.region,
  };

  const factor = volumeFactor(intent);
  const context: ScoringContext = {
    intent,
    referencePriceCents: intent.budgetCents ?? Math.max(200, medianPriceCents(pool) * 3),
    deadlineSeconds: intent.deadlineSeconds ?? DEFAULT_DEADLINE_SECONDS,
  };

  // The shortlist the caller sees and the candidate set a guild is drawn from
  // are two different things. Assembling from the top-`limit` display list
  // collapsed cross-category outcomes to a 2-step pipeline — the top 6 for
  // "Find 200 roofing companies in Tampa" holds no `development` agent and no
  // QA skill, so Build and QA silently found nobody. Score a wide candidate
  // set once, show `limit`, assemble from all of it (BUILD_SPEC §5).
  const available = pool.filter((agent) => agent.status !== "offline");
  const limit = options.limit ?? 6;
  const candidates = rankAgents(available, context, Math.max(GUILD_CANDIDATE_POOL, limit));
  const scored = candidates.slice(0, limit);

  const ranked: RankedAgent[] = scored.map((entry) => ({
    agent: entry.agent,
    score: entry.score,
    relevance: entry.relevance,
    fit: entry.fit,
    reasons: entry.reasons,
    estimateCents: estimateAgentCents(entry.agent, factor),
    etaSeconds: estimateAgentSeconds(entry.agent, factor),
  }));

  const guild = assembleGuild(candidates, intent);

  return {
    outcome,
    intent,
    ranked,
    guild,
    estimateCents: guild?.estimateCents ?? ranked[0]?.estimateCents ?? 0,
    etaSeconds: guild?.etaSeconds ?? ranked[0]?.etaSeconds ?? 0,
    formula: SCORE_FORMULA,
  };
}

/** Rank an explicit pool without any I/O — used by tests and MCP tools. */
export function rankPool(
  pool: Agent[],
  intent: WorldIntent,
  limit = 6,
): ScoredAgent[] {
  return rankAgents(pool, {
    intent,
    referencePriceCents: intent.budgetCents ?? Math.max(200, medianPriceCents(pool) * 3),
    deadlineSeconds: intent.deadlineSeconds ?? DEFAULT_DEADLINE_SECONDS,
  }, limit);
}

export { extractIntent, type WorldIntent } from "./intent";
export {
  SCORE_FORMULA,
  SCORE_WEIGHTS,
  latencyFitScore,
  priceEfficiencyScore,
  qualityScore,
  rankAgents,
  relevanceScore,
  reliabilityScore,
  scoreAgent,
  type ScoredAgent,
  type ScoringContext,
} from "./scoring";
export {
  assembleGuild,
  estimateAgentCents,
  estimateAgentSeconds,
  volumeFactor,
  type GuildProposal,
  type GuildStep,
} from "./guild";
export { WORLD_MODEL, canRefineIntent, refineIntent } from "./refine";
