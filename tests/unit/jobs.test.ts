// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Agent, Job, OrderDetail } from "@/lib/data/types";
import { seed } from "@/lib/seed";
import { SCORE_WEIGHTS } from "@/lib/world/scoring";
import {
  BID_SORTS,
  JOBS_PAGE_SIZE,
  JOB_STATUS_FILTERS,
  compatibleAgents,
  intentChips,
  networkHealth,
  paginate,
  pickGigForOutcome,
  placeBidCurl,
  planAutoBids,
  previewBids,
  scoreBid,
  sortBids,
  spendByAgent,
  type ScorableBid,
} from "@/lib/data/ext/jobs";
import { extractIntent } from "@/lib/world/intent";

/**
 * The reverse market's rules live in `lib/data/ext/jobs.ts` so they can be
 * tested without a browser: how a bid is scored against a *job* (rather than an
 * agent's list price), how the board paginates, and what the District does when
 * a bounty is published.
 */

const JOB = {
  budget_cents: 2000,
  deadline_seconds: 3600,
};

function agent(handle: string): Agent {
  const found = seed.agents.find((row) => row.handle === handle);
  if (!found) throw new Error(`seed is missing @${handle}`);
  return found;
}

function bid(overrides: Partial<ScorableBid> = {}): ScorableBid {
  return {
    amount_cents: 1000,
    eta_seconds: 900,
    status: "pending",
    guild: null,
    agent: agent("scout"),
    ...overrides,
  };
}

describe("scoreBid", () => {
  it("uses the published weights, applied to the bid's own price and ETA", () => {
    const cheap = scoreBid(bid({ amount_cents: 200 }), JOB);
    const dear = scoreBid(bid({ amount_cents: 1900 }), JOB);

    expect(cheap.parts.priceEfficiency).toBeGreaterThan(dear.parts.priceEfficiency);
    expect(cheap.score).toBeGreaterThan(dear.score);

    // The four weighted terms and nothing else.
    const parts = cheap.parts;
    const expected =
      SCORE_WEIGHTS.quality * parts.quality +
      SCORE_WEIGHTS.reliability * parts.reliability +
      SCORE_WEIGHTS.priceEfficiency * parts.priceEfficiency +
      SCORE_WEIGHTS.latencyFit * parts.latencyFit;
    expect(cheap.score).toBeCloseTo(expected, 3);
  });

  it("rewards a bid that lands well inside the deadline", () => {
    const fast = scoreBid(bid({ eta_seconds: 120 }), JOB);
    const slow = scoreBid(bid({ eta_seconds: 3500 }), JOB);
    expect(fast.parts.latencyFit).toBeGreaterThan(slow.parts.latencyFit);
  });

  it("clamps a bid that is over budget or past the deadline to zero, not negative", () => {
    const bad = scoreBid(bid({ amount_cents: 9_000, eta_seconds: 90_000 }), JOB);
    expect(bad.parts.priceEfficiency).toBe(0);
    expect(bad.parts.latencyFit).toBe(0);
    expect(bad.score).toBeGreaterThan(0);
  });

  it("explains itself in the buyer's terms", () => {
    const reasons = scoreBid(bid({ amount_cents: 1200, eta_seconds: 600 }), JOB).reasons;
    expect(reasons.some((line) => line.includes("under your $20.00 budget"))).toBe(true);
    expect(reasons.some((line) => line.includes("to spare"))).toBe(true);
  });

  it("says so when a bid is over budget", () => {
    const reasons = scoreBid(bid({ amount_cents: 2500 }), JOB).reasons;
    expect(reasons.some((line) => line.includes("over your budget"))).toBe(true);
  });
});

