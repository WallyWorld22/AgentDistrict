/**
 * Pure helpers behind the reverse market (`/jobs`), the @World concierge
 * (`/world`) and the Command Center (`/command`).
 *
 * Everything here is composed from methods that already exist on the
 * `Repository` — no adapter is imported and no new data access is invented, so
 * both data modes behave identically. `Repository` is imported **type-only** so
 * this module is safe to pull into a client bundle (the bids table sorts and
 * scores in the browser), and the scoring imports reach into
 * `lib/world/scoring` / `lib/world/intent` directly rather than `lib/world`,
 * whose index pulls in `getRepo()`.
 */

import type { Repository } from "@/lib/data/repository";
import type {
  Agent,
  AgentCategory,
  BidStatus,
  BidWithAgent,
  Cents,
  GigWithAgent,
  Handle,
  Job,
  JobSort,
  JobStatus,
  JobWithBidCount,
  OrderDetail,
  UUID,
} from "@/lib/data/types";
import { formatCents, formatDuration } from "@/lib/utils";
import { SCORE_WEIGHTS, qualityScore, reliabilityScore } from "@/lib/world/scoring";
import { extractIntent, type WorldIntent } from "@/lib/world/intent";

/* -------------------------------------------------------------- the board */

/** Status chips on `/jobs`. `all` is the absence of a `status` param. */
export const JOB_STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "awarded", label: "Awarded" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
] as const;

export type JobStatusFilter = (typeof JOB_STATUS_FILTERS)[number]["value"];

export const JOB_SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "budget", label: "Budget" },
  { value: "bids", label: "Most bids" },
  { value: "deadline", label: "Ending soonest" },
] as const satisfies ReadonlyArray<{ value: JobSort; label: string }>;

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  open: "Open",
  awarded: "Awarded",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const JOB_STATUS_VARIANT = {
  open: "green",
  awarded: "blue",
  in_progress: "purple",
  completed: "cyan",
  cancelled: "red",
} as const satisfies Record<JobStatus, string>;

/** Cards per page on the board. Three rows of the 3-up desktop grid. */
export const JOBS_PAGE_SIZE = 9;

/** How many bids each board card previews inline. */
export const BOARD_BID_PREVIEW = 3;

export type Pagination = {
  page: number;
  pages: number;
  total: number;
  offset: number;
  /** 1-based inclusive range of the visible slice, for "13–21 of 46". */
  from: number;
  to: number;
};

export function paginate(total: number, page: number, size = JOBS_PAGE_SIZE): Pagination {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const offset = (current - 1) * size;
  return {
    page: current,
    pages,
    total,
    offset,
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(total, offset + size),
  };
}

export type BoardJob = JobWithBidCount & {
  /** The `BOARD_BID_PREVIEW` best bids, already ranked. */
  bids: BidWithAgent[];
  /** The accepted bid, on an awarded / in-progress / completed bounty. */
  winner: BidWithAgent | null;
};

export type JobBoard = {
  jobs: BoardJob[];
  page: Pagination;
  /** Count per status chip across the *unpaginated*, otherwise-filtered set. */
  counts: Record<JobStatusFilter, number>;
};

/**
 * One page of the bounty board, with each card's top bids attached.
 *
 * `listJobs` returns bid *counts*, not bids, and there is no repository method
 * that reads bids for many jobs at once — so this fans out `getJob` over the
 * nine rows of the current page only (never the whole board). A
 * The bids for the whole page come back in one `listBidsForJobs` round trip.
 */
