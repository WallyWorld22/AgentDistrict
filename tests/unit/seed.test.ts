import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { DistrictDataset } from "@/lib/data/types";
import {
  AGENT_CATEGORIES,
  EVENT_KINDS,
  MARKET_ITEM_KINDS,
  PACKAGE_TIERS,
} from "@/lib/data/types";
import { seed, seedCounts, TRENDING_RANK } from "@/lib/seed";
import { SEED_EPOCH } from "@/lib/seed/clock";
import { AUSTIN_AVAILABLE_CENTS } from "@/lib/seed/wallet";
import { DEMO_PROFILE_ID } from "@/lib/seed/profiles";
import { uuidv5 } from "@/lib/seed/uuid";

/**
 * The seed is content, so these tests are about *invariants*, not snapshots:
 * every quantity BUILD_SPEC §2 asks for, every foreign key resolving, every
 * slug unique, every money value an integer, and the migration containing a
 * column for every field the seed emits.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const ids = {
  profiles: new Set(seed.profiles.map((row) => row.id)),
  stores: new Set(seed.stores.map((row) => row.id)),
  agents: new Set(seed.agents.map((row) => row.id)),
  gigs: new Set(seed.gigs.map((row) => row.id)),
  jobs: new Set(seed.jobs.map((row) => row.id)),
  bids: new Set(seed.bids.map((row) => row.id)),
  guilds: new Set(seed.guilds.map((row) => row.id)),
  orders: new Set(seed.orders.map((row) => row.id)),
  channels: new Set(seed.channels.map((row) => row.id)),
  competitions: new Set(seed.competitions.map((row) => row.id)),
  threads: new Set(seed.threads.map((row) => row.id)),
  rooms: new Set(seed.rooms.map((row) => row.slug)),
};

function unique<T>(values: T[]): boolean {
  return new Set(values).size === values.length;
}

/* -------------------------------------------------------------------------- */

