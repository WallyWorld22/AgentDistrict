// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { createDemoRepository, resetRepoForTests } from "@/lib/data";
import type { Repository } from "@/lib/data/repository";
import { buildOpenApiDocument } from "@/lib/openapi";
import type { MarketItem, MarketItemWithStore } from "@/lib/data/types";
import { seed } from "@/lib/seed";
import {
  GUILD_FORMATION_STEPS,
  MARKET_SORTS,
  apiOperations,
  bestGigForAgent,
  buildGuildHirePlan,
  counterpartName,
  discoveryLinks,
  guildOutcomes,
  guildTotals,
  hirePlanTiers,
  isAgentCounterpart,
  marketIncludes,
  mcpClientSnippets,
  pipelineSteps,
  previewText,
  replyLatencyLabel,
  restSnippets,
  sortMarketItems,
  storeTotals,
  walletSummary,
} from "@/lib/data/ext/economy";

/**
 * Unit tests for the economy surfaces' shared layer.
 *
 * Everything in `lib/data/ext/economy.ts` is either pure or composed only from
 * `Repository` methods, so the whole module is testable against the in-memory
 * demo adapter with no server and no network.
 */

let repo: Repository;

beforeEach(() => {
  resetRepoForTests();
  repo = createDemoRepository();
});

/* ------------------------------------------------------------------ guilds */

