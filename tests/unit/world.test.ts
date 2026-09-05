// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Agent } from "@/lib/data/types";
import { seed } from "@/lib/seed";
import {
  assembleGuild,
  extractIntent,
  rankAgents,
  routeOutcome,
  scoreAgent,
  type ScoringContext,
  type WorldIntent,
} from "@/lib/world";

/**
 * @World is the part of AgentDistrict most likely to quietly rot: it is
 * heuristics all the way down. These tests pin the behaviour BUILD_SPEC §5
 * actually promises — the worked example, monotone scoring, and a guild made of
 * distinct agents.
 */

const POOL: Agent[] = seed.agents;

function agentLike(overrides: Partial<Agent> = {}): Agent {
  const base = seed.agents.find((agent) => agent.handle === "scout");
  if (!base) throw new Error("seed is missing @scout");
  return { ...base, id: `test-${Math.random()}`, ...overrides };
}

const BASE_INTENT: WorldIntent = {
  categories: ["research"],
  skills: [],
  locations: [],
  keywords: [],
  source: "heuristic",
};

function contextFor(intent: Partial<WorldIntent> = {}): ScoringContext {
  return {
    intent: { ...BASE_INTENT, ...intent },
    referencePriceCents: 1000,
    deadlineSeconds: 3600,
  };
}

describe("extractIntent", () => {
  it("reads the canonical outcome: 'Find 200 roofing companies in Tampa under $10'", () => {
    const intent = extractIntent("Find 200 roofing companies in Tampa under $10");

    expect(intent.quantity).toBe(200);
    expect(intent.budgetCents).toBe(1000);
    expect(intent.region).toBe("FL");
    expect(intent.locations).toContain("Tampa");
    expect(intent.categories).toContain("research");
    expect(intent.categories).toContain("home_services");
    expect(intent.skills.length).toBeGreaterThan(0);
    expect(intent.source).toBe("heuristic");
  });

  it("does not mistake the budget or a duration for a quantity", () => {
    expect(extractIntent("Find leads under $10").quantity).toBeUndefined();
    expect(extractIntent("Build a landing page in 3 hours").quantity).toBeUndefined();
  });

  it("parses deadlines in several shapes", () => {
    expect(extractIntent("Build a landing page in 3 hours").deadlineSeconds).toBe(10_800);
    expect(extractIntent("I need this within 30 minutes").deadlineSeconds).toBe(1_800);
    expect(extractIntent("Ship it today").deadlineSeconds).toBe(28_800);
    expect(extractIntent("No rush at all").deadlineSeconds).toBeUndefined();
  });

  it("parses budgets written in several shapes", () => {
    expect(extractIntent("under $10").budgetCents).toBe(1000);
    expect(extractIntent("budget of $25.50").budgetCents).toBe(2550);
    expect(extractIntent("$0.79 max").budgetCents).toBe(79);
  });

  it("finds categories for development, marketing and data outcomes", () => {
    expect(extractIntent("Build me a landing page with SEO").categories).toContain("development");
    expect(extractIntent("Write ad copy for a new campaign").categories).toContain("marketing");
    expect(extractIntent("Clean and dedupe a 5,000 row CSV").categories).toContain("data");
    expect(extractIntent("Clean and dedupe a 5,000 row CSV").quantity).toBe(5000);
  });

  it("resolves states as well as cities", () => {
    expect(extractIntent("agents anywhere in Texas").region).toBe("TX");
    expect(extractIntent("pool companies in Orlando").region).toBe("FL");
  });
});

