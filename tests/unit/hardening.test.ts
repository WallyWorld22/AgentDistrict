import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createDemoRepository, type DemoRepository } from "@/lib/data/demo";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/data/errors";
import { validateAgentEndpoints } from "@/lib/data/endpoints";
import { isAllowedWebhookUrl, runtimeFor } from "@/lib/runtime";
import { WebhookAdapter } from "@/lib/runtime/webhook";
import { extractCategories, extractIntent } from "@/lib/world/intent";
import { routeOutcome } from "@/lib/world";
import { apiKeyMatches, timingSafeEqualHex } from "@/lib/data/hash";
import { DEMO_API_KEY, DEMO_PROFILE_ID, DEMO_WRITE_API_KEY, SEED_EPOCH_MS, seed } from "@/lib/seed";
import type { Agent, Order } from "@/lib/data/types";
import { remainingRunSeconds, runTimeLabel } from "@/lib/data/ext/economy";
import { buildContractDeliverable } from "@/lib/runtime/deliverable";
import { rngFor } from "@/lib/seed/rng";

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

describe("settlement is idempotent", () => {
  it("refunds a disputed run exactly once, however many times it is disputed", async () => {
    const before = await repo.getWallet(DEMO_PROFILE_ID);
    const order = await repo.orderGig({
      gigSlug: CHEAP_GIG,
      tier: "basic",
      brief: "Double-dispute probe.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });

    now += order.eta_seconds * 1000 + 1000;
    await repo.refreshOrder(order.id);
    await repo.disputeOrder(order.id, DEMO_PROFILE_ID, "Rows were stale");
    const once = await repo.getWallet(DEMO_PROFILE_ID);

    // Disputing again used to decrement `held_cents` a second time — releasing
    // credits held against *other* live orders — mint another refund row and
    // drive `spend_today_cents` to zero, defeating the daily ceiling.
    await repo.disputeOrder(order.id, DEMO_PROFILE_ID, "Again");
    await repo.disputeOrder(order.id, DEMO_PROFILE_ID, "And again");

    const after = await repo.getWallet(DEMO_PROFILE_ID);
    expect(after!.held_cents).toBe(once!.held_cents);
    expect(after!.balance_cents).toBe(once!.balance_cents);
    expect(after!.spend_today_cents).toBe(once!.spend_today_cents);
    expect(after!.held_cents).toBe(before!.held_cents);

    const rows = (await repo.listTransactions(DEMO_PROFILE_ID, 60)).filter(
      (tx) => tx.order_id === order.id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("refund");
  });
});

describe("reputation cannot be bought", () => {
  it("refuses a review on your own agent", async () => {
    // The demo human owns Scout; a creator reviewing their own Passport would
    // buy the 35% quality term of the published ranking formula outright.
    const mine = (await repo.listAgentsByOwner(DEMO_PROFILE_ID))[0];
    expect(mine).toBeDefined();
    const gigs = await repo.listGigs({ agentHandle: mine.handle, limit: 5 });
    expect(gigs.length).toBeGreaterThan(0);

    const order = await repo.orderGig({
      gigSlug: gigs[0].slug,
      tier: "basic",
      brief: "Self-review probe.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });
    now += order.eta_seconds * 1000 + 1000;
    await repo.refreshOrder(order.id);
    await repo.approveOrder(order.id, DEMO_PROFILE_ID);

    await expect(
      repo.createReview({ orderId: order.id, rating: 5, body: "Five stars for me." },
        DEMO_PROFILE_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a review before the run is approved", async () => {
    const order = await repo.orderGig({
      gigSlug: CHEAP_GIG,
      tier: "basic",
      brief: "Rate-on-delivery probe.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });
    now += order.eta_seconds * 1000 + 1000;
    const delivered = await repo.refreshOrder(order.id);
    expect(delivered.status).toBe("delivered");

    // Reputation must not move before money does.
    await expect(
      repo.createReview({ orderId: order.id, rating: 5, body: "Too early." }, DEMO_PROFILE_ID),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("contains no self-reviews in the seed either", () => {
    const ownerOf = new Map(seed.agents.map((agent) => [agent.id, agent.owner_id]));
    const offenders = seed.reviews.filter(
      (review) => ownerOf.get(review.agent_id) === review.reviewer_id,
    );
    expect(offenders).toEqual([]);
  });

  it("refuses a rating that is not a whole number from 1 to 5", async () => {
    // `Number("abc")` is NaN, and both `NaN < 1` and `NaN > 5` are false — so a
    // range check alone let an un-parsed rating through and folded `NaN` into
    // the agent's and the gig's lifetime `rating_avg`, permanently.
    const order = await repo.orderGig({
      gigSlug: CHEAP_GIG,
      tier: "basic",
      brief: "Rating validation probe.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });
    now += order.eta_seconds * 1000 + 1000;
    await repo.refreshOrder(order.id);
    await repo.approveOrder(order.id, DEMO_PROFILE_ID);

    const agentBefore = await repo.getAgentByHandle(
      (await repo.getOrder(order.id))!.agent.handle,
    );

    for (const rating of [Number.NaN, 0, 6, 4.5, Number.POSITIVE_INFINITY]) {
      await expect(
        repo.createReview({ orderId: order.id, rating, body: "Bad rating." }, DEMO_PROFILE_ID),
        `rating ${rating} must be refused`,
      ).rejects.toBeInstanceOf(ValidationError);
    }

    const agentAfter = await repo.getAgentByHandle(agentBefore!.handle);
    expect(Number.isFinite(agentAfter!.rating_avg)).toBe(true);
    expect(agentAfter!.rating_avg).toBe(agentBefore!.rating_avg);
    expect(agentAfter!.rating_count).toBe(agentBefore!.rating_count);
  });

  it("refuses a bid on your own bounty, from any caller", async () => {
    // The UI action refused this; the repository did not, so REST and MCP could
    // post → bid → award → approve and mint `jobs_completed` for a cent.
    const job = await repo.createJob(
      {
        title: "Self-bid probe bounty",
        description: "Posted by the demo human, bid on by the demo human's own agent.",
        category: "research",
        budget_cents: 500,
        deadline_seconds: 1800,
        required_output: { format: "csv" },
        data_policy: { pii: "none", retention_days: 0, allow_subcontracting: false },
      },
      DEMO_PROFILE_ID,
    );
    const mine = (await repo.listAgentsByOwner(DEMO_PROFILE_ID))[0];

    await expect(
      repo.placeBid({
        jobId: job.id,
        agentHandle: mine.handle,
        amountCents: 1,
        etaSeconds: 60,
        note: "Bidding on myself.",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("a paused gig is not for sale", () => {
  it("refuses an order and is exercised by the seed", async () => {
    const paused = seed.gigs.find((gig) => gig.status === "paused");
    // Seller controls that no seeded row exercises are the ones that break.
    expect(paused, "the seed must keep one paused gig").toBeDefined();

    await expect(
      repo.orderGig({
        gigSlug: paused!.slug,
        tier: "basic",
        brief: "Ordering a paused listing.",
        buyerId: DEMO_PROFILE_ID,
        approved: true,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // …and it is not offered for sale in the first place.
    const listed = await repo.listGigs({ limit: 100 });
    expect(listed.some((gig) => gig.slug === paused!.slug)).toBe(false);
  });
});

describe("the spend pause", () => {
  it("refuses every unattended hold while it is on, and only those", async () => {
    await repo.updateWalletPolicy(DEMO_PROFILE_ID, { autonomousPaused: true });

    // An API key / MCP client never sets `approved` — that is what "unattended"
    // means, and the Command Center switch says no unattended run can start.
    await expect(
      repo.orderGig({
        gigSlug: CHEAP_GIG,
        tier: "basic",
        brief: "Machine hire while paused.",
        buyerId: DEMO_PROFILE_ID,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // A human who clicked Continue is not blocked by the *external* spend
    // switch — the copy is explicit that it governs external agents.
    const human = await repo.orderGig({
      gigSlug: CHEAP_GIG,
      tier: "basic",
      brief: "Human hire while paused.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });
    expect(human.status).toBe("queued");

    await repo.updateWalletPolicy(DEMO_PROFILE_ID, { autonomousPaused: false });
    const resumed = await repo.getWallet(DEMO_PROFILE_ID);
    // Resuming restores the real ceiling: nothing was ever clamped, so nothing
    // can be stranded at one cent by a double toggle or a cleared cookie.
    expect(resumed!.autonomous_spend_limit_cents).toBe(2000);
  });

  it("treats a zero limit as no unattended spend, never as no ceiling", async () => {
    await repo.updateWalletPolicy(DEMO_PROFILE_ID, {
      approvalThresholdCents: 0,
      autonomousSpendLimitCents: 0,
    });

    await expect(
      repo.orderGig({
        gigSlug: CHEAP_GIG,
        tier: "basic",
        brief: "Anything at all, unattended.",
        buyerId: DEMO_PROFILE_ID,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
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

  it("still resets after an unrelated wallet write on the new day", async () => {
    // The counter used to key off `wallets.updated_at`, so a top-up, a policy
    // save or the Command Center pause refreshed the day without zeroing the
    // total — and yesterday's spend was charged against today's ceiling for
    // ever, with no way to clear it from the UI.
    const seeded = await repo.getWallet(DEMO_PROFILE_ID);
    expect(seeded!.spend_today_cents).toBeGreaterThan(0);

    now += 36 * 60 * 60 * 1000; // tomorrow

    await repo.topUp(DEMO_PROFILE_ID, 100);
    await repo.updateWalletPolicy(DEMO_PROFILE_ID, { approvalThresholdCents: 500 });

    const order = await repo.orderGig({
      gigSlug: CHEAP_GIG,
      tier: "basic",
      brief: "First spend of the new day, after a top-up.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });

    const after = await repo.getWallet(DEMO_PROFILE_ID);
    expect(after!.spend_today_cents).toBe(order.amount_cents);
    expect(after!.spend_today_date).toBe(
      new Date(now).toISOString().slice(0, 10),
    );
  });
});

describe("the register-an-agent wizard", () => {
  it("suggests a handle that is not already taken", () => {
    // A placeholder a user copies has to be available, or the very first thing
    // the wizard does is reject them.
    const source = readFileSync(
      join(process.cwd(), "components/agents/onboarding-wizard.tsx"),
      "utf8",
    );
    const placeholders = [...source.matchAll(/placeholder="([a-z0-9-]{2,32})"/g)].map(
      (match) => match[1],
    );
    expect(placeholders.length).toBeGreaterThan(0);
    const handles = new Set(seed.agents.map((agent) => agent.handle));
    for (const placeholder of placeholders) {
      expect(handles.has(placeholder), `@${placeholder} is a seeded agent`).toBe(false);
    }
  });
});

describe("@World quotes what it charges", () => {
  it("prices every ranked agent and every guild step from the gig it will order", async () => {
    const result = await routeOutcome(
      { outcome: "Find 200 roofing companies in Tampa under $10" },
      { repo, limit: 6 },
    );

    // The button used to read `agent.starting_price_cents × volumeFactor` while
    // the hold was the basic package of a gig picked separately: "$1.52" on the
    // button, $5.64 out of the wallet.
    for (const entry of result.ranked) {
      expect(entry.gigSlug, `${entry.agent.handle} must quote a real gig`).toBeTruthy();
      const gig = await repo.getGigBySlug(entry.gigSlug!);
      const basic = gig!.packages.find((pkg) => pkg.tier === "basic");
      expect(entry.estimateCents).toBe(basic!.price_cents);
      expect(entry.etaSeconds).toBe(basic!.delivery_seconds);
    }

    expect(result.guild).not.toBeNull();
    let total = 0;
    for (const step of result.guild!.steps) {
      const gig = await repo.getGigBySlug(step.gigSlug!);
      const basic = gig!.packages.find((pkg) => pkg.tier === "basic");
      expect(step.estimateCents).toBe(basic!.price_cents);
      total += step.estimateCents;
    }
    // The headline figure on "Assemble & run" is the sum of what it orders.
    expect(result.guild!.estimateCents).toBe(total);
  });

  it("orders the shortlist by the number it prints", async () => {
    const result = await routeOutcome(
      { outcome: "Find 200 roofing companies in Tampa under $10" },
      { repo, limit: 6 },
    );
    const fits = result.ranked.map((entry) => entry.fit);
    // `fit` is the sort key; the row renders `fit` as its headline figure, so
    // the list can no longer read out of order under "best fit first".
    expect([...fits].sort((a, b) => b - a)).toEqual(fits);
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

describe("search speaks the query's language", () => {
  it("matches per term, not the whole phrase, in the mode the app ships in", async () => {
    // The demo adapter tested `haystack.includes(wholeQuery)`, so every
    // multi-word query returned nothing — while the Supabase adapter routed the
    // same query through `websearch_to_tsquery` (per-term, stemmed, stopwords
    // dropped) and answered. Two modes, two different marketplaces.
    const single = await repo.listAgents({ q: "roofing" });
    expect(single.length).toBeGreaterThan(0);

    for (const query of ["roofing leads", "roofing leads in Tampa", "landing page"]) {
      const agents = await repo.listAgents({ q: query });
      expect(agents.length, `listAgents({ q: "${query}" }) must not be empty`).toBeGreaterThan(0);
    }

    const gigs = await repo.listGigs({ q: "landing page" });
    expect(gigs.length).toBeGreaterThan(0);

    // A genuinely unmatched query is still the empty state — that is what the
    // @World / post-a-bounty escape hatch is for.
    expect(await repo.listAgents({ q: "zzzz-nothing-matches-this" })).toEqual([]);
  });

  it("drops stopwords in /search and falls back to the best partial match", async () => {
    const roofing = await repo.searchDistrict("roofing");
    expect(roofing.total).toBeGreaterThan(0);

    // "in" alone used to zero a result that matched everything else typed.
    const natural = await repo.searchDistrict("roofing leads in Tampa");
    expect(natural.total).toBeGreaterThan(0);

    const mixed = await repo.searchDistrict("landing page roofing");
    expect(mixed.total).toBeGreaterThan(0);

    expect((await repo.searchDistrict("zzzz-nothing-matches-this")).total).toBe(0);
  });
});

describe("the browse front door", () => {
  it("does not open on four free filler listings", async () => {
    // `runs_count` alone put the four free gigs (61,840 runs between them) at
    // the top of /gigs, so the marketplace's front door read FREE · FREE ·
    // FREE · FREE and no gig the home page features appeared until page two.
    const firstRow = (await repo.listGigs({ limit: 4 })).map((gig) => gig.starting_price_cents);
    expect(firstRow.every((price) => price > 0)).toBe(true);

    const pageOne = (await repo.listGigs({ limit: 12 })).map((gig) => gig.slug);
    const featured = (await repo.getFeaturedGigs(3)).map((gig) => gig.slug);
    expect(pageOne.some((slug) => featured.includes(slug))).toBe(true);
  });
});

describe("a run says how long is left", () => {
  it("counts down rather than reprinting the SLA", () => {
    // `/orders` printed `eta_seconds` — the package's whole delivery SLA — under
    // the label "ETA", so a run at 96% advertised "ETA 25 min" while the
    // Command Center said "~1 min left" about the same order.
    expect(remainingRunSeconds(600, 0)).toBe(600);
    expect(remainingRunSeconds(600, 50)).toBe(300);
    expect(remainingRunSeconds(600, 100)).toBe(0);
    expect(remainingRunSeconds(600, 140)).toBe(0);

    expect(runTimeLabel(600, 50, true)).toMatch(/left$/);
    expect(runTimeLabel(600, 100, true)).toBe("finishing up");
    expect(runTimeLabel(600, 100, false)).toMatch(/^SLA /);
  });
});

describe("the simulated deliverable", () => {
  it("names only files it actually ships", async () => {
    // The markdown branch reused the generic row template: "**file** —
    // assets/hero@2x.png / **change** — Created the record / **status** — needs
    // review", naming one file that appeared in none of the four attachments.
    const development = seed.gigs.filter((gig) => gig.category === "development");
    expect(development.length).toBeGreaterThan(0);

    let checked = 0;
    for (const gig of development) {
      const output = buildContractDeliverable({
        contract: gig.output_contract,
        category: gig.category,
        title: gig.title,
        agentName: "WebBuilder",
        agentHandle: "webbuilder",
        slug: gig.slug,
        rng: rngFor(`deliverable:${gig.slug}`),
        seed: `deliverable:${gig.slug}`,
      });
      if (output.format !== "markdown" || !output.files) continue;
      checked += 1;

      const shipped = new Set(output.files.map((file) => file.path));
      const named = [...(output.markdown ?? "").matchAll(/`([^`]+\.[a-z0-9]+)`/g)].map(
        (match) => match[1],
      );
      expect(named.length, `${gig.slug} must list its files in the body`).toBeGreaterThan(0);
      for (const path of named) {
        expect(shipped.has(path), `${gig.slug} names ${path} but does not ship it`).toBe(true);
      }
      expect(named.length).toBe(output.files.length);
      expect(output.markdown).not.toContain("Created the record");
    }
    expect(checked).toBeGreaterThan(0);
  });
});
