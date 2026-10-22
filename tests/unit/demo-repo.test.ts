// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createDemoRepository, type DemoRepository } from "@/lib/data/demo";
import {
  ConflictError,
  ForbiddenError,
  InsufficientFundsError,
  NotFoundError,
} from "@/lib/data/errors";
import { analyticsDates } from "@/lib/data/analytics";
import { ANALYTICS_DAYS } from "@/lib/data/types";
import {
  AUSTIN_AVAILABLE_CENTS,
  DEMO_API_KEY,
  DEMO_PROFILE_ID,
  SEED_EPOCH_MS,
  profileId,
  seed,
} from "@/lib/seed";

/**
 * The demo adapter is what every zero-env visitor actually uses, so these tests
 * walk the two money paths end to end (gig → run → approval, and job → bid →
 * award) and pin the wallet invariants BUILD_SPEC §2/§6 depend on.
 *
 * The clock is injected: `now` starts at `SEED_EPOCH` so seeded orders read
 * exactly as seeded, and tests move it forward by hand.
 */

let now = SEED_EPOCH_MS;
let repo: DemoRepository;

beforeEach(() => {
  now = SEED_EPOCH_MS;
  repo = createDemoRepository({ now: () => now });
});

/**
 * A cheap gig by an agent the demo human does **not** own. Ownership matters:
 * a creator may not review their own agent, so the lifecycle test would
 * otherwise be exercising a path the repository (rightly) refuses.
 */
const CHEAP_GIG = "permit-and-code-lookup";

describe("stats and events", () => {
  it("reports verifiable row counts and nothing else", async () => {
    const stats = await repo.getNetworkStats();

    // These are the row counts the seed actually produces, and they are the
    // numbers the home hero prints. There is no second, larger `headline` set
    // any more: one truth, so no surface can disagree with another.
    expect(stats).toEqual({
      agentsOnline: seed.agents.filter((agent) => agent.status !== "offline").length,
      jobsPosted: seed.jobs.length,
      gigsAvailable: seed.gigs.filter((gig) => gig.status === "active").length,
      liveChannels: seed.channels.filter((channel) => channel.is_live).length,
      guildsActive: seed.guilds.filter((guild) => guild.status === "available").length,
    });
    expect(stats.agentsOnline).toBeGreaterThan(20);
    expect(stats.gigsAvailable).toBeGreaterThan(20);
    expect("headline" in stats).toBe(false);
  });

  it("publishes events to the top of the feed and to subscribers", async () => {
    const seen: string[] = [];
    const unsubscribe = repo.subscribe((event) => seen.push(event.headline));

    await repo.publishEvent({
      kind: "available",
      actor_type: "agent",
      actor_name: "Scout",
      headline: "Scout is available",
      body: "Local business research",
    });

    const [first] = await repo.listEvents({ limit: 1 });
    expect(first.headline).toBe("Scout is available");
    expect(seen).toContain("Scout is available");
    unsubscribe();
  });
});

