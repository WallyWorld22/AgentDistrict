import { beforeEach, describe, expect, it } from "vitest";
import { createDemoRepository, type DemoRepository } from "@/lib/data/demo";
import { ConflictError } from "@/lib/data/errors";
import { validateAgentEndpoints } from "@/lib/data/endpoints";
import { isAllowedWebhookUrl, runtimeFor } from "@/lib/runtime";
import { WebhookAdapter } from "@/lib/runtime/webhook";
import { extractCategories, extractIntent } from "@/lib/world/intent";
import { routeOutcome } from "@/lib/world";
import { apiKeyMatches, timingSafeEqualHex } from "@/lib/data/hash";
import { DEMO_API_KEY, DEMO_PROFILE_ID, DEMO_WRITE_API_KEY, SEED_EPOCH_MS, seed } from "@/lib/seed";
import type { Agent, Order } from "@/lib/data/types";

/**
 * Regression tests for the fixes in this pass. Each one names the behaviour
 * that was wrong before, so a future change that reintroduces it fails here.
 */

const CHEAP_GIG = "find-100-qualified-local-businesses";

let now = SEED_EPOCH_MS;
let repo: DemoRepository;

beforeEach(() => {
  now = SEED_EPOCH_MS;
  repo = createDemoRepository({ now: () => now });
});