describe("scoring", () => {
  it("is monotone in rating", () => {
    const context = contextFor();
    const low = scoreAgent(agentLike({ rating_avg: 4.1, rating_count: 500 }), context);
    const high = scoreAgent(agentLike({ rating_avg: 4.9, rating_count: 500 }), context);
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("is monotone in reliability", () => {
    const context = contextFor();
    const shaky = scoreAgent(agentLike({ reliability: 0.9 }), context);
    const solid = scoreAgent(agentLike({ reliability: 0.999 }), context);
    expect(solid.score).toBeGreaterThan(shaky.score);
  });

  it("prefers the cheaper agent when everything else matches", () => {
    const context = contextFor();
    const dear = scoreAgent(agentLike({ starting_price_cents: 800 }), context);
    const cheap = scoreAgent(agentLike({ starting_price_cents: 80 }), context);
    expect(cheap.score).toBeGreaterThan(dear.score);
  });

  it("prefers the faster agent when everything else matches", () => {
    const context = contextFor();
    const slow = scoreAgent(agentLike({ avg_latency_sec: 1800 }), context);
    const fast = scoreAgent(agentLike({ avg_latency_sec: 30 }), context);
    expect(fast.score).toBeGreaterThan(slow.score);
  });

  it("keeps every score inside 0..1", () => {
    for (const agent of POOL) {
      const { score, relevance, fit } = scoreAgent(agent, contextFor());
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
      expect(relevance).toBeGreaterThanOrEqual(0);
      expect(relevance).toBeLessThanOrEqual(1);
      expect(fit).toBeLessThanOrEqual(score + 1e-9);
    }
  });

  it("ranks by fit, best first, and explains itself", () => {
    // Only the research agents are relevant to a bare research intent, so the
    // shortlist is shorter than the limit — that is the point of the filter.
    const ranked = rankAgents(POOL, contextFor({ categories: ["research"] }), 5);
    expect(ranked.length).toBeGreaterThanOrEqual(3);
    expect(ranked.every((entry) => entry.agent.category === "research")).toBe(true);
    for (let index = 1; index < ranked.length; index += 1) {
      expect(ranked[index - 1].fit).toBeGreaterThanOrEqual(ranked[index].fit);
    }
    expect(ranked[0].reasons.length).toBeGreaterThan(0);
    expect(ranked[0].agent.category).toBe("research");
  });
});

describe("assembleGuild", () => {
  it("picks 2–4 distinct agents across the pipeline", () => {
    const intent = extractIntent(
      "Find 200 roofing companies in Tampa, validate the owners and build a landing page",
    );
    const ranked = rankAgents(POOL, { intent, referencePriceCents: 5000, deadlineSeconds: 3600 }, 40);
    const guild = assembleGuild(ranked, intent);

    expect(guild).not.toBeNull();
    expect(guild!.steps.length).toBeGreaterThanOrEqual(2);
    expect(guild!.steps.length).toBeLessThanOrEqual(4);

    const ids = guild!.steps.map((step) => step.agent.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(guild!.estimateCents).toBeGreaterThan(0);
    expect(guild!.pipeline).toContain("→");
  });

  it("returns null when the outcome only reaches one part of the District", () => {
    const intent = extractIntent("Summarize this PDF");
    const ranked = rankAgents(POOL, { intent, referencePriceCents: 1000, deadlineSeconds: 3600 }, 20);
    expect(assembleGuild(ranked, intent)).toBeNull();
  });
});

describe("routeOutcome", () => {
  it("routes the canonical outcome end to end without touching the network", async () => {
    const result = await routeOutcome(
      { outcome: "Find 200 roofing companies in Tampa under $10" },
      { pool: POOL, refine: false },
    );

    expect(result.intent.quantity).toBe(200);
    expect(result.intent.budgetCents).toBe(1000);
    expect(result.ranked.length).toBeGreaterThan(0);
    expect(result.estimateCents).toBeGreaterThan(0);
    expect(result.formula).toContain("0.35");

    const categories = result.ranked.map((entry) => entry.agent.category);
    expect(categories).toContain("research");
    for (const entry of result.ranked) {
      expect(entry.agent.status).not.toBe("offline");
      expect(entry.reasons.length).toBeGreaterThan(0);
    }
  });

  it("lets explicit budget and deadline win over the prose", async () => {
    const result = await routeOutcome(
      { outcome: "Find 200 roofing companies in Tampa under $10", budgetCents: 5000, deadlineSeconds: 600 },
      { pool: POOL, refine: false },
    );
    expect(result.intent.budgetCents).toBe(5000);
    expect(result.intent.deadlineSeconds).toBe(600);
  });

  it("scales the estimate with the requested volume", async () => {
    const small = await routeOutcome(
      { outcome: "Find 50 roofing companies in Tampa" },
      { pool: POOL, refine: false },
    );
    const large = await routeOutcome(
      { outcome: "Find 800 roofing companies in Tampa" },
      { pool: POOL, refine: false },
    );
    expect(large.estimateCents).toBeGreaterThan(small.estimateCents);
  });
});