describe("sortBids", () => {
  const rows = [
    bid({ amount_cents: 1500, eta_seconds: 120, agent: agent("scout") }),
    bid({ amount_cents: 400, eta_seconds: 3000, agent: agent("newsbrief") }),
    bid({ amount_cents: 900, eta_seconds: 600, agent: agent("roofintel") }),
  ];

  it("offers exactly the three controls the job page shows", () => {
    expect(BID_SORTS.map((option) => option.value)).toEqual([
      "lowest",
      "fastest",
      "best",
    ]);
  });

  it("sorts by price, then by ETA, then by fit", () => {
    expect(sortBids(rows, "lowest", JOB).map((row) => row.amount_cents)).toEqual([
      400, 900, 1500,
    ]);
    expect(sortBids(rows, "fastest", JOB).map((row) => row.eta_seconds)).toEqual([
      120, 600, 3000,
    ]);

    const best = sortBids(rows, "best", JOB);
    const scores = best.map((row) => scoreBid(row, JOB).score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("does not mutate the list it is given", () => {
    const original = [...rows];
    sortBids(rows, "lowest", JOB);
    expect(rows).toEqual(original);
  });
});

describe("previewBids", () => {
  it("shows at most three live bids and never a rejected one", () => {
    const rows = [
      { ...bid({ amount_cents: 100 }), id: "a", status: "rejected" as const },
      { ...bid({ amount_cents: 200 }), id: "b" },
      { ...bid({ amount_cents: 300 }), id: "c" },
      { ...bid({ amount_cents: 400 }), id: "d" },
      { ...bid({ amount_cents: 500 }), id: "e" },
    ];
    const preview = previewBids(
      rows as never,
      { budget_cents: 2000, deadline_seconds: 3600 },
    );
    expect(preview).toHaveLength(3);
    expect(preview.some((row) => (row as { id: string }).id === "a")).toBe(false);
  });
});

describe("paginate", () => {
  it("describes the visible slice", () => {
    const page = paginate(16, 2, 9);
    expect(page).toMatchObject({ page: 2, pages: 2, offset: 9, from: 10, to: 16 });
  });

  it("clamps out-of-range pages instead of showing an empty board", () => {
    expect(paginate(16, 99, 9).page).toBe(2);
    expect(paginate(16, 0, 9).page).toBe(1);
    expect(paginate(16, -3, 9).page).toBe(1);
  });

  it("handles an empty result", () => {
    expect(paginate(0, 1, 9)).toMatchObject({ pages: 1, from: 0, to: 0, total: 0 });
  });

  it("uses a page size the 3-up grid divides cleanly", () => {
    expect(JOBS_PAGE_SIZE % 3).toBe(0);
  });
});

describe("status filters", () => {
  it("covers every status the board can show, plus All", () => {
    expect(JOB_STATUS_FILTERS.map((filter) => filter.value)).toEqual([
      "all",
      "open",
      "awarded",
      "in_progress",
      "completed",
    ]);
  });
});

describe("compatibleAgents", () => {
  const job = {
    title: "Find 200 roofing companies in Tampa with owner contacts",
    description: "Owner-occupied only. Every row needs a source.",
    category: "research" as const,
  };

  it("notifies the job's own category plus anything the brief implies", () => {
    const matched = compatibleAgents(seed.agents, job);
    const handles = matched.map((row) => row.handle);
    expect(handles).toContain("scout");
    expect(handles).toContain("roofintel");
    expect(matched.length).toBeGreaterThanOrEqual(4);
  });

  it("never notifies an offline agent", () => {
    const offline: Agent = { ...agent("scout"), id: "offline-1", handle: "sleepy", status: "offline" };
    const matched = compatibleAgents([...seed.agents, offline], job);
    expect(matched.some((row) => row.handle === "sleepy")).toBe(false);
  });
});

describe("planAutoBids", () => {
  const job: Pick<
    Job,
    "title" | "description" | "category" | "budget_cents" | "deadline_seconds"
  > = {
    title: "Find 200 roofing companies in Tampa",
    description: "Owner contacts, no rentals.",
    category: "research",
    budget_cents: 2000,
    deadline_seconds: 3600,
  };

  const candidates = [agent("scout"), agent("roofintel"), agent("researchotter")];

  it("prices every bid at or under the budget and inside the deadline", () => {
    for (const plan of planAutoBids(job, candidates)) {
      expect(plan.amountCents).toBeGreaterThan(0);
      expect(plan.amountCents).toBeLessThanOrEqual(job.budget_cents);
      expect(plan.etaSeconds).toBeLessThanOrEqual(job.deadline_seconds);
      expect(plan.note.length).toBeGreaterThan(20);
    }
  });

  it("is deterministic — the same job always produces the same offers", () => {
    expect(planAutoBids(job, candidates)).toEqual(planAutoBids(job, candidates));
  });

  it("produces genuinely different offers rather than three identical rows", () => {
    const plans = planAutoBids(job, candidates);
    expect(new Set(plans.map((plan) => plan.etaSeconds)).size).toBeGreaterThan(1);
    expect(new Set(plans.map((plan) => plan.note)).size).toBe(plans.length);
  });

  it("scales with the quantity in the brief", () => {
    const small = planAutoBids({ ...job, title: "Find 5 roofing companies" }, candidates);
    const large = planAutoBids({ ...job, title: "Find 800 roofing companies" }, candidates);
    expect(large[0].etaSeconds).toBeGreaterThan(small[0].etaSeconds);
  });
});

describe("pickGigForOutcome", () => {
  it("prefers the cheapest gig in a category the outcome actually names", () => {
    const gigs = seed.gigs
      .filter((gig) => ["qa-fox"].includes(agentById(gig.agent_id)))
      .map((gig) => ({ ...gig, agent: agent("qa-fox") }));
    const picked = pickGigForOutcome(gigs, ["development"]);
    // The cheapest development gig QA Fox sells (15¢) — not the first listed.
    expect(picked?.slug).toBe("fast-qa-smoke-test");
  });

  it("falls back to the cheapest gig when no category matches", () => {
    const gigs = seed.gigs
      .filter((gig) => agentById(gig.agent_id) === "qa-fox")
      .map((gig) => ({ ...gig, agent: agent("qa-fox") }));
    expect(pickGigForOutcome(gigs, ["finance"])?.slug).toBe("fast-qa-smoke-test");
    expect(pickGigForOutcome([], ["finance"])).toBeNull();
  });
});

describe("spendByAgent", () => {
  const base = {
    agent: agent("scout"),
    amount_cents: 100,
    status: "running",
  } as unknown as OrderDetail;

  it("splits held from released and sorts by total", () => {
    const rows = spendByAgent([
      { ...base, id: "1", amount_cents: 100, status: "running" } as OrderDetail,
      { ...base, id: "2", amount_cents: 500, status: "approved" } as OrderDetail,
      {
        ...base,
        id: "3",
        amount_cents: 900,
        status: "approved",
        agent: agent("roofintel"),
      } as OrderDetail,
    ]);

    expect(rows[0].handle).toBe("roofintel");
    expect(rows[0].totalCents).toBe(900);
    const scout = rows.find((row) => row.handle === "scout");
    expect(scout).toMatchObject({ runs: 2, heldCents: 100, releasedCents: 500, totalCents: 600 });
  });

  it("counts a disputed run without counting its money", () => {
    const rows = spendByAgent([
      { ...base, id: "4", amount_cents: 400, status: "disputed" } as OrderDetail,
    ]);
    expect(rows[0]).toMatchObject({ runs: 1, totalCents: 0, heldCents: 0 });
  });
});

describe("networkHealth", () => {
  it("is the mean reliability of everyone who is not offline", () => {
    const health = networkHealth(seed.agents);
    expect(health).toBeGreaterThan(90);
    expect(health).toBeLessThanOrEqual(100);
  });

  it("ignores offline agents", () => {
    const offline: Agent = { ...agent("scout"), id: "x", handle: "gone", status: "offline", reliability: 0 };
    expect(networkHealth([...seed.agents, offline])).toBe(networkHealth(seed.agents));
  });

  it("does not divide by zero", () => {
    expect(networkHealth([])).toBe(0);
  });
});

describe("intentChips", () => {
  it("turns the extracted intent into renderable chips", () => {
    const intent = extractIntent("Find 200 roofing companies in Tampa under $10");
    const chips = intentChips(intent, { research: "Research", home_services: "Home Services" });
    const values = chips.map((chip) => chip.value);
    expect(values).toContain("Research");
    expect(values).toContain("Tampa, FL");
    expect(values).toContain("200");
    expect(values).toContain("$10.00");
  });
});

describe("placeBidCurl", () => {
  it("posts to the documented bids endpoint with the agent handle", () => {
    const snippet = placeBidCurl("https://agentdistrict.test", "job-1", {
      agentHandle: "scout",
      amountCents: 1200,
      etaSeconds: 900,
    });
    expect(snippet).toContain("POST https://agentdistrict.test/api/v1/jobs/job-1/bids");
    expect(snippet).toContain('"agent_handle": "scout"');
    expect(snippet).toContain('"amount_cents": 1200');
    expect(snippet).toContain("Authorization: Bearer");
  });
});

function agentById(id: string): string {
  return seed.agents.find((row) => row.id === id)?.handle ?? "";
}
