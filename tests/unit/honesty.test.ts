// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The Server Actions under test call `revalidatePath`; nothing renders here. */
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { readFileSync } from "node:fs";
import path from "node:path";
import { setAgentStatusAction } from "@/app/(app)/agents/actions";
import { placeBidAction } from "@/app/(app)/jobs/actions";
import { GET as getBids } from "@/app/api/v1/jobs/[id]/bids/route";
import { joinRoomAction } from "@/app/(app)/lounge/actions";
import { createDemoRepository, getRepo, resetRepoForTests } from "@/lib/data";
import { isAutoBid, isFoundingCast } from "@/lib/data/ext/cast";
import { hireAgainHref, hireAgainPrefill, serializeDeliverable } from "@/lib/data/ext/gigs";
import { countOnline } from "@/lib/data/ext/home";
import { inviteBidsFor } from "@/lib/data/ext/invite-bids";
import { AUTO_BID_FLOOR_SHARE, compatibleAgents, planAutoBids } from "@/lib/data/ext/jobs";
import { SELF_SET_STATUSES } from "@/lib/data/types";
import { auditLinkLabel } from "@/components/workplace/audit-table";
import { AFTER, BEFORE, PREFERENCE_NOTE } from "@/components/workplace/policy-board";
import { DEMO_PROFILE_ID, SEED_EPOCH_MS, agentId, profileId, seed } from "@/lib/seed";
import { AGENT_HANDLES } from "@/lib/seed/agents";

/**
 * The honesty pass (site audit section 4): what looked real but was not now
 * says what it is, and the one behaviour change in it — messaging an agent
 * again continues the conversation — holds in the demo adapter (the Supabase
 * adapter's is in tests/integration/honesty.test.ts).
 */

beforeEach(() => resetRepoForTests());
afterEach(() => resetRepoForTests());

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("messaging the same agent again (owner decision 14)", () => {
  it("continues the existing thread instead of opening a duplicate", async () => {
    const repo = createDemoRepository();
    const first = await repo.createThread({
      profileId: DEMO_PROFILE_ID,
      agentHandle: "mapfox",
      subject: "Territory question",
      body: "Can you map the Treasure Coast?",
    });
    const before = (await repo.listThreads(DEMO_PROFILE_ID)).length;

    const second = await repo.createThread({
      profileId: DEMO_PROFILE_ID,
      agentHandle: "mapfox",
      subject: "Part two",
      body: "And Palm Beach, please.",
    });

    expect(second.id).toBe(first.id);
    expect((await repo.listThreads(DEMO_PROFILE_ID)).length).toBe(before);
    expect(second.messages.map((message) => message.body)).toEqual(
      expect.arrayContaining(["Can you map the Treasure Coast?", "And Palm Beach, please."]),
    );
    expect(second.messages.at(-1)!.body).toBe("And Palm Beach, please.");
  });

  it("still opens a new thread with an agent you have not written to", async () => {
    const repo = createDemoRepository();
    const before = (await repo.listThreads(DEMO_PROFILE_ID)).length;
    const threads = await repo.listThreads(DEMO_PROFILE_ID);
    const talkedTo = new Set(threads.map((thread) => thread.agent_id));
    const stranger = (await repo.listAgents({ limit: 200 })).find(
      (agent) => !talkedTo.has(agent.id) && isFoundingCast(agent.handle),
    )!;
    const thread = await repo.createThread({
      profileId: DEMO_PROFILE_ID,
      agentHandle: stranger.handle,
      subject: "Hello",
      body: "A first message.",
    });
    expect(thread.messages).toHaveLength(1);
    expect((await repo.listThreads(DEMO_PROFILE_ID)).length).toBe(before + 1);
  });
});

describe("auto-bids (owner decision 7)", () => {
  it("bid only for founding-cast agents, while the count is every agent matched", async () => {
    const repo = getRepo();
    // An agent a person registered, online and squarely in the bounty's lane.
    const outsider = await repo.createAgent(
      {
        handle: "outside-researcher",
        name: "Outside Researcher",
        tagline: "Registered by a person, not shipped with the District.",
        category: "research",
        skills: ["research", "lead research", "roofing"],
        pricing_model: "per_job",
        starting_price_cents: 300,
      },
      profileId("devdan"),
    );
    expect(isFoundingCast(outsider.handle)).toBe(false);

    const job = await repo.createJob(
      {
        title: "Find 200 roofing companies in Tampa",
        description: "Lead research: owner contact where public, deduped, one CSV.",
        category: "research",
        budget_cents: 2000,
        deadline_seconds: 3600,
        required_output: { format: "csv" },
        data_policy: { pii: "none", retention_days: 0, allow_subcontracting: false },
      },
      DEMO_PROFILE_ID,
    );
    const matched = await inviteBidsFor(repo, job.id, DEMO_PROFILE_ID);

    const pool = compatibleAgents(await repo.listAgents({ limit: 200 }), job).filter(
      (agent) => agent.owner_id !== DEMO_PROFILE_ID,
    );
    expect(pool.map((agent) => agent.handle)).toContain(outsider.handle);
    expect(matched).toBe(pool.length);

    const bids = (await repo.getJob(job.id))!.bids;
    expect(bids.length).toBeGreaterThan(0);
    expect(bids.some((bid) => bid.agent_id === outsider.id)).toBe(false);
    for (const bid of bids) {
      expect(isAutoBid(bid)).toBe(true);
      expect(bid.amount_cents).toBeGreaterThanOrEqual(Math.round(2000 * AUTO_BID_FLOOR_SHARE));
    }
  });
});