describe("seed — quantities (BUILD_SPEC §2)", () => {
  it("has at least 24 agents across every category", () => {
    expect(seed.agents.length).toBeGreaterThanOrEqual(24);
    const covered = new Set(seed.agents.map((agent) => agent.category));
    for (const category of AGENT_CATEGORIES) {
      expect(covered, `no agent in category ${category}`).toContain(category);
    }
  });

  it("has at least 30 gigs, 12 jobs, 12 market items and 30 events", () => {
    expect(seed.gigs.length).toBeGreaterThanOrEqual(30);
    expect(seed.jobs.length).toBeGreaterThanOrEqual(12);
    expect(seed.marketItems.length).toBeGreaterThanOrEqual(12);
    expect(seed.events.length).toBeGreaterThanOrEqual(30);
  });

  it("has exactly 6 guilds, 5 stores, 8 channels, 3 competitions and 6 rooms", () => {
    expect(seedCounts.guilds).toBe(6);
    expect(seedCounts.stores).toBe(5);
    expect(seedCounts.channels).toBe(8);
    // Three live races, plus one finished and one upcoming so those statuses
    // and the UI branches that render them are exercised by real content.
    expect(seedCounts.competitions).toBe(5);
    expect(seedCounts.rooms).toBe(6);
  });

  it("has a presence row for every agent, in a real room", () => {
    expect(seed.presence).toHaveLength(seed.agents.length);
    expect(unique(seed.presence.map((row) => row.agent_id))).toBe(true);
    for (const row of seed.presence) {
      expect(ids.agents).toContain(row.agent_id);
      expect(ids.rooms).toContain(row.room_slug);
    }
  });

  it("has at least 40 lounge messages, 6 threads and 40 reviews", () => {
    expect(seed.loungeMessages.length).toBeGreaterThanOrEqual(40);
    expect(seed.threads.length).toBeGreaterThanOrEqual(6);
    expect(seed.reviews.length).toBeGreaterThanOrEqual(40);
  });

  it("gives the demo user at least 12 wallet transactions and 3 completed orders", () => {
    const austinTx = seed.walletTransactions.filter(
      (tx) => tx.profile_id === DEMO_PROFILE_ID,
    );
    expect(austinTx.length).toBeGreaterThanOrEqual(12);

    const completed = seed.orders.filter(
      (order) => order.buyer_id === DEMO_PROFILE_ID && order.status === "approved",
    );
    expect(completed.length).toBeGreaterThanOrEqual(3);
  });

  it("covers every market item kind and every event kind", () => {
    const kinds = new Set(seed.marketItems.map((item) => item.kind));
    for (const kind of MARKET_ITEM_KINDS) {
      expect(kinds, `no market item of kind ${kind}`).toContain(kind);
    }
    const eventKinds = new Set(seed.events.map((event) => event.kind));
    for (const kind of EVENT_KINDS) {
      expect(eventKinds, `no event of kind ${kind}`).toContain(kind);
    }
  });

  it("keeps most jobs open with 2-4 bids each", () => {
    const open = seed.jobs.filter((job) => job.status === "open");
    expect(open.length).toBeGreaterThanOrEqual(Math.ceil(seed.jobs.length / 2));

    for (const job of open) {
      const count = seed.bids.filter((bid) => bid.job_id === job.id).length;
      expect(count, `job "${job.title}" has ${count} bids`).toBeGreaterThanOrEqual(2);
      expect(count, `job "${job.title}" has ${count} bids`).toBeLessThanOrEqual(4);
    }
  });

  it("never lets one agent bid against itself on the same bounty", () => {
    // Three jobs used to list the same agent twice at two prices — same avatar,
    // same name, side by side. The reverse-market pitch is that agents compete;
    // one agent underbidding itself reads as a bug on the bid table.
    const handleOf = new Map(seed.agents.map((agent) => [agent.id, agent.handle]));
    for (const job of seed.jobs) {
      const handles = seed.bids
        .filter((bid) => bid.job_id === job.id)
        .map((bid) => handleOf.get(bid.agent_id));
      expect(new Set(handles).size, `"${job.title}" has a repeated bidder`).toBe(handles.length);
    }
  });

  it("never lets a poster bid on their own bounty", () => {
    // Post → bid → award → approve would mint a completed job for a cent. Both
    // adapters refuse it now; the seed must not contradict them.
    const ownerOf = new Map(seed.agents.map((agent) => [agent.id, agent.owner_id]));
    const posterOf = new Map(seed.jobs.map((job) => [job.id, job.poster_id]));
    for (const bid of seed.bids) {
      expect(ownerOf.get(bid.agent_id)).not.toBe(posterOf.get(bid.job_id));
    }
  });

  it("gives the demo human an open bounty to award", () => {
    // Without one, the award-a-bid loop — the headline capability of
    // /jobs/[id] — is unreachable without first posting a bounty.
    const own = seed.jobs.filter(
      (job) => job.poster_id === DEMO_PROFILE_ID && job.status === "open",
    );
    expect(own.length).toBeGreaterThan(0);
    const bids = seed.bids.filter((bid) => bid.job_id === own[0].id);
    expect(bids.length).toBeGreaterThanOrEqual(3);
    expect(bids.every((bid) => bid.status === "pending")).toBe(true);
  });

  it("includes an awarded, an in-progress and a completed job", () => {
    const statuses = new Set(seed.jobs.map((job) => job.status));
    expect(statuses).toContain("awarded");
    expect(statuses).toContain("in_progress");
    expect(statuses).toContain("completed");
  });
});

/* -------------------------------------------------------------------------- */

