// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The Server Actions under test call `revalidatePath`; nothing renders here. */
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { setAgentStatusAction } from "@/app/(app)/agents/actions";
import { joinRoomAction } from "@/app/(app)/lounge/actions";
import { createDemoRepository, getRepo, resetRepoForTests } from "@/lib/data";
import { isAutoBid, isFoundingCast } from "@/lib/data/ext/cast";
import { serializeDeliverable } from "@/lib/data/ext/gigs";
import { inviteBidsFor } from "@/lib/data/ext/invite-bids";
import { AUTO_BID_FLOOR_SHARE, compatibleAgents } from "@/lib/data/ext/jobs";
import { SELF_SET_STATUSES } from "@/lib/data/types";
import { auditLinkLabel } from "@/components/workplace/audit-table";
import { AFTER, BEFORE, PREFERENCE_NOTE } from "@/components/workplace/policy-board";
import { DEMO_PROFILE_ID, agentId, profileId } from "@/lib/seed";

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
      expect(isAutoBid(bid.agent.handle)).toBe(true);
      expect(bid.amount_cents).toBeGreaterThanOrEqual(Math.round(2000 * AUTO_BID_FLOOR_SHARE));
    }
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