export async function loadJobBoard(
  repo: Repository,
  filter: {
    q?: string;
    category?: AgentCategory;
    status?: JobStatus;
    sort: JobSort;
    page: number;
  },
): Promise<JobBoard> {
  // Fetch the filtered set once (bounded), so the status chips can be counted
  // and the page sliced without a second query per chip.
  const matching = await repo.listJobs({
    q: filter.q,
    category: filter.category,
    status: filter.status,
    sort: filter.sort,
    limit: 200,
  });

  const counts = countStatuses(
    filter.status
      ? await repo.listJobs({ q: filter.q, category: filter.category, sort: filter.sort, limit: 200 })
      : matching,
  );

  const page = paginate(matching.length, filter.page);
  const slice = matching.slice(page.offset, page.offset + JOBS_PAGE_SIZE);

  const bidsByJob = await repo.listBidsForJobs(
    slice.filter((job) => job.bidCount > 0).map((job) => job.id),
  );

  const jobs = slice.map((job): BoardJob => {
    const bids = bidsByJob[job.id] ?? [];
    return {
      ...job,
      bids: previewBids(bids, job),
      winner: bids.find((bid) => bid.status === "accepted") ?? null,
    };
  });

  return { jobs, page, counts };
}

function countStatuses(jobs: JobWithBidCount[]): Record<JobStatusFilter, number> {
  const counts: Record<JobStatusFilter, number> = {
    all: jobs.length,
    open: 0,
    awarded: 0,
    in_progress: 0,
    completed: 0,
  };
  for (const job of jobs) {
    if (job.status in counts) counts[job.status as JobStatusFilter] += 1;
  }
  return counts;
}

/** The bids a board card shows: pending ones ranked by fit, best first. */
export function previewBids(bids: BidWithAgent[], job: JobTerms): BidWithAgent[] {
  return sortBids(
    bids.filter((bid) => bid.status === "pending"),
    "best",
    job,
  ).slice(0, BOARD_BID_PREVIEW);
}

/* ------------------------------------------------------------ bid ranking */

export const BID_SORTS = [
  { value: "lowest", label: "Lowest" },
  { value: "fastest", label: "Fastest" },
  { value: "best", label: "Best fit" },
] as const;

export type BidSort = (typeof BID_SORTS)[number]["value"];

/** The two job fields every bid is measured against. */
export type JobTerms = { budget_cents: Cents; deadline_seconds: number };

/** A bid, reduced to what scoring and rendering need. */
export type ScorableBid = {
  amount_cents: Cents;
  eta_seconds: number;
  status?: BidStatus;
  guild?: { name: string } | null;
  agent: Pick<
    Agent,
    | "rating_avg"
    | "rating_count"
    | "reliability"
    | "repeat_hire_rate"
    | "dispute_rate"
    | "verified"
  >;
};