describe("money conservation", () => {
  it("returns the hold when a run is disputed and writes a refund row", async () => {
    const before = await repo.getWallet(DEMO_PROFILE_ID);
    const order = await repo.orderGig({
      gigSlug: CHEAP_GIG,
      tier: "basic",
      brief: "Gutter companies in Brevard County.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });

    const held = await repo.getWallet(DEMO_PROFILE_ID);
    expect(held!.held_cents).toBe(before!.held_cents + order.amount_cents);

    now += order.eta_seconds * 1000 + 1000;
    await repo.refreshOrder(order.id);
    await repo.disputeOrder(order.id, DEMO_PROFILE_ID, "Rows were stale");

    // The hold must not survive a dispute — that would lock the buyer's
    // credits permanently, which is exactly what used to happen.
    const after = await repo.getWallet(DEMO_PROFILE_ID);
    expect(after!.held_cents).toBe(before!.held_cents);
    expect(after!.balance_cents).toBe(before!.balance_cents);

    const rows = (await repo.listTransactions(DEMO_PROFILE_ID, 50)).filter(
      (tx) => tx.order_id === order.id,
    );
    // Still exactly one money row for the order, rewritten as a refund.
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("refund");
    expect(rows[0].amount_cents).toBe(order.amount_cents);
  });

  it("still releases (not refunds) on approval", async () => {
    const order = await repo.orderGig({
      gigSlug: CHEAP_GIG,
      tier: "basic",
      brief: "Approve path.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });
    now += order.eta_seconds * 1000 + 1000;
    await repo.refreshOrder(order.id);
    await repo.approveOrder(order.id, DEMO_PROFILE_ID);

    const rows = (await repo.listTransactions(DEMO_PROFILE_ID, 50)).filter(
      (tx) => tx.order_id === order.id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("release");
    expect(rows[0].amount_cents).toBe(-order.amount_cents);
  });
});

describe("Workplace Gateway spend policy", () => {
  it("refuses an autonomous order above the approval threshold", async () => {
    const wallet = await repo.getWallet(DEMO_PROFILE_ID);
    const threshold = wallet!.approval_threshold_cents;
    expect(threshold).toBeGreaterThan(0);

    const gigs = await repo.listGigs({ limit: 60 });
    const expensive = gigs.find(
      (gig) =>
        gig.starting_price_cents > threshold &&
        gig.starting_price_cents < wallet!.balance_cents - wallet!.held_cents,
    );
    expect(expensive).toBeDefined();

    // A machine caller never sets `approved` — that is the whole point.
    await expect(
      repo.orderGig({
        gigSlug: expensive!.slug,
        tier: "basic",
        brief: "Autonomous spend above the threshold.",
        buyerId: DEMO_PROFILE_ID,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // The same order approved by a human goes through.
    const order = await repo.orderGig({
      gigSlug: expensive!.slug,
      tier: "basic",
      brief: "Human-approved spend.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });
    expect(order.status).toBe("queued");
  });

  it("resets spend_today on a new UTC day", async () => {
    const before = await repo.getWallet(DEMO_PROFILE_ID);
    expect(before!.spend_today_cents).toBeGreaterThan(0);

    now += 36 * 60 * 60 * 1000; // tomorrow
    const order = await repo.orderGig({
      gigSlug: CHEAP_GIG,
      tier: "basic",
      brief: "First spend of the new day.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });

    const after = await repo.getWallet(DEMO_PROFILE_ID);
    expect(after!.spend_today_cents).toBe(order.amount_cents);
  });
});

describe("repository contract", () => {
  it("returns an empty page for an unknown agent handle instead of throwing", async () => {
    await expect(repo.listGigs({ agentHandle: "does-not-exist" })).resolves.toEqual([]);
    await expect(repo.listOrders({ agentHandle: "does-not-exist" })).resolves.toEqual([]);
  });
});

describe("@World intent", () => {
  it("does not read 'leads' as the marketing keyword 'ads'", () => {
    const categories = extractCategories("Find 200 roofing leads in Tampa");
    expect(categories).not.toContain("marketing");
    expect(categories).toContain("research");
  });

  it("still matches real keywords, singular and plural", () => {
    expect(extractCategories("write some ads for me")).toContain("marketing");
    expect(extractCategories("I need one ad")).toContain("marketing");
  });

  it("extracts quantity, region and budget from the spec example", () => {
    const intent = extractIntent("Find 200 roofing companies in Tampa under $10");
    expect(intent.quantity).toBe(200);
    expect(intent.region).toBe("FL");
    expect(intent.budgetCents).toBe(1000);
  });
});

describe("@World guild assembly", () => {
  it("assembles from a wider pool than the displayed shortlist", async () => {
    const pool = seed.agents as Agent[];
    const narrow = await routeOutcome(
      { outcome: "Find 200 roofing companies in Tampa, build their landing pages and QA them" },
      { pool, refine: false, limit: 3 },
    );

    expect(narrow.ranked).toHaveLength(3);
    // A three-agent shortlist must not cap the pipeline at three roles: the
    // guild is drawn from the full scored candidate set.
    expect(narrow.guild).not.toBeNull();
    expect(narrow.guild!.steps.length).toBeGreaterThanOrEqual(3);

    const roles = narrow.guild!.steps.map((step) => step.role);
    expect(new Set(roles).size).toBe(roles.length);
    const agents = narrow.guild!.steps.map((step) => step.agent.id);
    expect(new Set(agents).size).toBe(agents.length);
  });

  it("prices and times the pipeline as the sum of its steps", async () => {
    const result = await routeOutcome(
      { outcome: "Find 200 roofing companies in Tampa and validate the parcels" },
      { pool: seed.agents as Agent[], refine: false },
    );
    if (!result.guild) return;
    const sum = result.guild.steps.reduce((total, step) => total + step.estimateCents, 0);
    expect(result.guild.estimateCents).toBe(sum);
    expect(result.estimateCents).toBe(result.guild.estimateCents);
  });
});

describe("webhook runtime (SSRF guard)", () => {
  it("refuses loopback, link-local, private and non-https endpoints", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "https://169.254.169.254/latest/meta-data/",
      "http://localhost:6379/",
      "https://localhost/run",
      "https://127.0.0.1/run",
      "https://10.0.0.5/run",
      "https://192.168.1.4/run",
      "https://172.16.4.4/run",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://[::1]/run",
      "http://agent.example.com/run",
      "https://user:pass@agent.example.com/run",
      "not-a-url",
    ]) {
      expect(isAllowedWebhookUrl(url), url).toBe(false);
    }
  });

  it("allows an ordinary public https endpoint", () => {
    expect(isAllowedWebhookUrl("https://agent.example.com/run")).toBe(true);
  });

  it("rejects a bad endpoint at write time", () => {
    expect(() =>
      validateAgentEndpoints({ webhook: "http://169.254.169.254/" }),
    ).toThrowError(/endpoints\.webhook/);
    expect(validateAgentEndpoints({ a2a: "https://agent.example.com/a2a" })).toEqual({
      a2a: "https://agent.example.com/a2a",
    });
  });

  it("falls back to simulation and never fetches when the flag is off", async () => {
    const agent = {
      ...(seed.agents[0] as Agent),
      endpoints: { webhook: "https://agent.example.com/run" },
    };
    // The env flag is unset in tests, so `runtimeFor` must not pick the webhook.
    expect(runtimeFor(agent).name).toBe("simulated");

    let called = 0;
    const adapter = new WebhookAdapter({
      enabled: false,
      fetchImpl: async () => {
        called += 1;
        return new Response("{}");
      },
    });
    const order = seed.orders[0] as Order;
    const result = await adapter.execute(order, agent, { now: SEED_EPOCH_MS });
    expect(called).toBe(0);
    expect(result.source).toBe("simulated");
  });

  it("does not call a blocked host even when the runtime is enabled", async () => {
    let called = 0;
    const adapter = new WebhookAdapter({
      enabled: true,
      fetchImpl: async () => {
        called += 1;
        return new Response("{}");
      },
    });
    const agent = {
      ...(seed.agents[0] as Agent),
      endpoints: { webhook: "https://127.0.0.1/run" },
    };
    await adapter.execute(seed.orders[0] as Order, agent, { now: SEED_EPOCH_MS });
    expect(called).toBe(0);
  });
});

describe("api keys", () => {
  it("publishes a read-only demo key and keeps the write key private", async () => {
    const publicKey = await repo.verifyApiKey(DEMO_API_KEY);
    expect(publicKey).not.toBeNull();
    expect(publicKey!.scopes.every((scope) => scope.endsWith(":read"))).toBe(true);

    const writeKey = await repo.verifyApiKey(DEMO_WRITE_API_KEY);
    expect(writeKey).not.toBeNull();
    expect(writeKey!.scopes).toContain("orders:write");
  });

  it("compares digests in constant time and rejects a wrong key", async () => {
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
    expect(timingSafeEqualHex("abc", "abcd")).toBe(false);
    await expect(apiKeyMatches("ad_live_wrong", "sha1$deadbeef")).resolves.toBe(false);
  });
});

describe("featured gigs", () => {
  it("pins the reference cards rather than sorting by run count", async () => {
    const featured = await repo.getFeaturedGigs(3);
    expect(featured.map((gig) => gig.slug)).toEqual([
      "find-100-qualified-local-businesses",
      "complete-mobile-first-landing-page",
      "social-media-content-package",
    ]);
  });
});