describe("seed — the named cast", () => {
  const byHandle = new Map(seed.agents.map((agent) => [agent.handle, agent]));

  const REQUIRED: Array<[handle: string, emoji: string]> = [
    ["scout", "🔭"],
    ["otto", "🤖"],
    ["webbuilder", "🧩"],
    ["parcelpro", "📍"],
    ["copycat", "✍️"],
    ["mapfox", "🗺️"],
    ["qa-fox", "🦊"],
    ["adpilot", "📣"],
    ["deepresearch", "🧠"],
    ["caredesk", "🎧"],
    ["roofintel", "🏠"],
    ["localintel", "📊"],
    ["researchotter", "🦦"],
    ["datafox", "📂"],
    ["sitesprint", "⚡"],
    ["builderbot", "🛠️"],
    ["wally", "🦦"],
    ["quickpdf", "📄"],
    ["unitfox", "📐"],
    ["newsbrief", "📰"],
    ["csv-cleaner", "🧹"],
  ];

  it.each(REQUIRED)("includes @%s with the %s avatar", (handle, emoji) => {
    const agent = byHandle.get(handle);
    expect(agent, `missing required agent @${handle}`).toBeDefined();
    expect(agent?.avatar_emoji).toBe(emoji);
  });

  it("marks QuickPDF, UnitFox, NewsBrief and CSV Cleaner as free", () => {
    for (const handle of ["quickpdf", "unitfox", "newsbrief", "csv-cleaner"]) {
      const agent = byHandle.get(handle);
      expect(agent?.is_free, `@${handle} should be free`).toBe(true);
      expect(agent?.starting_price_cents).toBe(0);
    }
  });

  it("keeps the legacy stats exactly (they are on the reference screenshot)", () => {
    const scout = byHandle.get("scout");
    expect(scout?.starting_price_cents).toBe(8);
    expect(scout?.rating_avg).toBe(4.96);
    expect(scout?.rating_count).toBe(1842);
    expect(scout?.reliability).toBe(0.998);
    expect(scout?.repeat_hire_rate).toBe(0.71);
    expect(scout?.avg_latency_sec).toBe(42);

    expect(byHandle.get("qa-fox")?.rating_avg).toBe(4.97);
    expect(byHandle.get("deepresearch")?.rating_avg).toBe(4.99);
    expect(byHandle.get("webbuilder")?.starting_price_cents).toBe(124);
    expect(byHandle.get("webbuilder")?.pricing_model).toBe("from");
    expect(byHandle.get("parcelpro")?.starting_price_cents).toBe(42);
    expect(byHandle.get("caredesk")?.starting_price_cents).toBe(4);
  });

  it("keeps TRENDING_RANK an ordering over real handles only", () => {
    // Renamed from TRENDING_DELTAS when the "▲ +312" momentum pills came off
    // the home page: these are shelf-order weights for the founding cast, never
    // a figure anything prints. A typo here would silently drop an agent out of
    // the curated order and into the computed fallback.
    for (const handle of Object.keys(TRENDING_RANK)) {
      expect(byHandle.has(handle), `TRENDING_RANK names unknown @${handle}`).toBe(true);
    }
    const weights = Object.values(TRENDING_RANK);
    expect(weights.length).toBeGreaterThan(10);
    expect(new Set(weights).size).toBe(weights.length);
    expect(TRENDING_RANK.scout).toBeGreaterThan(TRENDING_RANK.otto);
  });

  it("seeds no webhook endpoint (demo runs must never call out)", () => {
    for (const agent of seed.agents) {
      expect(agent.endpoints.webhook, `@${agent.handle} has a webhook`).toBeUndefined();
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("seed — referential integrity", () => {
  it("resolves every profile-owned foreign key", () => {
    for (const store of seed.stores) expect(ids.profiles).toContain(store.owner_id);
    for (const job of seed.jobs) expect(ids.profiles).toContain(job.poster_id);
    for (const thread of seed.threads) expect(ids.profiles).toContain(thread.profile_id);
    for (const wallet of seed.wallets) expect(ids.profiles).toContain(wallet.profile_id);
    for (const tx of seed.walletTransactions) expect(ids.profiles).toContain(tx.profile_id);
    for (const key of seed.apiKeys) expect(ids.profiles).toContain(key.profile_id);
    for (const review of seed.reviews) expect(ids.profiles).toContain(review.reviewer_id);
    for (const order of seed.orders) expect(ids.profiles).toContain(order.buyer_id);
  });

  it("resolves every agent-owned foreign key", () => {
    for (const agent of seed.agents) {
      expect(ids.profiles).toContain(agent.owner_id);
      if (agent.store_id !== null) expect(ids.stores).toContain(agent.store_id);
      if (agent.room_slug !== null) expect(ids.rooms).toContain(agent.room_slug);
    }
    for (const gig of seed.gigs) expect(ids.agents).toContain(gig.agent_id);
    for (const bid of seed.bids) expect(ids.agents).toContain(bid.agent_id);
    for (const member of seed.guildMembers) expect(ids.agents).toContain(member.agent_id);
    for (const host of seed.channelHosts) expect(ids.agents).toContain(host.agent_id);
    for (const entry of seed.competitionEntries) {
      expect(ids.agents).toContain(entry.agent_id);
    }
    for (const order of seed.orders) expect(ids.agents).toContain(order.agent_id);
    for (const review of seed.reviews) expect(ids.agents).toContain(review.agent_id);
  });

  it("resolves every job / bid / order relationship", () => {
    for (const bid of seed.bids) {
      expect(ids.jobs).toContain(bid.job_id);
      if (bid.guild_id !== null) expect(ids.guilds).toContain(bid.guild_id);
    }
    for (const job of seed.jobs) {
      if (job.awarded_bid_id !== null) {
        expect(ids.bids).toContain(job.awarded_bid_id);
        const bid = seed.bids.find((candidate) => candidate.id === job.awarded_bid_id);
        expect(bid?.job_id).toBe(job.id);
        expect(bid?.status).toBe("accepted");
      }
    }
    for (const order of seed.orders) {
      if (order.gig_id !== null) expect(ids.gigs).toContain(order.gig_id);
      if (order.job_id !== null) expect(ids.jobs).toContain(order.job_id);
      if (order.bid_id !== null) expect(ids.bids).toContain(order.bid_id);
    }
  });

  it("resolves TV, lounge and inbox relationships", () => {
    for (const host of seed.channelHosts) expect(ids.channels).toContain(host.channel_id);
    for (const line of seed.channelChat) expect(ids.channels).toContain(line.channel_id);
    for (const comp of seed.competitions) expect(ids.channels).toContain(comp.channel_id);
    for (const entry of seed.competitionEntries) {
      expect(ids.competitions).toContain(entry.competition_id);
    }
    for (const member of seed.guildMembers) expect(ids.guilds).toContain(member.guild_id);
    for (const message of seed.loungeMessages) {
      if (message.room_slug !== null) expect(ids.rooms).toContain(message.room_slug);
    }
    for (const message of seed.messages) expect(ids.threads).toContain(message.thread_id);
    for (const thread of seed.threads) {
      if (thread.agent_id !== null) expect(ids.agents).toContain(thread.agent_id);
    }
    for (const tx of seed.walletTransactions) {
      if (tx.order_id !== null) expect(ids.orders).toContain(tx.order_id);
    }
    for (const review of seed.reviews) {
      if (review.order_id !== null) expect(ids.orders).toContain(review.order_id);
    }
    for (const item of seed.marketItems) {
      if (item.seller_store_id !== null) expect(ids.stores).toContain(item.seller_store_id);
    }
  });

  it("gives every profile a wallet", () => {
    expect(seed.wallets).toHaveLength(seed.profiles.length);
    expect(unique(seed.wallets.map((wallet) => wallet.profile_id))).toBe(true);
  });

  it("writes at most one review per order", () => {
    const orderIds = seed.reviews
      .map((review) => review.order_id)
      .filter((value): value is string => value !== null);
    expect(unique(orderIds)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe("seed — uniqueness", () => {
  it("keeps handles and slugs unique", () => {
    expect(unique(seed.profiles.map((row) => row.handle))).toBe(true);
    expect(unique(seed.agents.map((row) => row.handle))).toBe(true);
    expect(unique(seed.stores.map((row) => row.slug))).toBe(true);
    expect(unique(seed.gigs.map((row) => row.slug))).toBe(true);
    expect(unique(seed.guilds.map((row) => row.slug))).toBe(true);
    expect(unique(seed.rooms.map((row) => row.slug))).toBe(true);
    expect(unique(seed.channels.map((row) => row.slug))).toBe(true);
    expect(unique(seed.marketItems.map((row) => row.slug))).toBe(true);
    expect(unique(seed.apiKeys.map((row) => row.key_hash))).toBe(true);
  });

  it("keeps every primary key unique and well-formed", () => {
    for (const [table, rows] of Object.entries(seed) as Array<
      [string, Array<Record<string, unknown>>]
    >) {
      const withId = rows.filter((row) => typeof row.id === "string");
      if (withId.length === 0) continue;
      const values = withId.map((row) => row.id as string);
      expect(unique(values), `${table} has duplicate ids`).toBe(true);
      for (const value of values) {
        expect(value, `${table} id ${value} is not a UUIDv5`).toMatch(UUID_RE);
      }
    }
  });

  it("matches handle and slug column constraints from the migration", () => {
    const pattern = /^[a-z0-9][a-z0-9-]{1,38}$/;
    for (const profile of seed.profiles) expect(profile.handle).toMatch(pattern);
    for (const agent of seed.agents) expect(agent.handle).toMatch(pattern);
  });
});

/* -------------------------------------------------------------------------- */

describe("seed — money and numbers", () => {
  const moneyFields: Array<[label: string, values: number[]]> = [
    ["agents.starting_price_cents", seed.agents.map((r) => r.starting_price_cents)],
    ["gigs.starting_price_cents", seed.gigs.map((r) => r.starting_price_cents)],
    ["jobs.budget_cents", seed.jobs.map((r) => r.budget_cents)],
    ["bids.amount_cents", seed.bids.map((r) => r.amount_cents)],
    ["orders.amount_cents", seed.orders.map((r) => r.amount_cents)],
    ["guilds.starting_price_cents", seed.guilds.map((r) => r.starting_price_cents)],
    ["market_items.price_cents", seed.marketItems.map((r) => r.price_cents)],
    ["competitions.prize_cents", seed.competitions.map((r) => r.prize_cents)],
    ["wallets.balance_cents", seed.wallets.map((r) => r.balance_cents)],
    ["wallets.held_cents", seed.wallets.map((r) => r.held_cents)],
    ["wallet_transactions.amount_cents", seed.walletTransactions.map((r) => r.amount_cents)],
    ["gig package prices", seed.gigs.flatMap((r) => r.packages.map((p) => p.price_cents))],
  ];

  it.each(moneyFields)("%s is a finite integer", (_label, values) => {
    for (const value of values) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Number.isNaN(value)).toBe(false);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("never uses a negative amount outside the wallet ledger", () => {
    const nonLedger = moneyFields
      .filter(([label]) => label !== "wallet_transactions.amount_cents")
      .flatMap(([, values]) => values);
    for (const value of nonLedger) expect(value).toBeGreaterThanOrEqual(0);
  });

  it("keeps bids at or under their job's budget", () => {
    const budgets = new Map(seed.jobs.map((job) => [job.id, job.budget_cents]));
    for (const bid of seed.bids) {
      expect(bid.amount_cents).toBeLessThanOrEqual(budgets.get(bid.job_id) ?? 0);
    }
  });

  it("keeps ratings, rates and progress inside their column bounds", () => {
    for (const agent of seed.agents) {
      expect(agent.rating_avg).toBeGreaterThanOrEqual(0);
      expect(agent.rating_avg).toBeLessThanOrEqual(5);
      for (const rate of [agent.reliability, agent.repeat_hire_rate, agent.dispute_rate]) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
    }
    for (const order of seed.orders) {
      expect(order.progress).toBeGreaterThanOrEqual(0);
      expect(order.progress).toBeLessThanOrEqual(100);
      expect(order.eta_seconds).toBeGreaterThan(0);
    }
    for (const review of seed.reviews) {
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
    }
    for (const entry of seed.competitionEntries) {
      expect(entry.progress).toBeGreaterThanOrEqual(0);
      expect(entry.progress).toBeLessThanOrEqual(100);
      // A race that has not started has no accuracy yet; every entry that has
      // actually run must have one.
      if (entry.progress > 0) expect(entry.accuracy).toBeGreaterThan(0);
      expect(entry.accuracy).toBeGreaterThanOrEqual(0);
      expect(entry.accuracy).toBeLessThanOrEqual(1);
    }
  });

  it("balances every order's cost breakdown to the order total", () => {
    for (const order of seed.orders) {
      if (!order.cost_breakdown) continue;
      const { agent_cents, district_fee_cents, tools_cents, total_cents } =
        order.cost_breakdown;
      expect(agent_cents + district_fee_cents + tools_cents).toBe(total_cents);
      expect(total_cents).toBe(order.amount_cents);
    }
  });

  it("reproduces the $12.43 Credits pill from the reference screenshot", () => {
    const wallet = seed.wallets.find((row) => row.profile_id === DEMO_PROFILE_ID);
    expect(wallet).toBeDefined();
    expect(wallet?.balance_cents).toBe(2480);
    expect(wallet?.spend_today_cents).toBe(384);
    expect(wallet?.approval_threshold_cents).toBe(500);

    const held = seed.orders
      .filter(
        (order) =>
          order.buyer_id === DEMO_PROFILE_ID &&
          ["queued", "running", "delivered"].includes(order.status),
      )
      .reduce((total, order) => total + order.amount_cents, 0);

    expect(wallet?.held_cents).toBe(held);
    expect((wallet?.balance_cents ?? 0) - held).toBe(1243);
    expect(AUSTIN_AVAILABLE_CENTS).toBe(1243);
  });
});

/* -------------------------------------------------------------------------- */

describe("seed — gigs", () => {
  it("gives every gig three ascending tiers with real features", () => {
    for (const gig of seed.gigs) {
      expect(gig.packages, `${gig.slug} needs 3 packages`).toHaveLength(3);
      expect(gig.packages.map((p) => p.tier)).toEqual([...PACKAGE_TIERS]);

      const prices = gig.packages.map((p) => p.price_cents);
      expect(prices[0]).toBeLessThan(prices[1]);
      expect(prices[1]).toBeLessThan(prices[2]);

      for (const pkg of gig.packages) {
        expect(pkg.features.length).toBeGreaterThanOrEqual(3);
        expect(pkg.delivery_seconds).toBeGreaterThan(0);
      }

      expect(gig.starting_price_cents).toBe(prices[0]);
      expect(gig.delivery_seconds).toBe(gig.packages[0].delivery_seconds);
    }
  });

  it("gives every gig a real input and output contract", () => {
    for (const gig of seed.gigs) {
      expect(gig.input_contract.summary.length).toBeGreaterThan(8);
      expect(gig.input_contract.fields.length).toBeGreaterThanOrEqual(2);
      expect(gig.output_contract.fields.length).toBeGreaterThanOrEqual(3);
      for (const field of [...gig.input_contract.fields, ...gig.output_contract.fields]) {
        expect(field.name).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(field.description.length).toBeGreaterThan(4);
      }
    }
  });

  it('titles gigs in the marketplace voice ("I will …")', () => {
    const marketVoice = seed.gigs.filter((gig) => gig.title.startsWith("I will "));
    expect(marketVoice.length).toBe(seed.gigs.length);
  });
});

/* -------------------------------------------------------------------------- */

describe("seed — determinism", () => {
  it("stamps every timestamp as an ISO string relative to SEED_EPOCH", () => {
    expect(SEED_EPOCH).toBe("2026-09-05T18:00:00.000Z");
    for (const rows of Object.values(seed) as Array<Array<Record<string, unknown>>>) {
      for (const row of rows) {
        for (const [key, value] of Object.entries(row)) {
          if (!/_at$/.test(key) || value === null) continue;
          expect(typeof value, `${key} should be a string`).toBe("string");
          expect(value as string, `${key} = ${String(value)}`).toMatch(ISO_RE);
        }
      }
    }
  });

  it("derives ids from a stable UUIDv5 namespace", () => {
    // Fixed vector: if this changes, every seeded id changed with it.
    expect(uuidv5("agentdistrict:agent:scout")).toBe(
      seed.agents.find((agent) => agent.handle === "scout")?.id,
    );
    expect(uuidv5("agentdistrict:agent:scout")).toBe(uuidv5("agentdistrict:agent:scout"));
    expect(uuidv5("agentdistrict:agent:scout")).not.toBe(
      uuidv5("agentdistrict:gig:scout"),
    );
  });

  it("keeps in-flight order progress consistent with started_at + eta_seconds", () => {
    const epoch = Date.parse(SEED_EPOCH);
    for (const order of seed.orders) {
      if (order.status !== "running" || !order.started_at) continue;
      const elapsed = (epoch - Date.parse(order.started_at)) / 1000;
      const expected = Math.round((elapsed / order.eta_seconds) * 100);
      expect(Math.abs(expected - order.progress)).toBeLessThanOrEqual(1);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("seed — matches the migration", () => {
  /** Seed key → SQL table name. Mirrors `TABLES` in `scripts/seed-sql.ts`. */
  const TABLE_NAMES: Record<keyof DistrictDataset, string> = {
    profiles: "profiles",
    stores: "stores",
    agents: "agents",
    rooms: "rooms",
    presence: "presence",
    guilds: "guilds",
    guildMembers: "guild_members",
    gigs: "gigs",
    jobs: "jobs",
    bids: "bids",
    marketItems: "market_items",
    channels: "channels",
    channelHosts: "channel_hosts",
    channelChat: "channel_chat",
    competitions: "competitions",
    competitionEntries: "competition_entries",
    loungeMessages: "lounge_messages",
    threads: "threads",
    messages: "messages",
    wallets: "wallets",
    orders: "orders",
    walletTransactions: "wallet_transactions",
    reviews: "reviews",
    events: "events",
    apiKeys: "api_keys",
  };

  const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
  const migration = readFileSync(join(MIGRATIONS_DIR, "0001_init.sql"), "utf8");

  /**
   * Every `alter table … add column` across the whole migration set.
   *
   * A column added after 0001 is just as real as one declared in it —
   * `wallets.autonomous_paused` (0007), `wallets.spend_today_date` (0008) and
   * `api_keys.agent_id` (0009) all arrived that way — so the column list a seed
   * row is checked against has to include them, or the rule stops being "the
   * seed matches the schema" and becomes "the seed matches the first file".
   */
  const addedColumns = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql") && name !== "0001_init.sql")
    .sort()
    .flatMap((name) => [
      ...readFileSync(join(MIGRATIONS_DIR, name), "utf8").matchAll(
        /alter table\s+public\.([a-z_]+)\s+add column(?:\s+if not exists)?\s+([a-z_][a-z0-9_]*)/gi,
      ),
    ])
    .reduce<Map<string, string[]>>((all, match) => {
      const [, table, column] = match;
      all.set(table, [...(all.get(table) ?? []), column]);
      return all;
    }, new Map());

  /** Very small `create table` parser — enough to list a table's columns. */
  function columnsOf(table: string): string[] {
    const match = migration.match(
      new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`),
    );
    if (!match) throw new Error(`0001_init.sql has no table public.${table}`);

    const skip = /^(constraint|primary|unique|check|foreign|--)/i;
    const declared = match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !skip.test(line))
      .map((line) => line.split(/\s+/)[0])
      .filter((name) => /^[a-z_][a-z0-9_]*$/.test(name));

    return [...declared, ...(addedColumns.get(table) ?? [])];
  }

  it.each(Object.entries(TABLE_NAMES))(
    "seed.%s emits only columns that exist on public.%s",
    (key, table) => {
      const rows = seed[key as keyof DistrictDataset] as Array<Record<string, unknown>>;
      expect(rows.length, `seed.${key} is empty`).toBeGreaterThan(0);

      const columns = new Set(columnsOf(table));
      for (const column of Object.keys(rows[0])) {
        expect(columns, `public.${table} has no column "${column}"`).toContain(column);
      }
    },
  );

  it("gives every row in a table the same keys in the same order", () => {
    for (const [key, rows] of Object.entries(seed) as Array<
      [string, Array<Record<string, unknown>>]
    >) {
      const shape = Object.keys(rows[0]).join(",");
      for (const row of rows) {
        expect(Object.keys(row).join(","), `seed.${key} has ragged rows`).toBe(shape);
      }
    }
  });

  it("enables RLS on every seeded table", () => {
    const rls = readFileSync(
      join(process.cwd(), "supabase", "migrations", "0002_rls.sql"),
      "utf8",
    );
    for (const table of Object.values(TABLE_NAMES)) {
      expect(
        rls.includes(`alter table public.${table}`),
        `0002_rls.sql does not enable RLS on public.${table}`,
      ).toBe(true);
    }
  });
});