describe("an auto-bid is recorded, not guessed from the agent (decision 7)", () => {
  it("does not label a bid an owner types by hand as a founding-cast agent", async () => {
    // The demo identity owns @scout, a founding-cast agent, and bids as it
    // through the form on somebody else's open bounty.
    const repo = getRepo();
    expect(isFoundingCast("scout")).toBe(true);
    const scout = agentId("scout");
    const job = (await repo.listJobs({ status: "open", limit: 50 })).find(
      (row) => row.poster_id !== DEMO_PROFILE_ID,
    )!;
    const full = (await repo.getJob(job.id))!;
    expect(full.bids.some((bid) => bid.agent_id === scout && bid.status === "pending")).toBe(false);

    const result = await placeBidAction(
      null,
      form({
        jobId: job.id,
        agentHandle: "scout",
        amount: (job.budget_cents / 200).toFixed(2),
        etaSeconds: "60",
        note: "I typed this offer myself",
      }),
    );
    expect(result).toMatchObject({ ok: true });

    const mine = (await repo.getJob(job.id))!.bids.find((bid) => bid.agent_id === scout)!;
    expect(mine.note).toBe("I typed this offer myself");
    expect(mine.auto_bid).toBe(false);
    expect(isAutoBid(mine)).toBe(false);

    // The machine surface says the same.
    const response = await getBids(new Request(`http://localhost/api/v1/jobs/${job.id}/bids`), {
      params: Promise.resolve({ id: job.id }),
    });
    const body = (await response.json()) as { bids: Array<{ id: string; auto_bid: boolean }> };
    expect(body.bids.find((bid) => bid.id === mine.id)!.auto_bid).toBe(false);
  });

  it("is only for the founding cast, even when asked for", async () => {
    const repo = getRepo();
    const outsider = await repo.createAgent(
      {
        handle: "not-the-districts",
        name: "Not The District's",
        tagline: "Registered by a person.",
        category: "research",
        skills: ["research"],
        pricing_model: "per_job",
        starting_price_cents: 300,
      },
      profileId("devdan"),
    );
    const job = (await repo.listJobs({ status: "open", limit: 50 })).find(
      (row) => row.poster_id !== profileId("devdan"),
    )!;
    await expect(
      repo.placeBid({
        jobId: job.id,
        agentHandle: outsider.handle,
        amountCents: 100,
        etaSeconds: 60,
        note: "Pretending to be the District",
        autoBid: true,
      }),
    ).rejects.toThrow(/founding cast/);
  });

  it("0016 backfills exactly the seeded bids, the founding cast and the notes planAutoBids writes", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "0016_auto_bid_flag.sql"),
      "utf8",
    );
    const [seededPart, castPart] = sql.split("Backfill (b)");
    const ids = [...seededPart.matchAll(/'([0-9a-f-]{36})'/g)].map((match) => match[1]);
    expect(ids.sort()).toEqual(
      seed.bids.filter((bid) => bid.auto_bid).map((bid) => bid.id).sort(),
    );
    const handles = [...castPart.split("network_stats")[0].matchAll(/'([a-z0-9-]+)'/g)].map(
      (match) => match[1],
    );
    expect(handles.sort()).toEqual([...AGENT_HANDLES].sort());

    // The three note patterns match what `planAutoBids` writes, and not a
    // note a person typed.
    const patterns = [...castPart.matchAll(/b\.note ~ '([^']+)'/g)].map(
      (match) => new RegExp(match[1]),
    );
    expect(patterns).toHaveLength(3);
    const job = {
      title: "Find 200 roofing companies in Tampa",
      description: "Lead research",
      category: "research" as const,
      budget_cents: 2000,
      deadline_seconds: 3600,
    };
    const cast = seed.agents.filter((agent) => agent.category === "research").slice(0, 3);
    for (const plan of planAutoBids(job, cast)) {
      expect(patterns.some((pattern) => pattern.test(plan.note)), plan.note).toBe(true);
    }
    expect(patterns.some((pattern) => pattern.test("I typed this offer myself"))).toBe(false);
  });
});

