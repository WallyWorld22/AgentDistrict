// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Batch 4 of the site audit: limits and abuse guards.
 *
 * - jobs-03: a bid is capped at the bounty's budget and its delivery time at
 *   the deadline — in the data layer, so the form, REST and MCP all hit it.
 * - jobs-04: a bounty's budget has a ceiling ($100,000).
 * - machine-surface-07: one live bid per agent per bounty, and a per-address
 *   budget on `POST /api/v1/jobs/{id}/bids`.
 * - gigs-orders-03: no ordering your own gig; "Runs" counts approved runs, not
 *   orders; free orders are rate limited.
 * - economy-02: a guild hire checks the whole team's total before any order.
 * - economy-01: top-ups are capped ($100 each, $500 a day) with a fixed memo.
 * - sec-03: `register_agent()` runs through the service role only.
 *
 * The Postgres half (0014) is `tests/integration/abuse-limits.test.ts`.
 */
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { href });
  },
}));

import { POST as placeBidRoute } from "@/app/api/v1/jobs/[id]/bids/route";
import { RATE_BUDGETS, resetRateLimitsForTests } from "@/app/api/_lib/rate-limit";
import { hireGuildAction } from "@/app/(app)/guilds/actions";
import { placeBidAction, postJobAction } from "@/app/(app)/jobs/actions";
import { topUpAction } from "@/app/actions";
import { getRepo, resetRepoForTests } from "@/lib/data";
import { createDemoRepository, type DemoRepository } from "@/lib/data/demo";
import {
  ConflictError,
  ForbiddenError,
  RateLimitError,
  UpstreamError,
  ValidationError,
} from "@/lib/data/errors";
import {
  FREE_ORDERS_PER_HOUR,
  MAX_JOB_BUDGET_CENTS,
  TOPUP_DAILY_MAX_CENTS,
  TOPUP_MAX_CENTS,
  TOPUP_MEMO,
} from "@/lib/data/limits";
import { SupabaseRepository } from "@/lib/data/supabase";
import { CreateJobSchema } from "@/lib/openapi";
import { DEMO_PROFILE_ID, DEMO_WRITE_API_KEY, SEED_EPOCH_MS, profileId } from "@/lib/seed";

const ORIGIN = "https://district.test";
/** A gig whose agent the demo human does not own, with a $0 basic package. */
const FREE_GIG = "normalize-and-dedupe-csv";
/** A paid gig the demo human does not own. */
const PAID_GIG = "double-sourced-contact-verification";
/** The demo human's own agent's gig. */
const OWN_GIG = "find-100-qualified-local-businesses";

let now = SEED_EPOCH_MS;
let repo: DemoRepository;

beforeEach(() => {
  now = SEED_EPOCH_MS;
  repo = createDemoRepository({ now: () => now });
  resetRepoForTests();
  resetRateLimitsForTests();
});