describe("guild hire planning", () => {
  it("prices one order per member on that member's headline gig", async () => {
    const guild = await repo.getGuildBySlug("content-factory");
    expect(guild).not.toBeNull();

    const plan = await buildGuildHirePlan(repo, guild!, "basic");

    expect(plan.steps).toHaveLength(guild!.members.length);
    expect(plan.hireable.length).toBeGreaterThan(0);
    // The quote is the sum of exactly the steps that can be ordered.
    expect(plan.totalCents).toBe(
      plan.hireable.reduce((sum, step) => sum + step.priceCents, 0),
    );
    // Steps run together, so the ETA is the slowest one, not the sum.
    expect(plan.etaSeconds).toBe(
      Math.max(...plan.hireable.map((step) => step.etaSeconds)),
    );
    for (const step of plan.hireable) {
      expect(step.gig!.agent.handle).toBe(step.agent.handle);
      expect(step.priceCents).toBeGreaterThan(0);
    }
  });

  it("keeps every member's role in pipeline order", async () => {
    const guild = await repo.getGuildBySlug("local-growth-guild");
    const plan = await buildGuildHirePlan(repo, guild!, "basic");
    expect(plan.steps.map((step) => step.role)).toEqual(guild!.roles);
  });

  it("prices the same plan at all three tiers, premium last", async () => {
    const guild = await repo.getGuildBySlug("content-factory");
    const plan = await buildGuildHirePlan(repo, guild!, "basic");
    const tiers = hirePlanTiers(plan);

    expect(tiers.map((tier) => tier.tier)).toEqual(["basic", "standard", "premium"]);
    expect(tiers[0].totalCents).toBe(plan.totalCents);
    expect(tiers[2].totalCents).toBeGreaterThan(tiers[0].totalCents);
    for (const tier of tiers) {
      expect(tier.prices).toHaveLength(plan.steps.length);
    }
  });

  it("picks the highest-rated gig as an agent's headline gig", async () => {
    const gig = await bestGigForAgent(repo, "scout");
    const all = await repo.listGigs({ agentHandle: "scout", limit: 20 });
    expect(gig).not.toBeNull();
    expect(gig!.rating_avg).toBe(Math.max(...all.map((entry) => entry.rating_avg)));
  });

  it("returns no plan steps for an agent with nothing published", async () => {
    expect(await bestGigForAgent(repo, "not-a-real-agent")).toBeNull();
  });

  it("lists approved runs delivered by a guild's members, newest first", async () => {
    const guild = await repo.getGuildBySlug("local-growth-guild");
    const outcomes = await guildOutcomes(repo, guild!, 5);

    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.length).toBeLessThanOrEqual(5);
    const handles = new Set(guild!.members.map((member) => member.handle));
    for (const order of outcomes) {
      expect(order.status).toBe("approved");
      expect(handles.has(order.agent.handle)).toBe(true);
    }
    const ids = outcomes.map((order) => order.id);
    expect(new Set(ids).size).toBe(ids.length);
    const times = outcomes.map((order) => order.created_at);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("rolls up guild counters without double-counting shared members", async () => {
    const guilds = await repo.listGuilds({ limit: 24 });
    const totals = guildTotals(guilds);
    const everyMembership = guilds.reduce((sum, guild) => sum + guild.members.length, 0);

    expect(totals.guilds).toBe(guilds.length);
    expect(totals.agents).toBeLessThan(everyMembership); // QA Fox is in several
    expect(totals.hires).toBe(guilds.reduce((sum, guild) => sum + guild.hires_count, 0));
    expect(totals.ratingAvg).toBeGreaterThan(4.8);
    expect(totals.ratingAvg).toBeLessThanOrEqual(5);
  });

  it("splits a pipeline string on its arrows", () => {
    expect(pipelineSteps("Scout finds → CopyCat writes → QA Fox verifies")).toEqual([
      "Scout finds",
      "CopyCat writes",
      "QA Fox verifies",
    ]);
    expect(pipelineSteps("")).toEqual([]);
  });

  it("publishes the assembly steps the ranking formula describes", () => {
    expect(GUILD_FORMATION_STEPS).toHaveLength(5);
    expect(GUILD_FORMATION_STEPS.map((step) => step.title)).toContain(
      "A pipeline is assembled",
    );
    expect(GUILD_FORMATION_STEPS[2].body).toContain("0.35 × quality");
  });
});

/* ------------------------------------------------------------------ stores */

describe("store totals", () => {
  it("sums runs and jobs and reports the lowest gig price", async () => {
    const store = await repo.getStoreBySlug("wallyworks-labs");
    expect(store).not.toBeNull();
    const totals = storeTotals({ agents: store!.agents, gigs: store!.gigs });

    expect(totals.runs).toBe(store!.gigs.reduce((sum, gig) => sum + gig.runs_count, 0));
    expect(totals.jobs).toBe(
      store!.agents.reduce((sum, agent) => sum + agent.jobs_completed, 0),
    );
    expect(totals.fromCents).toBe(
      Math.min(...store!.gigs.map((gig) => gig.starting_price_cents)),
    );
  });

  it("reports zero rather than Infinity for an empty portfolio", () => {
    expect(storeTotals({ agents: [], gigs: [] })).toEqual({
      runs: 0,
      jobs: 0,
      reviews: 0,
      fromCents: 0,
    });
  });
});

/* ------------------------------------------------------------------ market */

describe("district market", () => {
  const item = (over: Partial<MarketItem>): MarketItemWithStore =>
    ({ ...seed.marketItems[0], ...over, store: null }) as MarketItemWithStore;

  it("derives what is included from the kind, and flags verification", () => {
    const tool = marketIncludes(item({ kind: "tool", verified: false }));
    expect(tool[0]).toContain("callable endpoint");
    expect(tool.some((line) => line.includes("District-verified"))).toBe(false);

    const dataset = marketIncludes(item({ kind: "dataset", verified: true }));
    expect(dataset.some((line) => /provenance/i.test(line))).toBe(true);
    expect(dataset.at(-1)).toContain("District-verified");
  });

  it("sorts by downloads, recency and price", () => {
    const items = [
      item({ id: "a", price_cents: 500, downloads: 10, created_at: "2026-01-01T00:00:00.000Z" }),
      item({ id: "b", price_cents: 100, downloads: 90, created_at: "2026-03-01T00:00:00.000Z" }),
      item({ id: "c", price_cents: 300, downloads: 50, created_at: "2026-02-01T00:00:00.000Z" }),
    ];

    expect(sortMarketItems(items, "popular").map((entry) => entry.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortMarketItems(items, "newest").map((entry) => entry.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortMarketItems(items, "price").map((entry) => entry.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    // Sorting never mutates the caller's array.
    expect(items.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("offers exactly the sorts the browse controls render", () => {
    expect([...MARKET_SORTS]).toEqual(["popular", "newest", "price"]);
  });
});

/* ------------------------------------------------------------------- inbox */

describe("inbox helpers", () => {
  it("truncates a preview in the markup, not just with CSS", () => {
    expect(previewText("short enough")).toBe("short enough");
    const long = "x".repeat(200);
    expect(previewText(long)).toHaveLength(61); // 60 + the ellipsis
    expect(previewText(long).endsWith("…")).toBe(true);
    expect(previewText("  collapses   whitespace  ")).toBe("collapses whitespace");
    expect(previewText(null)).toBe("");
  });

  it("names either kind of counterpart", async () => {
    const agent = await repo.getAgentByHandle("scout");
    const profile = await repo.getCurrentProfile();

    expect(counterpartName(agent)).toBe("Scout");
    expect(counterpartName(profile)).toBe(profile!.display_name);
    expect(counterpartName(null)).toBe("District");
    expect(isAgentCounterpart(agent)).toBe(true);
    expect(isAgentCounterpart(profile)).toBe(false);
    expect(isAgentCounterpart(null)).toBe(false);
  });

  it("turns published latency into the reply hint", () => {
    expect(replyLatencyLabel(42)).toBe("Typically replies in 42 sec");
    expect(replyLatencyLabel(600)).toBe("Typically replies in 10 min");
    expect(replyLatencyLabel(7200)).toBe("Typically replies in 2 h");
    expect(replyLatencyLabel(0)).toBeNull();
    expect(replyLatencyLabel(null)).toBeNull();
  });
});

/* ------------------------------------------------------------------ wallet */

describe("wallet summary", () => {
  it("derives available, remaining and the daily percentage", async () => {
    const profile = await repo.getCurrentProfile();
    const wallet = await repo.getWallet(profile!.id);
    const money = walletSummary(wallet);

    expect(money.available).toBe(money.balance - money.held);
    expect(money.available).toBe(1243); // the pinned $12.43 credits pill
    expect(money.dailyRemaining).toBe(money.dailyLimit - money.spentToday);
    expect(money.dailyUsedPct).toBe(
      Math.round((money.spentToday / money.dailyLimit) * 100),
    );
  });

  it("is safe on a missing wallet and never divides by zero", () => {
    const money = walletSummary(null);
    expect(money).toMatchObject({
      balance: 0,
      held: 0,
      available: 0,
      dailyUsedPct: 0,
      dailyRemaining: 0,
    });
  });

  it("writes both spend-policy columns and refuses a negative limit", async () => {
    const profile = await repo.getCurrentProfile();
    expect(profile).not.toBeNull();

    const updated = await repo.updateWalletPolicy(profile!.id, {
      approvalThresholdCents: 750,
      autonomousSpendLimitCents: 3000,
    });
    expect(updated.approval_threshold_cents).toBe(750);
    expect(updated.autonomous_spend_limit_cents).toBe(3000);

    // A partial patch leaves the other column alone.
    const partial = await repo.updateWalletPolicy(profile!.id, { approvalThresholdCents: 500 });
    expect(partial.approval_threshold_cents).toBe(500);
    expect(partial.autonomous_spend_limit_cents).toBe(3000);

    await expect(
      repo.updateWalletPolicy(profile!.id, { approvalThresholdCents: -1 }),
    ).rejects.toThrow(/negative/i);
  });
});

/* --------------------------------------------------------------- api & mcp */

describe("developer surface", () => {
  it("mirrors every documented operation, with its auth requirement", () => {
    const document = buildOpenApiDocument();
    const operations = apiOperations(document);
    const paths = document.paths as Record<string, Record<string, unknown>>;
    const declared = Object.values(paths).reduce(
      (sum, methods) => sum + Object.keys(methods).length,
      0,
    );

    expect(operations).toHaveLength(declared);
    const createOrder = operations.find(
      (operation) => operation.method === "POST" && operation.path === "/api/v1/orders",
    );
    expect(createOrder?.authenticated).toBe(true);
    const listAgents = operations.find(
      (operation) => operation.method === "GET" && operation.path === "/api/v1/agents",
    );
    expect(listAgents?.authenticated).toBe(false);
    expect(listAgents?.summary).toMatch(/Passports/);
  });

  it("builds every client snippet from the origin it is given", () => {
    const origin = "https://district.example";
    const snippets = mcpClientSnippets(origin);

    expect(snippets.map((snippet) => snippet.id)).toEqual([
      "claude-desktop",
      "claude-code",
      "cursor",
      "sse",
    ]);
    for (const snippet of snippets) {
      expect(snippet.code).toContain(origin);
      expect(snippet.code).not.toContain("localhost");
    }
    expect(JSON.parse(snippets[0].code).mcpServers.agentdistrict.url).toBe(
      `${origin}/api/mcp/mcp`,
    );
    expect(JSON.parse(snippets[3].code).mcpServers.agentdistrict.url).toBe(
      `${origin}/api/mcp/sse`,
    );

    for (const snippet of restSnippets(origin, "ad_live_test")) {
      expect(snippet.code).toContain(`${origin}/api/v1/`);
    }
    expect(restSnippets(origin, "ad_live_test")[0].code).toContain(
      "Authorization: Bearer ad_live_test",
    );
  });

  it("lists the five discovery documents", () => {
    const links = discoveryLinks("https://district.example");
    expect(links.map((link) => link.href)).toEqual([
      "/.well-known/agent-card.json",
      "/.well-known/agents.json",
      "/llms.txt",
      "/skill.md",
      "/openapi.json",
    ]);
  });
});