describe("Agents Online (social-media-07, everywhere)", () => {
  it("counts what the Lounge counts, in the hero, /api/v1/stats and llms.txt alike", async () => {
    const now = SEED_EPOCH_MS;
    const repo = createDemoRepository({ now: () => now });
    const stats = await repo.getNetworkStats();
    expect(stats.agentsOnline).toBe(countOnline(await repo.listPresence(), now));
    expect(stats.agentsOnline).toBeGreaterThan(0);
  });

  it("drops to zero when nobody has been seen for weeks", async () => {
    const weeksLater = SEED_EPOCH_MS + 21 * 86_400_000;
    const repo = createDemoRepository({ now: () => weeksLater });
    // Every agent still has a non-offline status on its row …
    expect(seed.agents.filter((agent) => agent.status !== "offline").length).toBeGreaterThan(0);
    // … but none of them was seen in the last half hour.
    expect((await repo.getNetworkStats()).agentsOnline).toBe(0);
    expect(countOnline(await repo.listPresence(), weeksLater)).toBe(0);
  });
});

describe("Hire again keeps the brief out of the URL", () => {
  const order = {
    buyer_id: DEMO_PROFILE_ID,
    gig_id: "gig-1",
    package_tier: "standard" as const,
    brief: "Deliver to 12 Ocean Drive, Stuart FL — call Maria on 555-0100.",
  };

  it("links by order id only", () => {
    const href = hireAgainHref("roof-age-report", "11111111-2222-4333-8444-555555555555");
    expect(href).toBe("/gigs/roof-age-report?again=11111111-2222-4333-8444-555555555555");
    expect(href).not.toMatch(/brief|Ocean/);
  });

  it("hands the brief back to that run's buyer, on that run's gig, and nobody else", () => {
    expect(hireAgainPrefill(order, DEMO_PROFILE_ID, "gig-1")).toEqual({
      tier: "standard",
      brief: order.brief,
    });
    expect(hireAgainPrefill(order, profileId("devdan"), "gig-1")).toBeNull();
    expect(hireAgainPrefill(order, null, "gig-1")).toBeNull();
    expect(hireAgainPrefill(order, DEMO_PROFILE_ID, "another-gig")).toBeNull();
    expect(hireAgainPrefill(null, DEMO_PROFILE_ID, "gig-1")).toBeNull();
  });
});

describe("self-set statuses (social-media-09)", () => {
  it("are available, collaborating, hiring and offline only", () => {
    expect([...SELF_SET_STATUSES]).toEqual(["available", "collaborating", "hiring", "offline"]);
  });

  it("refuses Live and Working from the Passport and the Lounge", async () => {
    for (const status of ["live", "working"]) {
      const passport = await setAgentStatusAction(null, form({ handle: "scout", status }));
      expect(passport?.ok).toBe(false);
      const seat = await joinRoomAction(
        null,
        form({ agentHandle: "scout", roomSlug: "research-pit", status }),
      );
      expect(seat?.ok).toBe(false);
    }
    const scout = await getRepo().getAgentByHandle("scout");
    expect(["live", "working"]).not.toContain(scout!.status);

    // A self-set status still goes through.
    const ok = await setAgentStatusAction(null, form({ handle: "scout", status: "hiring" }));
    expect(ok?.ok).toBe(true);
    expect((await getRepo().getAgentByHandle("scout"))!.status).toBe("hiring");
  });
});

describe("a new Passport (agents-identity-04)", () => {
  it("starts with no reliability and no latency, as Postgres does", async () => {
    const repo = createDemoRepository();
    const agent = await repo.createAgent(
      {
        handle: "brand-new-agent",
        name: "Brand New",
        tagline: "Registered a moment ago.",
        category: "research",
        skills: ["research"],
        pricing_model: "per_job",
        starting_price_cents: 100,
      },
      DEMO_PROFILE_ID,
    );
    expect(agent.jobs_completed).toBe(0);
    expect(agent.reliability).toBe(0);
    expect(agent.avg_latency_sec).toBe(0);
  });
});

describe("Workplace preferences (economy-03, owner decision 5)", () => {
  it("are worded as preferences and each says it is not enforced", () => {
    expect(PREFERENCE_NOTE).toMatch(/Not enforced yet/);
    for (const policy of [...BEFORE, ...AFTER]) {
      expect(policy.hint).not.toMatch(/cannot|blocked|Disabled by policy/i);
    }
  });
});

describe("Workplace audit links (economy-08)", () => {
  it("say where they go", () => {
    expect(auditLinkLabel(`/orders/${agentId("scout")}`)).toBe("View run →");
    expect(auditLinkLabel("/agents/builderbot")).toBe("View Passport →");
    expect(auditLinkLabel("/tv/the-otto-and-wally-show")).toBe("Open channel →");
    expect(auditLinkLabel("/command")).toBe("Open →");
  });
});

describe("a simulated run's download (gigs-orders-06, gigs-orders-07)", () => {
  it("does not hand out .example links as working links", () => {
    const out = serializeDeliverable({
      format: "links",
      summary: "Delivered.",
      links: [{ label: "master", href: "https://cdn.agentdistrict.example/vo/1" }],
    });
    expect(out.text).toBe("- master (simulated asset, not a working link)");
  });

  it("retracts the old claim that files are attached", () => {
    const out = serializeDeliverable({
      format: "markdown",
      summary: "Built.",
      markdown: "# Done\n\nEvery file above is attached to this run.",
    });
    expect(out.text).not.toContain("attached to this run");
    expect(out.text).toContain("Listed, not attached");
  });
});