afterEach(() => {
  resetRepoForTests();
  resetRateLimitsForTests();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** An open bounty the demo human did not post, and one of the demo human's agents. */
async function thirdPartyJob(target: { getJob: DemoRepository["getJob"]; listJobs: DemoRepository["listJobs"] }) {
  const jobs = await target.listJobs({ status: "open", limit: 50 });
  const job = jobs.find((row) => row.poster_id !== DEMO_PROFILE_ID);
  if (!job) throw new Error("the seed has no third-party open bounty");
  return (await target.getJob(job.id))!;
}

/* ------------------------------------------------------------- jobs-03 */

describe("a bid answers the bounty as posted (jobs-03)", () => {
  it("refuses a price over the budget and a delivery past the deadline", async () => {
    const job = await thirdPartyJob(repo);
    const base = { jobId: job.id, agentHandle: "scout", note: "Probe." };

    const over = repo.placeBid({ ...base, amountCents: job.budget_cents + 1, etaSeconds: 600 });
    await expect(over).rejects.toBeInstanceOf(ValidationError);
    await expect(over).rejects.toThrow(/at most the bounty's \$[\d.,]+ budget/);

    const late = repo.placeBid({
      ...base,
      amountCents: 100,
      etaSeconds: job.deadline_seconds + 1,
    });
    await expect(late).rejects.toBeInstanceOf(ValidationError);
    await expect(late).rejects.toThrow(/fit the bounty's .* deadline/);

    // Exactly the budget, exactly the deadline: allowed.
    const bid = await repo.placeBid({
      ...base,
      amountCents: job.budget_cents,
      etaSeconds: job.deadline_seconds,
    });
    expect(bid.amount_cents).toBe(job.budget_cents);
  });

  it("says so plainly on the bid form", async () => {
    const job = await thirdPartyJob(getRepo());
    const result = await placeBidAction(
      null,
      form({
        jobId: job.id,
        agentHandle: "scout",
        amount: "9999.00",
        etaSeconds: "600",
        note: "A $9,999 bid on a small bounty.",
      }),
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { message: string }).message).toMatch(
      /^A bid can be at most the bounty's \$[\d.,]+ budget — \$9,999\.00 is over it\.$/,
    );
    expect((await getRepo().getJob(job.id))!.bids.some((b) => b.amount_cents === 999_900)).toBe(
      false,
    );
  });

  it("is enforced for REST too (400, not 201)", async () => {
    const job = await thirdPartyJob(getRepo());
    const response = await placeBidRoute(
      new Request(`${ORIGIN}/api/v1/jobs/${job.id}/bids`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${DEMO_WRITE_API_KEY}`,
        },
        body: JSON.stringify({
          agent_handle: "scout",
          amount_cents: 999_900,
          eta_seconds: 600,
          note: "Over budget.",
        }),
      }),
      { params: Promise.resolve({ id: job.id }) },
    );
    expect(response.status).toBe(400);
  });

  it("keeps the auto-bids a new bounty wakes inside both caps", async () => {
    const job = await repo.createJob(
      {
        title: "Find 200 roofing companies in Tampa",
        description: "Owner contact where public, deduped, one CSV.",
        category: "research",
        budget_cents: 500,
        deadline_seconds: 600,
        required_output: { format: "csv" },
        data_policy: { pii: "none", retention_days: 0, allow_subcontracting: false },
      },
      profileId("devdan"),
    );
    const { inviteBidsFor } = await import("@/lib/data/ext/invite-bids");
    await inviteBidsFor(repo, job.id, profileId("devdan"));
    const bids = (await repo.getJob(job.id))!.bids;
    expect(bids.length).toBeGreaterThan(0);
    for (const bid of bids) {
      expect(bid.amount_cents).toBeLessThanOrEqual(500);
      expect(bid.eta_seconds).toBeLessThanOrEqual(600);
    }
  });
});

/* ------------------------------------------------------------- jobs-04 */

describe("a bounty's budget has a ceiling (jobs-04)", () => {
  const input = {
    title: "A bounty with a silly budget",
    description: "Checking that the budget ceiling holds at the data layer.",
    category: "research" as const,
    deadline_seconds: 3600,
    required_output: { format: "csv" as const },
    data_policy: { pii: "none" as const, retention_days: 0, allow_subcontracting: false },
  };

  it("is $100,000, in the data layer and the REST schema alike", async () => {
    expect(MAX_JOB_BUDGET_CENTS).toBe(10_000_000);
    await expect(
      repo.createJob({ ...input, budget_cents: 100_000_000_000 }, DEMO_PROFILE_ID),
    ).rejects.toThrow("Budgets top out at $100,000.00 per bounty.");
    await expect(
      repo.createJob({ ...input, budget_cents: MAX_JOB_BUDGET_CENTS + 1 }, DEMO_PROFILE_ID),
    ).rejects.toBeInstanceOf(ValidationError);
    const job = await repo.createJob({ ...input, budget_cents: MAX_JOB_BUDGET_CENTS }, DEMO_PROFILE_ID);
    expect(job.budget_cents).toBe(MAX_JOB_BUDGET_CENTS);

    expect(
      CreateJobSchema.safeParse({ ...input, budget_cents: MAX_JOB_BUDGET_CENTS + 1 }).success,
    ).toBe(false);
  });

  it("says so plainly on the post-a-job form", async () => {
    const result = await postJobAction(
      null,
      form({
        title: "A billion-dollar bounty",
        description: "This budget is far beyond anything a wallet can hold here.",
        category: "research",
        budget: "1000000000",
        deadlineSeconds: "3600",
        outputFormat: "csv",
      }),
    );
    expect(result).toEqual({ ok: false, message: "Budgets top out at $100,000.00." });
  });
});

/* -------------------------------------------------- machine-surface-07 */

describe("one live bid per agent per bounty, and a bid budget (machine-surface-07)", () => {
  it("refuses a second pending bid from the same agent in the data layer", async () => {
    const job = await thirdPartyJob(repo);
    const bid = { jobId: job.id, agentHandle: "scout", amountCents: 100, etaSeconds: 600, note: "One." };
    await repo.placeBid(bid);
    const again = repo.placeBid({ ...bid, note: "Two." });
    await expect(again).rejects.toBeInstanceOf(ConflictError);
    await expect(again).rejects.toThrow("Scout already has a live bid on this bounty.");

    const mine = (await repo.getJob(job.id))!.bids.filter((row) => row.agent.handle === "scout");
    expect(mine).toHaveLength(1);
  });

  it("throttles bid placement per address over REST", async () => {
    const job = await thirdPartyJob(getRepo());
    const send = () =>
      placeBidRoute(
        new Request(`${ORIGIN}/api/v1/jobs/${job.id}/bids`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
          body: JSON.stringify({ agent_handle: "scout", amount_cents: 100, eta_seconds: 600 }),
        }),
        { params: Promise.resolve({ id: job.id }) },
      );

    for (let index = 0; index < RATE_BUDGETS.bidPlace.limit; index += 1) {
      expect((await send()).status).not.toBe(429);
    }
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
  });
});

/* --------------------------------------------------------- gigs-orders-03 */

describe("gig orders (gigs-orders-03)", () => {
  it("refuses an order of your own gig", async () => {
    const before = (await repo.listOrders({ buyerId: DEMO_PROFILE_ID, limit: 200 })).length;
    await expect(
      repo.orderGig({
        gigSlug: OWN_GIG,
        tier: "basic",
        brief: "Buying from myself.",
        buyerId: DEMO_PROFILE_ID,
        approved: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await repo.listOrders({ buyerId: DEMO_PROFILE_ID, limit: 200 })).length).toBe(before);
  });

  it("counts a run on approval, once, and never on the order", async () => {
    const runs = async () => (await repo.getGigBySlug(PAID_GIG))!.runs_count;
    const start = await runs();

    const order = await repo.orderGig({
      gigSlug: PAID_GIG,
      tier: "basic",
      brief: "Verify 50 contacts.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });
    expect(await runs()).toBe(start);

    now += order.eta_seconds * 1000 + 1000;
    await repo.refreshOrder(order.id);
    await repo.approveOrder(order.id, DEMO_PROFILE_ID);
    expect(await runs()).toBe(start + 1);

    await repo.approveOrder(order.id, DEMO_PROFILE_ID);
    expect(await runs()).toBe(start + 1);
  });

  it("limits free orders per buyer per hour", async () => {
    const order = () =>
      repo.orderGig({
        gigSlug: FREE_GIG,
        tier: "basic",
        brief: "Clean this CSV.",
        buyerId: DEMO_PROFILE_ID,
        approved: true,
      });
    for (let index = 0; index < FREE_ORDERS_PER_HOUR; index += 1) {
      expect((await order()).amount_cents).toBe(0);
      now += 1000;
    }
    const refused = order();
    await expect(refused).rejects.toBeInstanceOf(RateLimitError);
    await expect(refused).rejects.toThrow(/Free gigs are limited to 10 orders an hour/);

    // A paid order is not affected…
    await expect(
      repo.orderGig({
        gigSlug: PAID_GIG,
        tier: "basic",
        brief: "Paid, so not limited.",
        buyerId: DEMO_PROFILE_ID,
        approved: true,
      }),
    ).resolves.toBeTruthy();

    // …and the window rolls.
    now += 60 * 60 * 1000;
    expect((await order()).amount_cents).toBe(0);
  });
});

/* ------------------------------------------------------------ economy-02 */

describe("hiring a guild checks the whole total first (economy-02)", () => {
  it("places no order at all when the team costs more than is available", async () => {
    // Launch Guild's basic total is $12.86; the demo human has $12.43
    // available. The loop used to place three runs and stop on the fourth.
    const demo = getRepo();
    const before = (await demo.listOrders({ buyerId: DEMO_PROFILE_ID, limit: 200 })).length;

    const result = await hireGuildAction(
      null,
      form({ slug: "launch-guild", tier: "basic", brief: "A launch for a Stuart roofer." }),
    );

    expect(result).toEqual({
      ok: false,
      message:
        "Hiring Launch Guild costs $12.86, and you have $12.43 available. " +
        "Add credits on the Wallet or pick a smaller package — nothing was ordered.",
    });
    expect((await demo.listOrders({ buyerId: DEMO_PROFILE_ID, limit: 200 })).length).toBe(before);
  });

  it("skips the buyer's own members instead of failing on them part-way", async () => {
    // Content Factory's Packaging step is Otto, which the demo human owns.
    const demo = getRepo();
    const before = await demo.listOrders({ buyerId: DEMO_PROFILE_ID, limit: 200 });

    const result = await hireGuildAction(
      null,
      form({ slug: "content-factory", tier: "basic", brief: "A month of roofing content." }),
    );
    expect(result).toMatchObject({ ok: true, message: "Content Factory hired — 3 runs started." });

    const placed = (await demo.listOrders({ buyerId: DEMO_PROFILE_ID, limit: 200 })).filter(
      (row) => !before.some((old) => old.id === row.id),
    );
    expect(placed.map((row) => row.agent.handle).sort()).toEqual(
      ["copycat", "pixelpress", "voicevine"].sort(),
    );
  });
});

/* ------------------------------------------------------------ economy-01 */

describe("top-ups are capped demo credits (economy-01)", () => {
  it("caps a single top-up at $100 and a UTC day at $500, with a fixed memo", async () => {
    expect([TOPUP_MAX_CENTS, TOPUP_DAILY_MAX_CENTS]).toEqual([10_000, 50_000]);

    await expect(repo.topUp(DEMO_PROFILE_ID, 100_000_000_000)).rejects.toThrow(
      "Each top-up is capped at $100.00 of demo credits.",
    );
    await expect(repo.topUp(DEMO_PROFILE_ID, TOPUP_MAX_CENTS + 1)).rejects.toBeInstanceOf(
      ValidationError,
    );

    const start = (await repo.getWallet(DEMO_PROFILE_ID))!.balance_cents;
    for (let index = 0; index < 4; index += 1) await repo.topUp(DEMO_PROFILE_ID, TOPUP_MAX_CENTS);
    await repo.topUp(DEMO_PROFILE_ID, 9_000);
    await expect(repo.topUp(DEMO_PROFILE_ID, 1_500)).rejects.toThrow(
      "Demo top-ups are capped at $500.00 a day. You can add up to $10.00 more today.",
    );
    await repo.topUp(DEMO_PROFILE_ID, 1_000);
    await expect(repo.topUp(DEMO_PROFILE_ID, 1)).rejects.toThrow(
      "Demo top-ups are capped at $500.00 a day. You have reached today's cap — try again tomorrow (UTC).",
    );
    expect((await repo.getWallet(DEMO_PROFILE_ID))!.balance_cents).toBe(start + TOPUP_DAILY_MAX_CENTS);

    const memos = (await repo.listTransactions(DEMO_PROFILE_ID, 10))
      .filter((tx) => tx.kind === "topup")
      .map((tx) => tx.memo);
    expect(new Set(memos)).toEqual(new Set([TOPUP_MEMO]));
    expect(TOPUP_MEMO).toMatch(/not real money/);

    // A new UTC day starts a new allowance.
    now += 24 * 60 * 60 * 1000;
    await expect(repo.topUp(DEMO_PROFILE_ID, TOPUP_MAX_CENTS)).resolves.toBeTruthy();
  });

  it("says so plainly on the Add credits form", async () => {
    expect(await topUpAction(null, form({ amount: "1000000000" }))).toEqual({
      ok: false,
      message: "Each top-up is capped at $100.00 of demo credits.",
    });
  });
});

/* --------------------------------------------------------------- sec-03 */

describe("register_agent() is server-only (sec-03)", () => {
  const input = {
    handle: "tide-reader",
    name: "TideReader",
    tagline: "Coastal permit research.",
    category: "research" as const,
    skills: ["permit data"],
  };

  it("never calls it through the caller's (anon-key) client", async () => {
    const rpc = vi.fn();
    const anon = { rpc } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const supabase = new SupabaseRepository(async () => anon);
    await expect(supabase.registerAgent(input)).rejects.toBeInstanceOf(UpstreamError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls it through the service-role client when one is configured", async () => {
    const anonRpc = vi.fn();
    const serviceRpc = vi.fn(async () => ({ data: null, error: { message: "stop here" } }));
    const supabase = new SupabaseRepository(
      async () => ({ rpc: anonRpc }) as unknown as import("@supabase/supabase-js").SupabaseClient,
      {
        serviceClient: async () =>
          ({ rpc: serviceRpc }) as unknown as import("@supabase/supabase-js").SupabaseClient,
      },
    );
    await expect(supabase.registerAgent(input)).rejects.toThrow("stop here");
    expect(anonRpc).not.toHaveBeenCalled();
    expect(serviceRpc).toHaveBeenCalledWith(
      "register_agent",
      expect.objectContaining({ p_handle: "tide-reader" }),
    );
  });
});

/* ------------------------------------------------------- migration 0014 */

describe("0014 matches the app's limits", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "0014_abuse_limits.sql"),
    "utf8",
  );

  it("caps top-ups at the same numbers and writes the same memo", () => {
    expect(sql).toMatch(new RegExp(`c_per_topup constant integer := ${TOPUP_MAX_CENTS};`));
    expect(sql).toMatch(new RegExp(`c_per_day   constant integer := ${TOPUP_DAILY_MAX_CENTS};`));
    expect(sql).toContain(`'${TOPUP_MEMO}'`);
  });

  it("revokes register_agent() from anon and authenticated", () => {
    expect(sql).toMatch(/revoke execute on function public\.register_agent\([^;]*\) from public, anon, authenticated;/);
  });
});
