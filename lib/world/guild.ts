import type { Agent, AgentCategory, Slug } from "@/lib/data/types";
import type { WorldIntent } from "./intent";
import type { AgentQuote } from "./pricing";
import type { ScoredAgent } from "./scoring";

/**
 * Guild assembly (BUILD_SPEC §5): when an outcome spans categories, propose a
 * pipeline of 2–4 *distinct* agents by role — find → enrich/validate →
 * build/write → QA — in that order, priced and timed as a sequential run.
 */

export type GuildStep = {
  role: string;
  /** Third-person verb for the pipeline sentence: "Scout finds → …". */
  verb: string;
  agent: Agent;
  /**
   * The gig this step runs on. "Assemble & run" orders exactly this slug, which
   * is why `estimateCents` below is that gig's basic package rather than a
   * derived guess — the quote and the charge are the same number.
   */
  gigSlug: Slug | null;
  estimateCents: number;
  etaSeconds: number;
};

export type GuildProposal = {
  steps: GuildStep[];
  estimateCents: number;
  etaSeconds: number;
  /** e.g. `"Scout finds → ParcelPro validates → QA Fox verifies"`. */
  pipeline: string;
};

type RolePlan = {
  role: string;
  verb: string;
  categories: AgentCategory[];
  /** Only agents carrying one of these skills qualify (used for the QA step). */
  requireSkill?: string[];
};

const ROLE_PLAN: RolePlan[] = [
  { role: "Find", verb: "finds", categories: ["research"] },
  {
    role: "Enrich & validate",
    verb: "validates",
    categories: ["data", "home_services", "finance", "legal"],
  },
  { role: "Build", verb: "builds", categories: ["development"] },
  {
    role: "Write & launch",
    verb: "writes",
    categories: ["marketing", "creative", "entertainment", "support", "operations"],
  },
  { role: "QA", verb: "verifies", categories: ["development", "data"], requireSkill: ["qa", "validation", "verification"] },
];

/** Bigger asks cost and take more: one "unit" per 100 records, capped at 8. */
export function volumeFactor(intent: WorldIntent): number {
  if (!intent.quantity || intent.quantity <= 0) return 1;
  return Math.min(8, Math.max(1, Math.ceil(intent.quantity / 100)));
}

export function estimateAgentCents(agent: Agent, factor: number): number {
  return agent.pricing_model === "per_run"
    ? agent.starting_price_cents * factor
    : agent.starting_price_cents;
}

export function estimateAgentSeconds(agent: Agent, factor: number): number {
  return agent.pricing_model === "per_run"
    ? agent.avg_latency_sec * factor
    : agent.avg_latency_sec;
}

function qualifies(agent: Agent, plan: RolePlan): boolean {
  if (!plan.categories.includes(agent.category)) return false;
  if (!plan.requireSkill) return true;
  const owned = agent.skills.map((skill) => skill.toLowerCase());
  return plan.requireSkill.some((skill) => owned.some((have) => have.includes(skill)));
}

/**
 * Build the pipeline. Roles are included when the intent actually reaches into
 * their categories; a QA step is appended once the pipeline has two or more
 * steps, because that is where hand-offs start to go wrong.
 */
export function assembleGuild(
  ranked: ScoredAgent[],
  intent: WorldIntent,
  options: {
    maxSteps?: number;
    /** Price a step from the gig it will actually run on (see `./pricing`). */
    quote?: (agent: Agent) => AgentQuote;
  } = {},
): GuildProposal | null {
  const maxSteps = options.maxSteps ?? 4;
  const factor = volumeFactor(intent);
  const used = new Set<string>();
  const steps: GuildStep[] = [];

  const pick = (plan: RolePlan): ScoredAgent | undefined =>
    ranked.find((entry) => !used.has(entry.agent.id) && qualifies(entry.agent, plan));

  for (const plan of ROLE_PLAN) {
    if (steps.length >= maxSteps) break;
    const wanted =
      plan.role === "QA"
        ? steps.length >= 2
        : plan.categories.some((category) => intent.categories.includes(category));
    if (!wanted) continue;

    const choice = pick(plan);
    if (!choice) continue;
    used.add(choice.agent.id);
    const quote = options.quote?.(choice.agent);
    steps.push({
      role: plan.role,
      verb: plan.verb,
      agent: choice.agent,
      gigSlug: quote?.gigSlug ?? null,
      estimateCents: quote?.cents ?? estimateAgentCents(choice.agent, factor),
      etaSeconds: quote?.etaSeconds ?? estimateAgentSeconds(choice.agent, factor),
    });
  }

  if (steps.length < 2) return null;

  return {
    steps,
    estimateCents: steps.reduce((total, step) => total + step.estimateCents, 0),
    etaSeconds: steps.reduce((total, step) => total + step.etaSeconds, 0),
    pipeline: steps.map((step) => `${step.agent.name} ${step.verb}`).join(" → "),
  };
}