export type BidScore = {
  /** 0..1 — the published procurement formula, applied to this bid. */
  score: number;
  parts: {
    quality: number;
    reliability: number;
    priceEfficiency: number;
    latencyFit: number;
  };
  /** Ready-to-render explanations, best first. */
  reasons: string[];
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Score a bid with the same weights `/jobs` publishes.
 *
 * `lib/world` scores *agents*, using their list price and typical latency. A
 * bid is a promise about this job, so the two market terms come from the bid
 * itself — its amount against the budget, its ETA against the deadline — while
 * quality and reliability still come from the agent's Passport.
 */
export function scoreBid(bid: ScorableBid, job: JobTerms): BidScore {
  const agent = bid.agent as Agent;
  const budget = Math.max(1, job.budget_cents);
  const deadline = Math.max(1, job.deadline_seconds);

  const parts = {
    quality: qualityScore(agent),
    reliability: reliabilityScore(agent),
    priceEfficiency: clamp01(1 - bid.amount_cents / budget),
    latencyFit: clamp01(1 - bid.eta_seconds / deadline),
  };

  const score =
    SCORE_WEIGHTS.quality * parts.quality +
    SCORE_WEIGHTS.reliability * parts.reliability +
    SCORE_WEIGHTS.priceEfficiency * parts.priceEfficiency +
    SCORE_WEIGHTS.latencyFit * parts.latencyFit;

  return { score: Math.round(score * 10_000) / 10_000, parts, reasons: bidReasons(bid, job) };
}

function bidReasons(bid: ScorableBid, job: JobTerms): string[] {
  const reasons: string[] = [];
  const agent = bid.agent;

  if (agent.rating_count > 0) {
    reasons.push(
      `★ ${agent.rating_avg.toFixed(2)} from ${agent.rating_count.toLocaleString("en-US")} reviews`,
    );
  }
  reasons.push(
    `${(agent.reliability * 100).toFixed(1)}% on-time · ${Math.round(
      agent.repeat_hire_rate * 100,
    )}% repeat hires`,
  );

  const under = job.budget_cents - bid.amount_cents;
  reasons.push(
    under >= 0
      ? `${formatCents(under)} under your ${formatCents(job.budget_cents)} budget`
      : `${formatCents(-under)} over your budget`,
  );

  const spare = job.deadline_seconds - bid.eta_seconds;
  reasons.push(
    spare >= 0
      ? `Delivers in ${formatDuration(bid.eta_seconds)} — ${formatDuration(spare)} to spare`
      : `Delivers ${formatDuration(-spare)} past your deadline`,
  );

  if (bid.guild?.name) reasons.push(`Runs as ${bid.guild.name}`);
  else if (agent.verified) reasons.push("Verified Passport");

  return reasons.slice(0, 5);
}

/** Sort a bid list by the three controls on `/jobs/[id]`. */
export function sortBids<T extends ScorableBid>(
  bids: T[],
  sort: BidSort,
  job: JobTerms,
): T[] {
  const rows = [...bids];
  switch (sort) {
    case "fastest":
      return rows.sort(
        (a, b) => a.eta_seconds - b.eta_seconds || a.amount_cents - b.amount_cents,
      );
    case "best":
      return rows.sort(
        (a, b) =>
          scoreBid(b, job).score - scoreBid(a, job).score ||
          a.amount_cents - b.amount_cents,
      );
    default:
      return rows.sort(
        (a, b) => a.amount_cents - b.amount_cents || a.eta_seconds - b.eta_seconds,
      );
  }
}

/* --------------------------------------------------------- bounty posting */

export const JOB_DEADLINES = [
  { value: "900", label: "15 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "10800", label: "3 hours" },
  { value: "28800", label: "Today (8 hours)" },
  { value: "86400", label: "24 hours" },
  { value: "259200", label: "3 days" },
] as const;

/**
 * Agents that would be notified when this bounty is published: everyone in the
 * job's category who is not offline, plus anyone whose skills match the words
 * in the brief. This is the number `/jobs/new` promises and the job page
 * reports back ("6 compatible agents were notified").
 */
export function compatibleAgents(agents: Agent[], job: Pick<Job, "title" | "description" | "category">): Agent[] {
  const intent = extractIntent(`${job.title} ${job.description}`);
  const wanted = new Set<string>([job.category, ...intent.categories]);
  const skills = intent.skills.map((skill) => skill.toLowerCase());

  return agents.filter((agent) => {
    if (agent.status === "offline") return false;
    if (wanted.has(agent.category)) return true;
    const owned = agent.skills.map((skill) => skill.toLowerCase());
    return skills.some((skill) => owned.some((have) => have.includes(skill) || skill.includes(have)));
  });
}

export type AutoBidPlan = {
  agentHandle: Handle;
  amountCents: Cents;
  etaSeconds: number;
  note: string;
};

/**
 * The bids the District's matching agents place seconds after a bounty goes up.
 *
 * A bounty board with no bids is not a market, and in the demo there is no
 * second human to bid — so posting a job wakes the best-matched agents and they
 * answer, exactly like the "6 compatible agents were notified" promise the
 * legacy prototype made. Deterministic (no randomness): each agent bids its own
 * estimate for the job, clamped under the budget, and quotes its typical
 * latency, staggered so the three offers are genuinely different.
 */
export function planAutoBids(
  job: Pick<Job, "title" | "description" | "category" | "budget_cents" | "deadline_seconds">,
  candidates: Agent[],
  limit = 3,
): AutoBidPlan[] {
  const intent = extractIntent(`${job.title} ${job.description}`);
  const volume = intent.quantity ? Math.min(8, Math.max(1, Math.ceil(intent.quantity / 100))) : 1;

  return candidates.slice(0, limit).map((agent, index) => {
    // A hungry first bidder undercuts; later bidders price their extras in.
    const ceiling = Math.round(job.budget_cents * (0.55 + index * 0.15));
    const list = Math.max(1, agent.starting_price_cents * volume);
    const amount = Math.max(1, Math.min(ceiling, list === 1 ? ceiling : list));
    const eta = Math.max(
      60,
      Math.min(
        job.deadline_seconds,
        Math.round(agent.avg_latency_sec * volume * (1 + index * 0.35)),
      ),
    );
    return {
      agentHandle: agent.handle,
      amountCents: amount,
      etaSeconds: eta,
      note: autoBidNote(agent, index),
    };
  });
}

function autoBidNote(agent: Agent, index: number): string {
  const skills = agent.skills.slice(0, 2).join(" + ") || "the full pipeline";
  const openers = [
    `I can start now. ${skills} — you get the schema you asked for, every row sourced.`,
    `Priced for the whole batch. ${skills}, plus a QA pass before delivery.`,
    `Slower but thorough: ${skills}, with a written summary of what I could not verify.`,
  ];
  return openers[index % openers.length];
}

/* ------------------------------------------------------- jobs → orders */

/**
 * The run an awarded bounty became, when the signed-in buyer can see it.
 *
 * Scoped to the buyer as well as the job: Supabase RLS would return nothing
 * else anyway, and in demo mode it keeps another poster's run out of view.
 */
export async function findOrderForJob(
  repo: Repository,
  jobId: UUID,
  buyerId: UUID,
): Promise<OrderDetail | null> {
  const orders = await repo.listOrders({ buyerId, jobId, limit: 1 });
  return orders[0] ?? null;
}

/**
 * The "related" rail on a job page: open bounties in the same category first,
 * topped up with the busiest open bounties elsewhere so the rail is never empty
 * on a category that happens to have only one job.
 */
export async function relatedJobs(
  repo: Repository,
  job: Job,
  limit = 4,
): Promise<JobWithBidCount[]> {
  const sameCategory = await repo.listJobs({
    category: job.category,
    status: "open",
    sort: "bids",
    limit: limit + 1,
  });
  const picked = sameCategory.filter((row) => row.id !== job.id).slice(0, limit);
  if (picked.length >= limit) return picked;

  const seen = new Set([job.id, ...picked.map((row) => row.id)]);
  const rest = await repo.listJobs({ status: "open", sort: "bids", limit: limit * 3 });
  for (const row of rest) {
    if (picked.length >= limit) break;
    if (seen.has(row.id)) continue;
    picked.push(row);
    seen.add(row.id);
  }
  return picked;
}

/* ------------------------------------------------------- hiring an agent */

/**
 * The gig to run when a buyer hires an agent straight off a ranked list or a
 * bid: the cheapest published gig whose category matches the outcome, else the
 * cheapest gig the agent sells at all.
 */
export function pickGigForOutcome(
  gigs: GigWithAgent[],
  categories: AgentCategory[],
): GigWithAgent | null {
  if (gigs.length === 0) return null;
  const price = (gig: GigWithAgent) =>
    gig.packages.find((pkg) => pkg.tier === "basic")?.price_cents ?? gig.starting_price_cents;
  const ranked = [...gigs].sort((a, b) => price(a) - price(b));
  return ranked.find((gig) => categories.includes(gig.category)) ?? ranked[0];
}

/* ------------------------------------------------------- command centre */

export type AgentSpendRow = {
  handle: Handle;
  name: string;
  avatarEmoji: string;
  avatarGradient: string;
  runs: number;
  /** Everything ever committed to this agent (held + released). */
  totalCents: Cents;
  /** Still held against a run that has not been approved. */
  heldCents: Cents;
  /** Released to the agent after approval. */
  releasedCents: Cents;
};

/** Spend grouped by agent, biggest first — the Command Center's spend table. */
export function spendByAgent(orders: OrderDetail[]): AgentSpendRow[] {
  const rows = new Map<Handle, AgentSpendRow>();

  for (const order of orders) {
    if (order.status === "cancelled" || order.status === "failed") continue;
    const row = rows.get(order.agent.handle) ?? {
      handle: order.agent.handle,
      name: order.agent.name,
      avatarEmoji: order.agent.avatar_emoji,
      avatarGradient: order.agent.avatar_gradient,
      runs: 0,
      totalCents: 0,
      heldCents: 0,
      releasedCents: 0,
    };
    row.runs += 1;
    if (order.status === "disputed") {
      rows.set(order.agent.handle, row);
      continue;
    }
    row.totalCents += order.amount_cents;
    if (order.status === "approved") row.releasedCents += order.amount_cents;
    else row.heldCents += order.amount_cents;
    rows.set(order.agent.handle, row);
  }

  return [...rows.values()].sort(
    (a, b) => b.totalCents - a.totalCents || b.runs - a.runs || a.name.localeCompare(b.name),
  );
}

/**
 * Network health as a percentage: the mean reliability of every agent that is
 * not offline. Derived from real rows, so it moves when the District does.
 */
export function networkHealth(agents: Agent[]): number {
  const online = agents.filter((agent) => agent.status !== "offline");
  if (online.length === 0) return 0;
  const total = online.reduce((sum, agent) => sum + agent.reliability, 0);
  return Math.round((total / online.length) * 1000) / 10;
}

/* -------------------------------------------------------- machine surface */

/** `curl` for `POST /api/v1/jobs/:id/bids` — the same bid this page places. */
export function placeBidCurl(
  origin: string,
  jobId: UUID,
  bid: { agentHandle: Handle; amountCents: Cents; etaSeconds: number },
): string {
  const body = JSON.stringify(
    {
      agent_handle: bid.agentHandle,
      amount_cents: bid.amountCents,
      eta_seconds: bid.etaSeconds,
      note: "Bidding from code — same contract as the form.",
    },
    null,
    2,
  );
  return [
    `curl -X POST ${origin}/api/v1/jobs/${jobId}/bids \\`,
    `  -H "Authorization: Bearer $AGENTDISTRICT_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${body}'`,
  ].join("\n");
}

/** `curl` for `GET /api/v1/jobs/:id/bids`. */
export function readBidsCurl(origin: string, jobId: UUID): string {
  return `curl ${origin}/api/v1/jobs/${jobId}/bids`;
}

/** The intent @World extracted, reduced to renderable chips. */
export type IntentChip = { label: string; value: string; tone: "blue" | "cyan" | "purple" | "green" | "yellow" };

export function intentChips(intent: WorldIntent, categoryLabels: Record<string, string>): IntentChip[] {
  const chips: IntentChip[] = [];
  for (const category of intent.categories.slice(0, 3)) {
    chips.push({ label: "Category", value: categoryLabels[category] ?? category, tone: "blue" });
  }
  for (const skill of intent.skills.slice(0, 4)) {
    chips.push({ label: "Skill", value: skill, tone: "cyan" });
  }
  if (intent.region) {
    chips.push({
      label: "Region",
      value: intent.locations[0] ? `${intent.locations[0]}, ${intent.region}` : intent.region,
      tone: "purple",
    });
  }
  if (intent.quantity) {
    chips.push({ label: "Quantity", value: intent.quantity.toLocaleString("en-US"), tone: "green" });
  }
  if (intent.budgetCents) {
    chips.push({ label: "Budget", value: formatCents(intent.budgetCents), tone: "green" });
  }
  if (intent.deadlineSeconds) {
    chips.push({ label: "Deadline", value: formatDuration(intent.deadlineSeconds), tone: "yellow" });
  }
  return chips;
}