describe("order lifecycle: gig → run → delivered → approved", () => {
  it("holds funds, advances deterministically, then releases and bumps reputation", async () => {
    const gig = await repo.getGigBySlug(CHEAP_GIG);
    expect(gig).not.toBeNull();
    const basic = gig!.packages.find((pkg) => pkg.tier === "basic");
    expect(basic).toBeDefined();

    const walletBefore = await repo.getWallet(DEMO_PROFILE_ID);
    const agentBefore = await repo.getAgentByHandle(gig!.agent.handle);
    expect(walletBefore).not.toBeNull();
    expect(walletBefore!.balance_cents - walletBefore!.held_cents).toBe(AUSTIN_AVAILABLE_CENTS);

    // 1. Order — funds are held, not spent.
    const order = await repo.orderGig({
      gigSlug: CHEAP_GIG,
      tier: "basic",
      brief: "100 gutter companies in Brevard County with owner contacts.",
      buyerId: DEMO_PROFILE_ID,
    });
    expect(order.status).toBe("queued");
    expect(order.amount_cents).toBe(basic!.price_cents);

    const walletHeld = await repo.getWallet(DEMO_PROFILE_ID);
    expect(walletHeld!.held_cents).toBe(walletBefore!.held_cents + order.amount_cents);
    expect(walletHeld!.balance_cents).toBe(walletBefore!.balance_cents);

    const holds = (await repo.listTransactions(DEMO_PROFILE_ID, 50)).filter(
      (tx) => tx.order_id === order.id,
    );
    expect(holds).toHaveLength(1);
    expect(holds[0].kind).toBe("hold");
    expect(holds[0].amount_cents).toBe(-order.amount_cents);

    // 2. Halfway through the ETA the run is running, not finished.
    now += (order.eta_seconds * 1000) / 2;
    const midway = await repo.refreshOrder(order.id);
    expect(midway.status).toBe("running");
    expect(midway.progress).toBeGreaterThan(40);
    expect(midway.progress).toBeLessThan(60);
    expect(midway.output).toBeNull();

    // Approving before delivery is a conflict, not a silent success.
    await expect(repo.approveOrder(order.id, DEMO_PROFILE_ID)).rejects.toBeInstanceOf(
      ConflictError,
    );

    // 3. Past the ETA it delivers a structured payload matching the contract.
    now += order.eta_seconds * 1000;
    const delivered = await repo.refreshOrder(order.id);
    expect(delivered.status).toBe("delivered");
    expect(delivered.progress).toBe(100);
    expect(delivered.output).not.toBeNull();
    expect(delivered.output!.format).toBe(gig!.output_contract.format);
    expect(delivered.delivered_at).not.toBeNull();

    // 4. Approve — the hold becomes a release and the money leaves.
    const approved = await repo.approveOrder(order.id, DEMO_PROFILE_ID);
    expect(approved.status).toBe("approved");
    expect(approved.cost_breakdown).not.toBeNull();
    expect(approved.cost_breakdown!.total_cents).toBe(order.amount_cents);
    expect(
      approved.cost_breakdown!.agent_cents +
        approved.cost_breakdown!.district_fee_cents +
        approved.cost_breakdown!.tools_cents,
    ).toBe(order.amount_cents);
    expect(approved.cost_breakdown!.district_fee_cents).toBe(
      Math.round(order.amount_cents * 0.1),
    );

    const walletAfter = await repo.getWallet(DEMO_PROFILE_ID);
    expect(walletAfter!.held_cents).toBe(walletBefore!.held_cents);
    expect(walletAfter!.balance_cents).toBe(walletBefore!.balance_cents - order.amount_cents);

    const ledger = (await repo.listTransactions(DEMO_PROFILE_ID, 50)).filter(
      (tx) => tx.order_id === order.id,
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0].kind).toBe("release");

    const agentAfter = await repo.getAgentByHandle(gig!.agent.handle);
    expect(agentAfter!.jobs_completed).toBe(agentBefore!.jobs_completed + 1);

    // 5. A review nudges the rating without recomputing the lifetime count.
    const review = await repo.createReview(
      { orderId: order.id, rating: 5, body: "Clean list, every phone worked." },
      DEMO_PROFILE_ID,
    );
    expect(review.agent_id).toBe(agentAfter!.id);
    const agentReviewed = await repo.getAgentByHandle(gig!.agent.handle);
    expect(agentReviewed!.rating_count).toBe(agentBefore!.rating_count + 1);
    expect(agentReviewed!.rating_avg).toBeGreaterThan(0);

    // A second review on the same order is a conflict.
    await expect(
      repo.createReview({ orderId: order.id, rating: 4, body: "again" }, DEMO_PROFILE_ID),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses an order the wallet cannot cover", async () => {
    const expensive = (await repo.listGigs({ sort: "price", limit: 60 })).at(-1);
    expect(expensive).toBeDefined();
    expect(expensive!.starting_price_cents).toBeGreaterThan(AUSTIN_AVAILABLE_CENTS);

    await expect(
      repo.orderGig({
        gigSlug: expensive!.slug,
        tier: "premium",
        brief: "Way beyond the demo wallet.",
        buyerId: DEMO_PROFILE_ID,
      }),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
  });

  it("only lets the buyer approve or dispute", async () => {
    const order = await repo.orderGig({
      gigSlug: CHEAP_GIG,
      tier: "basic",
      brief: "Ownership check.",
      buyerId: DEMO_PROFILE_ID,
    });
    now += order.eta_seconds * 1000 + 1000;
    await repo.refreshOrder(order.id);

    await expect(repo.approveOrder(order.id, profileId("devdan"))).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    const disputed = await repo.disputeOrder(order.id, DEMO_PROFILE_ID, "Rows were stale");
    expect(disputed.status).toBe("disputed");
    expect(disputed.audit_log.at(-1)?.detail).toBe("Rows were stale");
  });

  it("recomputes seeded progress instead of jumping on first read", async () => {
    const active = (await repo.listOrders({ buyerId: DEMO_PROFILE_ID })).filter(
      (order) => order.status === "running",
    );
    expect(active.length).toBeGreaterThan(0);
    for (const order of active) {
      expect(order.progress).toBeGreaterThan(0);
      expect(order.progress).toBeLessThan(100);
    }
  });
});

describe("job → bid → accept → order", () => {
  it("awards the job, rejects the other bids and starts a run", async () => {
    const job = await repo.createJob(
      {
        title: "Find 120 pool companies on the Treasure Coast",
        description: "Name, owner, phone, email, website. CSV back.",
        category: "research",
        budget_cents: 600,
        deadline_seconds: 1800,
        required_output: { format: "csv", columns: ["business_name", "owner", "phone"] },
        data_policy: { pii: "none", retention_days: 0, allow_subcontracting: false },
      },
      DEMO_PROFILE_ID,
    );
    expect(job.status).toBe("open");

    // `datafox` belongs to another creator: the demo human posted this bounty
    // and cannot bid on it with one of his own agents (`scout` is his).
    const winning = await repo.placeBid({
      jobId: job.id,
      agentHandle: "datafox",
      amountCents: 220,
      etaSeconds: 300,
      note: "Have this dataset warm.",
    });
    const losing = await repo.placeBid({
      jobId: job.id,
      agentHandle: "researchotter",
      amountCents: 380,
      etaSeconds: 900,
      note: "Two-source verified.",
    });

    const withBids = await repo.getJob(job.id);
    expect(withBids!.bids).toHaveLength(2);
    expect(withBids!.bids[0].amount_cents).toBeLessThanOrEqual(withBids!.bids[1].amount_cents);

    const listed = (await repo.listJobs({ status: "open" })).find((row) => row.id === job.id);
    expect(listed?.bidCount).toBe(2);

    const walletBefore = await repo.getWallet(DEMO_PROFILE_ID);
    const order = await repo.acceptBid({
      jobId: job.id,
      bidId: winning.id,
      buyerId: DEMO_PROFILE_ID,
    });

    expect(order.job_id).toBe(job.id);
    expect(order.bid_id).toBe(winning.id);
    expect(order.amount_cents).toBe(220);
    expect(order.eta_seconds).toBe(300);

    const walletAfter = await repo.getWallet(DEMO_PROFILE_ID);
    expect(walletAfter!.held_cents).toBe(walletBefore!.held_cents + 220);

    const awarded = await repo.getJob(job.id);
    expect(awarded!.status).toBe("in_progress");
    expect(awarded!.awarded_bid_id).toBe(winning.id);
    expect(awarded!.bids.find((bid) => bid.id === winning.id)!.status).toBe("accepted");
    expect(awarded!.bids.find((bid) => bid.id === losing.id)!.status).toBe("rejected");

    // Awarding twice is a conflict.
    await expect(
      repo.acceptBid({ jobId: job.id, bidId: losing.id, buyerId: DEMO_PROFILE_ID }),
    ).rejects.toBeInstanceOf(ConflictError);

    // The run delivers against the job's required_output.
    now += order.eta_seconds * 1000 + 1000;
    const delivered = await repo.refreshOrder(order.id);
    expect(delivered.status).toBe("delivered");
    expect(delivered.output!.format).toBe("csv");
    expect(delivered.output!.columns).toEqual(["business_name", "owner", "phone"]);

    const completed = await repo.approveOrder(order.id, DEMO_PROFILE_ID);
    expect(completed.status).toBe("approved");
    expect((await repo.getJob(job.id))!.status).toBe("completed");
  });

  it("will not take a bid on a job that is no longer open", async () => {
    const job = await repo.createJob(
      {
        title: "Closed bounty",
        description: "Already awarded elsewhere.",
        category: "data",
        budget_cents: 400,
        deadline_seconds: 900,
        required_output: { format: "csv" },
        data_policy: { pii: "none", retention_days: 0, allow_subcontracting: false },
      },
      DEMO_PROFILE_ID,
    );
    const bid = await repo.placeBid({
      jobId: job.id,
      agentHandle: "csv-cleaner",
      amountCents: 100,
      etaSeconds: 120,
      note: "Free tier.",
    });
    await repo.acceptBid({ jobId: job.id, bidId: bid.id, buyerId: DEMO_PROFILE_ID });

    await expect(
      repo.placeBid({
        jobId: job.id,
        agentHandle: "datafox",
        amountCents: 90,
        etaSeconds: 100,
        note: "Too late.",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("search and filters", () => {
  it("filters agents by category, price, free tier and free-text", async () => {
    const research = await repo.listAgents({ category: "research" });
    expect(research.length).toBeGreaterThan(0);
    expect(research.every((agent) => agent.category === "research")).toBe(true);

    const cheap = await repo.listAgents({ maxPriceCents: 1000 });
    expect(cheap.every((agent) => agent.starting_price_cents <= 1000)).toBe(true);

    const free = await repo.listAgents({ freeOnly: true });
    expect(free.length).toBeGreaterThan(0);
    expect(free.every((agent) => agent.is_free)).toBe(true);

    const roofs = await repo.listAgents({ q: "roof" });
    expect(roofs.map((agent) => agent.handle)).toContain("roofintel");

    const skilled = await repo.listAgents({ skills: ["permits"] });
    expect(skilled.length).toBeGreaterThan(0);
  });

  it("sorts gigs by price and by speed", async () => {
    const byPrice = await repo.listGigs({ sort: "price", limit: 10 });
    for (let index = 1; index < byPrice.length; index += 1) {
      expect(byPrice[index - 1].starting_price_cents).toBeLessThanOrEqual(
        byPrice[index].starting_price_cents,
      );
    }
    const bySpeed = await repo.listGigs({ sort: "fastest", limit: 10 });
    for (let index = 1; index < bySpeed.length; index += 1) {
      expect(bySpeed[index - 1].delivery_seconds).toBeLessThanOrEqual(
        bySpeed[index].delivery_seconds,
      );
    }
  });

  it("returns the reference trending order, carrying no invented delta", async () => {
    const trending = await repo.getTrendingAgents(5);
    expect(trending.map((agent) => agent.handle)).toEqual([
      "scout",
      "otto",
      "webbuilder",
      "copycat",
      "mapfox",
    ]);

    // The shelf order is curated; the "▲ +312" momentum pill it used to carry
    // was not measurable and is gone from the row entirely. What the card shows
    // now is the rating, which is on the agent already.
    for (const agent of trending) {
      expect("trendDelta" in agent).toBe(false);
    }
    expect(trending[0].rating_avg).toBe(4.96);
    expect(trending[0].rating_count).toBe(1842);
  });

  it("keeps every gig joined to a real agent", async () => {
    const gigs = await repo.listGigs({ limit: 100 });
    expect(gigs.length).toBeGreaterThan(20);
    expect(gigs.every((gig) => gig.agent.id === gig.agent_id)).toBe(true);
  });
});

describe("lounge, tv and inbox", () => {
  it("counts room presence and posts a message", async () => {
    const rooms = await repo.listRooms();
    expect(rooms.length).toBe(6);
    expect(rooms.reduce((total, room) => total + room.presenceCount, 0)).toBeGreaterThan(20);

    const message = await repo.postLoungeMessage({
      roomSlug: rooms[0].slug,
      authorType: "human",
      authorId: DEMO_PROFILE_ID,
      body: "Anyone got Florida permit data?",
    });
    expect(message.author_name).toBe("Austin");

    const messages = await repo.listLoungeMessages(rooms[0].slug, 10);
    expect(messages.at(-1)!.id).toBe(message.id);
  });

  it("opens a channel with hosts and chat, and accepts a new line", async () => {
    const [live] = await repo.listChannels({ liveOnly: true, limit: 1 });
    const channel = await repo.getChannelBySlug(live.slug);
    expect(channel!.hosts.length).toBeGreaterThan(0);
    expect(channel!.chat.length).toBeGreaterThan(0);

    const line = await repo.postChannelChat(live.slug, "Austin", "This demo is unreal");
    const reopened = await repo.getChannelBySlug(live.slug);
    expect(reopened!.chat.at(-1)!.id).toBe(line.id);
  });

  it("picks a channel's race deterministically when it runs more than one", async () => {
    // Research Race carries a live race and a finished one — the shape that took
    // every `/tv/<slug>` down on the Supabase adapter while `.find()` here hid it.
    const channel = seed.channels.find((row) => row.slug === "research-race")!;
    const races = seed.competitions.filter((row) => row.channel_id === channel.id);
    expect(races.length).toBeGreaterThanOrEqual(2);
    const latest = races.reduce((a, b) => (Date.parse(b.ends_at) > Date.parse(a.ends_at) ? b : a));

    // The `ChannelDetail.competition` pick: latest `ends_at` — the live race.
    const detail = await repo.getChannelBySlug("research-race");
    expect(detail!.competition!.id).toBe(latest.id);
    expect(detail!.competition!.status).toBe("live");

    // Not array order: reversed, the pick is the same.
    const reversed = structuredClone(seed);
    reversed.competitions.reverse();
    const fromReversed = createDemoRepository({ now: () => now, dataset: reversed });
    expect((await fromReversed.getChannelBySlug("research-race"))!.competition!.id).toBe(latest.id);

    // A tie on `ends_at` falls to the lowest `id`, in either array order.
    const lowestId = races.map((row) => row.id).sort()[0];
    for (const order of ["seeded", "reversed"] as const) {
      const tied = structuredClone(seed);
      for (const row of tied.competitions) {
        if (row.channel_id === channel.id) row.ends_at = latest.ends_at;
      }
      if (order === "reversed") tied.competitions.reverse();
      const fromTied = createDemoRepository({ now: () => now, dataset: tied });
      expect((await fromTied.getChannelBySlug("research-race"))!.competition!.id, order).toBe(
        lowestId,
      );
    }
  });

  it("threads a reply into the inbox", async () => {
    const threads = await repo.listThreads(DEMO_PROFILE_ID);
    expect(threads.length).toBeGreaterThan(0);

    const reply = await repo.sendMessage({
      threadId: threads[0].id,
      senderType: "human",
      senderId: DEMO_PROFILE_ID,
      body: "Ship it.",
    });
    const thread = await repo.getThread(threads[0].id);
    expect(thread!.messages.at(-1)!.id).toBe(reply.id);
    expect(thread!.unread_count).toBe(0);
  });
});

describe("wallet and api keys", () => {
  it("tops up and logs the credit", async () => {
    const before = await repo.getWallet(DEMO_PROFILE_ID);
    const after = await repo.topUp(DEMO_PROFILE_ID, 2500);
    expect(after.balance_cents).toBe(before!.balance_cents + 2500);
    const [latest] = await repo.listTransactions(DEMO_PROFILE_ID, 1);
    expect(latest.kind).toBe("topup");
    expect(latest.amount_cents).toBe(2500);
  });

  it("verifies the seeded demo key and rejects impostors", async () => {
    const key = await repo.verifyApiKey(DEMO_API_KEY);
    expect(key).not.toBeNull();
    expect(key!.profile_id).toBe(DEMO_PROFILE_ID);
    expect(key!.last_used_at).not.toBeNull();

    expect(await repo.verifyApiKey("ad_live_not_a_real_key")).toBeNull();
    expect(await repo.verifyApiKey("bearer-nonsense")).toBeNull();
  });

  it("mints a key that verifies with its sha256 digest", async () => {
    const created = await repo.createApiKey({
      profileId: DEMO_PROFILE_ID,
      label: "Test key",
      scopes: ["agents:read"],
    });
    expect(created.key.startsWith("ad_live_")).toBe(true);
    expect(created.record.key_hash.startsWith("sha256$")).toBe(true);

    const verified = await repo.verifyApiKey(created.key);
    expect(verified!.id).toBe(created.record.id);
  });

  it("signs demo sessions in as austin", async () => {
    const profile = await repo.getCurrentProfile();
    expect(profile!.handle).toBe("austin");
    expect(profile!.id).toBe(DEMO_PROFILE_ID);
  });
});

describe("creator flows", () => {
  it("registers an agent and publishes a gig for it", async () => {
    const agent = await repo.createAgent(
      {
        handle: "TestFox",
        name: "TestFox",
        tagline: "Regression sweeps for small sites",
        category: "development",
        skills: ["QA", "Regression"],
        pricing_model: "per_run",
        starting_price_cents: 30,
      },
      DEMO_PROFILE_ID,
    );
    expect(agent.handle).toBe("testfox");
    expect(agent.status).toBe("available");
    expect((await repo.listPresence(agent.room_slug ?? undefined)).some((row) => row.agent_id === agent.id)).toBe(true);

    const gig = await repo.createGig(
      {
        agentHandle: agent.handle,
        title: "I will smoke test your site",
        description: "Every route, both breakpoints, console errors reported.",
        category: "development",
        input_contract: { summary: "Your URL", fields: [] },
        output_contract: {
          summary: "A pass/fail table",
          format: "table",
          fields: [{ name: "route", type: "string", description: "Route tested" }],
        },
        packages: [
          {
            tier: "basic",
            name: "Smoke pass",
            description: "10 routes",
            price_cents: 120,
            delivery_seconds: 300,
            features: ["10 routes"],
          },
        ],
      },
      DEMO_PROFILE_ID,
    );
    expect(gig.slug).toBe("i-will-smoke-test-your-site");
    expect(gig.starting_price_cents).toBe(120);

    const owned = await repo.listAgentsByOwner(DEMO_PROFILE_ID);
    expect(owned.map((row) => row.handle)).toContain("testfox");

    await expect(
      repo.updateAgent(agent.handle, { tagline: "nope" }, profileId("devdan")),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const updated = await repo.updateAgent(
      agent.handle,
      { tagline: "Regression sweeps, fast" },
      DEMO_PROFILE_ID,
    );
    expect(updated.tagline).toBe("Regression sweeps, fast");
  });
});

describe("profiles", () => {
  it("edits the three columns /settings owns and leaves the rest alone", async () => {
    const before = await repo.getProfile(DEMO_PROFILE_ID);
    expect(before).not.toBeNull();

    const updated = await repo.updateProfile(DEMO_PROFILE_ID, {
      display_name: "  Austin C.  ",
      bio: "  Building the place for agents.  ",
      avatar_url: "district:🛰️:violet",
    });

    expect(updated.display_name).toBe("Austin C.");
    expect(updated.bio).toBe("Building the place for agents.");
    expect(updated.avatar_url).toBe("district:🛰️:violet");
    // Identity and authority are untouched — they are not in the patch type.
    expect(updated.handle).toBe(before!.handle);
    expect(updated.is_admin).toBe(true);
    expect(updated.is_verified_human).toBe(before!.is_verified_human);
  });

  it("empties a bio rather than storing whitespace, and refuses a stub name", async () => {
    const cleared = await repo.updateProfile(DEMO_PROFILE_ID, { bio: "   " });
    expect(cleared.bio).toBeNull();

    await expect(repo.updateProfile(DEMO_PROFILE_ID, { display_name: "A" })).rejects.toThrow();
    await expect(
      repo.updateProfile("00000000-0000-0000-0000-000000000000", { bio: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("analytics", () => {
  it("answers with lifetime totals and a zero-filled 14-day series", async () => {
    const analytics = await repo.getDistrictAnalytics();

    expect(analytics.totals).toEqual({
      humans: seed.profiles.length,
      agents: seed.agents.length,
      // Demo claims live beside the dataset and start empty — honest, not zeroed
      // by accident.
      claimedAgents: 0,
      posts: seed.events.filter((event) => event.kind === "post").length,
      orders: seed.orders.length,
      orderVolumeCents: seed.orders.reduce((sum, order) => sum + order.amount_cents, 0),
      gigs: seed.gigs.length,
      jobs: seed.jobs.length,
    });

    expect(analytics.daily).toHaveLength(ANALYTICS_DAYS);
    expect(analytics.daily.map((point) => point.date)).toEqual(analyticsDates(SEED_EPOCH_MS));
    // Oldest first, every day present, never a hole for a sparkline to guess at.
    for (const point of analytics.daily) {
      expect(Object.keys(point).sort()).toEqual(
        ["agents", "claims", "date", "humans", "orderVolumeCents", "orders", "posts"].sort(),
      );
    }
  });

  it("counts a run placed today into today's bucket", async () => {
    const before = await repo.getDistrictAnalytics();
    const today = analyticsDates(now).at(-1)!;
    const bucket = (a: Awaited<ReturnType<typeof repo.getDistrictAnalytics>>) =>
      a.daily.find((point) => point.date === today)!;

    const order = await repo.orderGig({
      gigSlug: CHEAP_GIG,
      tier: "basic",
      brief: "A run placed during the test, so the series has to move.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });

    const after = await repo.getDistrictAnalytics();
    expect(after.totals.orders).toBe(before.totals.orders + 1);
    expect(bucket(after).orders).toBe(bucket(before).orders + 1);
    expect(bucket(after).orderVolumeCents).toBe(
      bucket(before).orderVolumeCents + order.amount_cents,
    );
  });

  it("refuses a caller whose profile is not an operator", async () => {
    // Demo mode always signs in as @austin, so the condition to vary is the
    // flag, not the session — the same one the SQL function checks. Reads are
    // deep-copied out of the demo store, so the dataset is edited at the seam
    // the adapter provides for it rather than through a returned row.
    const dataset = structuredClone(seed);
    for (const profile of dataset.profiles) profile.is_admin = false;
    const demoted = createDemoRepository({ now: () => now, dataset });

    await expect(demoted.getDistrictAnalytics()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
