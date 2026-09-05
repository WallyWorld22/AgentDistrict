import type { Agent } from "@/lib/data/types";
import { formatCents, formatDuration } from "@/lib/utils";
import type { WorldIntent } from "./intent";

/**
 * Procurement ranking (BUILD_SPEC §5) — the exact formula documented on
 * `/jobs` in the "Procurement ranking" card:
 *
 *     score = 0.35·quality + 0.25·reliability + 0.20·priceEfficiency + 0.20·latencyFit
 *
 * Every term is normalised to 0..1 and monotone in the thing it measures, so a
 * better-rated / more reliable / cheaper / faster agent always scores higher
 * when everything else is equal. `relevance` is kept *out* of the score: it
 * decides who is a candidate at all, and breaks ties.
 */

export const SCORE_WEIGHTS = {
  quality: 0.35,
  reliability: 0.25,
  priceEfficiency: 0.2,
  latencyFit: 0.2,
} as const;

export const SCORE_FORMULA =
  "0.35 × quality + 0.25 × reliability + 0.20 × price efficiency + 0.20 × latency fit";

export type ScoreParts = {
  quality: number;
  reliability: number;
  priceEfficiency: number;
  latencyFit: number;
};

export type ScoredAgent = {
  agent: Agent;
  /** 0..1, the weighted formula above. */
  score: number;
  /** 0..1 — how well the agent matches the extracted intent. */
  relevance: number;
  /**
   * The ordering key: `score × (0.45 + 0.55 × relevance)`.
   *
   * Ranking on `score` alone would float a cheap, fast, well-rated agent to the
   * top of *every* outcome regardless of what was asked for, so relevance
   * modulates it. `score` itself stays the published procurement formula.
   */
  fit: number;
  parts: ScoreParts;
  reasons: string[];
};

export type ScoringContext = {
  intent: WorldIntent;
  /** Price the buyer is anchored on when the outcome names no budget. */
  referencePriceCents: number;
  /** Delivery window; defaults to one hour. */
  deadlineSeconds: number;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Rating, discounted when there is little evidence behind it. */
export function qualityScore(agent: Agent): number {
  const rating = clamp01(agent.rating_avg / 5);
  const confidence = Math.min(1, Math.log10(1 + Math.max(0, agent.rating_count)) / 3);
  return clamp01(rating * (0.8 + 0.2 * confidence));
}

/** Delivery track record: uptime, repeat hires and the absence of disputes. */
export function reliabilityScore(agent: Agent): number {
  return clamp01(
    0.6 * agent.reliability + 0.25 * agent.repeat_hire_rate + 0.15 * (1 - agent.dispute_rate),
  );
}

/** How much of the buyer's budget is left after paying this agent. */
export function priceEfficiencyScore(agent: Agent, referenceCents: number): number {
  if (agent.starting_price_cents <= 0) return 1;
  const reference = Math.max(1, referenceCents);
  return clamp01(1 - agent.starting_price_cents / reference);
}

/** Does the agent finish comfortably inside the window? */
export function latencyFitScore(agent: Agent, deadlineSeconds: number): number {
  const deadline = Math.max(1, deadlineSeconds);
  return clamp01(1 - agent.avg_latency_sec / deadline);
}

/** Category, skill and region overlap with the extracted intent. */
export function relevanceScore(agent: Agent, intent: WorldIntent): number {
  let score = 0;

  if (intent.categories.length > 0) {
    const rank = intent.categories.indexOf(agent.category);
    if (rank === 0) score += 0.5;
    else if (rank > 0) score += 0.35;
  }

  if (intent.skills.length > 0) {
    const owned = agent.skills.map((skill) => skill.toLowerCase());
    const hits = intent.skills.filter((skill) =>
      owned.some((have) => have.includes(skill.toLowerCase()) || skill.toLowerCase().includes(have)),
    ).length;
    score += 0.3 * Math.min(1, hits / Math.min(3, intent.skills.length));
  }

  if (intent.region) {
    if (agent.regions.includes(intent.region)) score += 0.2;
    else if (agent.regions.includes("US") || agent.regions.includes("GLOBAL")) score += 0.1;
  }

  if (intent.keywords.length > 0) {
    const haystack = `${agent.name} ${agent.tagline} ${agent.description} ${agent.skills.join(" ")}`.toLowerCase();
    const hits = intent.keywords.filter((keyword) => haystack.includes(keyword)).length;
    score += 0.15 * Math.min(1, hits / 3);
  }

  return clamp01(score);
}

export function scoreAgent(agent: Agent, context: ScoringContext): ScoredAgent {
  const { intent, referencePriceCents, deadlineSeconds } = context;

  const parts: ScoreParts = {
    quality: qualityScore(agent),
    reliability: reliabilityScore(agent),
    priceEfficiency: priceEfficiencyScore(agent, referencePriceCents),
    latencyFit: latencyFitScore(agent, deadlineSeconds),
  };

  const score =
    SCORE_WEIGHTS.quality * parts.quality +
    SCORE_WEIGHTS.reliability * parts.reliability +
    SCORE_WEIGHTS.priceEfficiency * parts.priceEfficiency +
    SCORE_WEIGHTS.latencyFit * parts.latencyFit;

  const relevance = relevanceScore(agent, intent);

  return {
    agent,
    score: round4(score),
    relevance: round4(relevance),
    fit: round4(score * (0.45 + 0.55 * relevance)),
    parts,
    reasons: reasonsFor(agent, intent, parts),
  };
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function reasonsFor(agent: Agent, intent: WorldIntent, parts: ScoreParts): string[] {
  const reasons: string[] = [];

  if (agent.rating_count > 0) {
    reasons.push(
      `★ ${agent.rating_avg.toFixed(2)} from ${agent.rating_count.toLocaleString("en-US")} reviews`,
    );
  }
  if (parts.reliability >= 0.85) {
    reasons.push(`${(agent.reliability * 100).toFixed(1)}% on-time delivery`);
  }
  if (agent.is_free) reasons.push("Free to run");
  else if (intent.budgetCents && agent.starting_price_cents <= intent.budgetCents) {
    reasons.push(`Starts at ${formatCents(agent.starting_price_cents)} — inside your budget`);
  } else if (intent.budgetCents && agent.starting_price_cents > intent.budgetCents) {
    reasons.push(`Starts at ${formatCents(agent.starting_price_cents)} — above your budget`);
  } else {
    reasons.push(`Starts at ${formatCents(agent.starting_price_cents)}`);
  }

  reasons.push(`Typically delivers in ${formatDuration(agent.avg_latency_sec)}`);

  const owned = agent.skills.map((skill) => skill.toLowerCase());
  const matched = intent.skills.filter((skill) =>
    owned.some((have) => have.includes(skill.toLowerCase()) || skill.toLowerCase().includes(have)),
  );
  if (matched.length > 0) reasons.push(`Matches: ${matched.slice(0, 3).join(", ")}`);

  if (intent.region && agent.regions.includes(intent.region)) {
    reasons.push(`Covers ${intent.region}`);
  }
  if (agent.verified) reasons.push("Verified Passport");

  return reasons.slice(0, 5);
}

/** Rank a pool by `fit`, keeping only agents that match the intent at all. */
export function rankAgents(
  agents: Agent[],
  context: ScoringContext,
  limit = 6,
): ScoredAgent[] {
  const scored = agents.map((agent) => scoreAgent(agent, context));
  const relevant = scored.filter((entry) => entry.relevance > 0);
  const pool = relevant.length > 0 ? relevant : scored;

  return pool
    .sort((a, b) => b.fit - a.fit || b.score - a.score || b.relevance - a.relevance)
    .slice(0, limit);
}
