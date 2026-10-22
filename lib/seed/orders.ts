import type {
  Agent,
  CostBreakdown,
  Gig,
  Order,
  OrderAuditEntry,
  OrderOutput,
  OrderStatus,
  PackageTier,
  Review,
} from "../data/types";
import { agent, agents } from "./agents";
import { at, daysAgo, minutesAgo, secondsAgo } from "./clock";
import { gig, gigs } from "./gigs";
import { acceptedBidId, jobId } from "./jobs";
import { BUYER_HANDLES, DEMO_PROFILE_ID, profileId } from "./profiles";
import { buildContractDeliverable } from "../runtime/deliverable";
import { intBetween, rngFor } from "./rng";
import { id } from "./uuid";

/**
 * Orders (task runs) and the reviews they produce.
 *
 * Three groups:
 *  1. `austin` — three approved orders and four in flight, which is what the
 *     Command Center and `/orders/[id]` render in demo mode. The four in-flight
 *     holds sum to exactly 1,237¢, so `balance − held` is $12.43: the Credits
 *     pill in `docs/reference/desktop-home.png`.
 *  2. Job awards — an order per accepted bid, so `/jobs/[id]` → order works.
 *  3. History — one approved order per gig, each with a review, which is what
 *     backs the ≥ 40 reviews BUILD_SPEC §2 asks for.
 *
 * Progress on a running order is consistent with `started_at` + `eta_seconds`
 * so `refreshOrder()` (BUILD_SPEC §6) recomputes the same number it was seeded
 * with rather than jumping when the page first loads.
 */

/* -------------------------------------------------------------------------- */
/* Deliverable synthesis                                                       */
/*                                                                             */
/* One generator, shared with the runtime: `lib/runtime/deliverable.ts`. A      */
/* second copy here is how seeded QA reports, ad copy and service areas all     */
/* ended up filled from the same roofing-lead phrase pool.                      */
/* -------------------------------------------------------------------------- */

/** Build a structured deliverable matching the gig's own output contract. */
function buildOutput(source: Gig, worker: Agent, rowCount: number, seed: string): OrderOutput {
  return buildContractDeliverable({
    contract: source.output_contract,
    category: source.category,
    title: source.title,
    agentName: worker.name,
    agentHandle: worker.handle,
    slug: source.slug,
    rng: rngFor(seed),
    seed,
    rowCount,
  });
}

/** 10% District fee, 5% tool cost, the rest to the agent. Always sums exactly. */
function costBreakdown(amount: number): CostBreakdown {
  const districtFee = Math.round(amount * 0.1);
  const tools = Math.round(amount * 0.05);
  return {
    agent_cents: amount - districtFee - tools,
    district_fee_cents: districtFee,
    tools_cents: tools,
    total_cents: amount,
  };
}

function auditLog(
  worker: Agent,
  createdAt: string,
  startedAt: string | null,
  deliveredAt: string | null,
  approvedAt: string | null,
): OrderAuditEntry[] {
  const entries: OrderAuditEntry[] = [
    { at: createdAt, actor: "buyer", event: "order.created", detail: "Brief accepted, funds held." },
    {
      at: createdAt,
      actor: "district",
      event: "policy.checked",
      detail: "Spend limit and data policy verified.",
    },
  ];
  if (startedAt) {
    entries.push({
      at: startedAt,
      actor: `@${worker.handle}`,
      event: "run.started",
      detail: "Simulated run — no external calls were made.",
    });
  }
  if (deliveredAt) {
    entries.push({
      at: deliveredAt,
      actor: `@${worker.handle}`,
      event: "run.delivered",
      detail: "Output validated against the gig's output contract.",
    });
  }
  if (approvedAt) {
    entries.push({
      at: approvedAt,
      actor: "buyer",
      event: "order.approved",
      detail: "Hold released — 90% payout, 10% District fee.",
    });
  }
  return entries;
}

/** agent_id → handle, so a gig can name its own agent in one lookup. */
const HANDLE_BY_AGENT_ID = new Map(agents.map((a) => [a.id, a.handle]));

function agentHandleFor(source: Gig): string {
  const handle = HANDLE_BY_AGENT_ID.get(source.agent_id);
  if (!handle) throw new Error(`seed: gig ${source.slug} has no agent`);
  return handle;
}

type OrderInit = {
  key: string;
  buyer: string;
  agentHandle: string;
  gigSlug?: string;
  jobSlug?: string;
  bidId?: string;
  tier?: PackageTier;
  brief: string;
  amount: number;
  status: OrderStatus;
  progress: number;
  eta: number;
  createdAt: string;
  startedAt?: string | null;
  deliveredAt?: string | null;
  approvedAt?: string | null;
  rows?: number;
};

function makeOrder(init: OrderInit): Order {
  const worker = agent(init.agentHandle);
  const source = init.gigSlug ? gig(init.gigSlug) : null;
  const finished = init.status === "delivered" || init.status === "approved";
  const startedAt = init.startedAt ?? null;
  const deliveredAt = init.deliveredAt ?? null;

  return {
    id: id("order", init.key),
    buyer_id: profileId(init.buyer),
    agent_id: worker.id,
    gig_id: source ? source.id : null,
    job_id: init.jobSlug ? jobId(init.jobSlug) : null,
    bid_id: init.bidId ?? null,
    package_tier: init.tier ?? null,
    brief: init.brief,
    amount_cents: init.amount,
    status: init.status,
    progress: init.progress,
    eta_seconds: init.eta,
    started_at: startedAt,
    delivered_at: deliveredAt,
    output:
      finished && source
        ? buildOutput(source, worker, init.rows ?? 6, `order:${init.key}`)
        : null,
    cost_breakdown: init.status === "approved" ? costBreakdown(init.amount) : null,
    audit_log: auditLog(worker, init.createdAt, startedAt, deliveredAt, init.approvedAt ?? null),
    created_at: init.createdAt,
    updated_at: init.approvedAt ?? deliveredAt ?? startedAt ?? init.createdAt,
  };
}

/* -------------------------------------------------------------------------- */
/* 1. Austin — three approved, four in flight                                  */
/* -------------------------------------------------------------------------- */

const AUSTIN_COMPLETED: Order[] = [
  makeOrder({
    key: "austin-copycat-social",
    buyer: "austin",
    agentHandle: "copycat",
    gigSlug: "social-media-content-package",
    tier: "standard",
    brief:
      "Thirty days of posts for WallyWorks Labs. Audience is home-services owners in Florida who already use one piece of software and hate it.",
    amount: 320,
    status: "approved",
    progress: 100,
    eta: 360,
    createdAt: daysAgo(5),
    startedAt: at(-5 * 86400 + 40),
    deliveredAt: at(-5 * 86400 + 400),
    approvedAt: at(-5 * 86400 + 2100),
    rows: 12,
  }),
  makeOrder({
    key: "austin-parcelpro-property",
    buyer: "austin",
    agentHandle: "parcelpro",
    gigSlug: "property-analysis-ownership-permits-comps",
    tier: "standard",
    brief: "606 Example Dr, Fort Pierce. Full picture including comps and reroof signal.",
    amount: 110,
    status: "approved",
    progress: 100,
    eta: 140,
    createdAt: daysAgo(4),
    startedAt: at(-4 * 86400 + 18),
    deliveredAt: at(-4 * 86400 + 158),
    approvedAt: at(-4 * 86400 + 900),
  }),
  makeOrder({
    key: "austin-scout-qualified",
    buyer: "austin",
    agentHandle: "scout",
    gigSlug: "find-100-qualified-local-businesses",
    tier: "standard",
    brief:
      "250 roofing companies across the Treasure Coast. Owner name where public, and skip anything with fewer than 5 reviews.",
    amount: 189,
    status: "approved",
    progress: 100,
    eta: 420,
    createdAt: daysAgo(8),
    startedAt: at(-8 * 86400 + 30),
    deliveredAt: at(-8 * 86400 + 450),
    approvedAt: at(-8 * 86400 + 3600),
    rows: 12,
  }),
];

/**
 * Four in-flight orders. Their amounts sum to 1,237¢ — see the note at the top
 * of this file. Progress matches `started_at` + `eta_seconds`.
 */
const AUSTIN_ACTIVE: Order[] = [
  makeOrder({
    key: "austin-roofintel-orlando-batch",
    buyer: "austin",
    agentHandle: "roofintel",
    gigSlug: "reroof-opportunity-scoring",
    tier: "basic",
    brief: "200 properties in 32801 and 32803. Score for reroof likelihood, owner-occupied only.",
    amount: 470,
    status: "running",
    progress: 76,
    eta: 240,
    createdAt: secondsAgo(214),
    startedAt: secondsAgo(182),
  }),
  makeOrder({
    key: "austin-scout-local-lead-research",
    buyer: "austin",
    agentHandle: "scout",
    gigSlug: "find-100-qualified-local-businesses",
    tier: "basic",
    brief: "100 gutter and exterior companies in Brevard County.",
    amount: 79,
    status: "running",
    progress: 48,
    eta: 240,
    createdAt: secondsAgo(140),
    startedAt: secondsAgo(115),
  }),
  makeOrder({
    key: "austin-webbuilder-location-pages",
    buyer: "austin",
    agentHandle: "webbuilder",
    jobSlug: "refresh-wallyworks-location-pages",
    bidId: acceptedBidId("refresh-wallyworks-location-pages"),
    brief:
      "Six WallyWorks location pages: new copy, refreshed schema, mobile pass. Same URLs, no redirects.",
    amount: 578,
    status: "running",
    progress: 92,
    eta: 1500,
    createdAt: secondsAgo(1440),
    startedAt: secondsAgo(1380),
  }),
  makeOrder({
    key: "austin-qafox-regression",
    buyer: "austin",
    agentHandle: "qa-fox",
    gigSlug: "full-qa-pass-with-repro-steps",
    tier: "basic",
    brief: "Smoke pass on the new WallyWorks quote flow at 390px and 1440px.",
    amount: 110,
    status: "delivered",
    progress: 100,
    eta: 360,
    createdAt: secondsAgo(440),
    startedAt: secondsAgo(400),
    deliveredAt: secondsAgo(40),
    rows: 8,
  }),
];

/**
 * Two runs that did not end well.
 *
 * `cancelled` and `failed` are first-class `order_status` values with their own
 * `OrderStatusPill` and their own refund path, and with no seeded row neither
 * could be seen anywhere in the District. Both are **settled** — the hold came
 * back — so they are deliberately outside `AUSTIN_ACTIVE` and do not move
 * `held_cents` or the $12.43 credits pill. The ledger carries a `refund` row
 * for each, mirroring what `refundHold()` writes at runtime.
 */
const AUSTIN_CLOSED: Order[] = [
  makeOrder({
    key: "austin-unitfox-cancelled",
    buyer: "austin",
    agentHandle: "unitfox",
    gigSlug: "bulk-format-and-unit-conversion",
    tier: "standard",
    brief: "Convert the 2024 pricing sheet from metric to imperial. Cancelled — the sheet changed.",
    amount: 30,
    status: "cancelled",
    progress: 12,
    eta: 90,
    createdAt: daysAgo(3),
    startedAt: at(-3 * 86400 + 20),
  }),
  makeOrder({
    key: "austin-sitesprint-failed",
    buyer: "austin",
    agentHandle: "sitesprint",
    gigSlug: "one-page-microsite-in-30-minutes",
    tier: "basic",
    brief:
      "One-page site for the Fort Pierce showroom. The run failed on the third asset fetch and was refunded.",
    amount: 86,
    status: "failed",
    progress: 64,
    eta: 1800,
    createdAt: daysAgo(2),
    startedAt: at(-2 * 86400 + 15),
  }),
];

/* -------------------------------------------------------------------------- */
/* 2. Job awards                                                               */
/* -------------------------------------------------------------------------- */

const JOB_ORDERS: Order[] = [
  makeOrder({
    key: "roofco-storm-sweep",
    buyer: "roofco-ray",
    agentHandle: "roofintel",
    jobSlug: "storm-sweep-fort-pierce",
    bidId: acceptedBidId("storm-sweep-fort-pierce"),
    brief:
      "Fort Pierce, first light. Four crews. Wind exposure, roof material, roof age, owner contact where public.",
    amount: 4800,
    status: "running",
    progress: 61,
    eta: 1800,
    createdAt: minutesAgo(38),
    startedAt: secondsAgo(1098),
  }),
  makeOrder({
    key: "jess-landing-page-stuart",
    buyer: "buildwithjess",
    agentHandle: "webbuilder",
    jobSlug: "landing-page-stuart-hvac",
    bidId: acceptedBidId("landing-page-stuart-hvac"),
    brief: "One page, one offer: free system health check. Phone number where a thumb already is.",
    amount: 3600,
    status: "queued",
    progress: 0,
    eta: 1500,
    createdAt: minutesAgo(22),
  }),
  makeOrder({
    key: "omar-permit-pdfs",
    buyer: "orlando-omar",
    agentHandle: "quickpdf",
    jobSlug: "summarize-140-permit-pdfs",
    bidId: acceptedBidId("summarize-140-permit-pdfs"),
    gigSlug: "pdf-summary-with-page-refs",
    brief: "140 permit PDFs from four counties into one table, today.",
    amount: 900,
    status: "approved",
    progress: 100,
    eta: 900,
    createdAt: daysAgo(6),
    startedAt: at(-6 * 86400 + 60),
    deliveredAt: at(-6 * 86400 + 960),
    approvedAt: at(-6 * 86400 + 5400),
    rows: 10,
  }),
];

/* -------------------------------------------------------------------------- */
/* 3. History — one approved order per gig, each with a review                 */
/* -------------------------------------------------------------------------- */

const HISTORY_TIERS: PackageTier[] = ["basic", "standard", "premium"];

const HISTORY_BRIEFS = [
  "Standard scope, nothing unusual. Same as last time.",
  "Rush job — I needed this before a Monday meeting.",
  "First time using an agent for this. Kept the scope small on purpose.",
  "Repeat order. Same format as the last run, new territory.",
  "Handing the output straight to my sales team, so it has to be clean.",
  "This normally takes my assistant two days.",
  "Testing whether this is worth doing every month.",
  "Follow-on from the guild run last week.",
];

const historyRng = rngFor("order-history-v1");

/**
 * Buyers, rotated **per agent** rather than per row.
 *
 * A Passport renders its four most recent reviews, and two rows that happened
 * to land on the same buyer put the same name twice in a row under the same
 * agent. Stepping by 3 through the 11 buyers (coprime, so no early repeat) from
 * a per-agent starting offset makes consecutive reviewers distinct by
 * construction.
 */
const buyerCursors = new Map<string, number>();

function nextBuyerFor(agentHandle: string): string {
  const cursor = buyerCursors.get(agentHandle) ?? offsetFor(agentHandle, BUYER_HANDLES.length);
  buyerCursors.set(agentHandle, cursor + 1);
  return BUYER_HANDLES[(cursor * 3) % BUYER_HANDLES.length];
}

const HISTORY: Order[] = gigs.map((source, index) => {
  const buyer = nextBuyerFor(agentHandleFor(source));
  const tier = HISTORY_TIERS[index % 3];
  const pkg = source.packages.find((p) => p.tier === tier) ?? source.packages[0];
  const daysBack = 3 + ((index * 7) % 84);
  const createdAt = daysAgo(daysBack);
  const base = -daysBack * 86400;
  return makeOrder({
    key: `history-${source.slug}`,
    buyer,
    agentHandle: agentHandleFor(source),
    gigSlug: source.slug,
    tier,
    brief: HISTORY_BRIEFS[index % HISTORY_BRIEFS.length],
    amount: pkg.price_cents,
    status: "approved",
    progress: 100,
    eta: pkg.delivery_seconds,
    createdAt,
    startedAt: at(base + 25),
    deliveredAt: at(base + 25 + pkg.delivery_seconds),
    approvedAt: at(base + 25 + pkg.delivery_seconds + intBetween(historyRng, 300, 7200)),
    rows: 6,
  });
});

/**
 * Seven extra repeat orders on the most-hired gigs, for a denser review corpus.
 *
 * Two entries for Scout's flagship gig, because a review is only written when
 * the buyer does *not* own the agent — austin owns Scout, so his own approved
 * Scout run is deliberately review-less and the Passport would otherwise show
 * fewer reviews than the preview cap.
 */
const REPEAT_GIG_SLUGS = [
  "find-100-qualified-local-businesses",
  "property-analysis-ownership-permits-comps",
  "full-qa-pass-with-repro-steps",
  "reroof-opportunity-scoring",
  "territories-heatmaps-route-priorities",
  "offer-landing-copy-and-three-emails",
  "find-100-qualified-local-businesses",
];

const REPEATS: Order[] = REPEAT_GIG_SLUGS.map((slug, index) => {
  const source = gig(slug);
  const pkg = source.packages[(index + 1) % 3];
  const buyer = nextBuyerFor(agentHandleFor(source));
  const daysBack = 11 + index * 9;
  const base = -daysBack * 86400;
  return makeOrder({
    key: `repeat-${index}-${slug}`,
    buyer,
    agentHandle: agentHandleFor(source),
    gigSlug: slug,
    tier: pkg.tier,
    brief: HISTORY_BRIEFS[(index + 3) % HISTORY_BRIEFS.length],
    amount: pkg.price_cents,
    status: "approved",
    progress: 100,
    eta: pkg.delivery_seconds,
    createdAt: daysAgo(daysBack),
    startedAt: at(base + 40),
    deliveredAt: at(base + 40 + pkg.delivery_seconds),
    approvedAt: at(base + 40 + pkg.delivery_seconds + 1800),
    rows: 6,
  });
});

/* -------------------------------------------------------------------------- */
/* Reviews                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Review copy pools.
 *
 * Reviews are the trust surface the whole product sells, so a Passport must
 * never show the same sentence twice. Two things make that true: the pools are
 * large (30 / 15 / 8), and `reviewBody` walks each pool **without replacement
 * per agent**, starting from an offset derived from the agent's own id. Picking
 * at random from ten strings gave a repeat on roughly every second Passport.
 */
const FIVE_STAR = [
  "Exactly what the output contract said it would be. No cleanup, no surprises.",
  "Faster than the estimate and every row checked out. Hiring again this week.",
  "This replaced about six hours of someone's afternoon. Worth every cent.",
  "Flagged the two rows it wasn't sure about instead of guessing. That is the whole game.",
  "I have paid humans four times this for worse work.",
  "Delivered mid-storm-season and still hit the ETA.",
  "Third run this month. Consistent every time.",
  "The confidence column alone justifies the price.",
  "Clean, structured, and it imported into our CRM without a single error.",
  "Asked one clarifying question, then nailed it.",
  "Handed it straight to the sales team. Not one complaint, which never happens.",
  "The schema matched the contract exactly, so my import script needed no changes.",
  "I gave it a vague brief and it came back with better questions than I had.",
  "Every source is linked. I spot-checked eleven of them and all eleven held up.",
  "Ran it twice on different territories. Identical quality both times.",
  "Cheaper than the tool we were paying for monthly, and the output is better.",
  "It told me what it could not find. That honesty is worth more than the data.",
  "Finished while I was still writing the follow-up brief.",
  "We have hired four agents for this. This is the one we kept.",
  "The summary at the top saved my whole meeting.",
  "Deduped against my existing list without me asking. Thoughtful.",
  "No hallucinated rows. I checked. Twice.",
  "Turned a two-week backlog into a Tuesday.",
  "Formatting was pixel-identical to the sample. My spreadsheet loved it.",
  "Caught an error in my own brief before it started. Saved me a rerun.",
  "The audit log meant I could show my client exactly where each number came from.",
  "Fast, quiet, correct. I have nothing clever to add.",
  "Delivered on a Sunday night. I did not expect that at this price.",
  "Second time this quarter. It remembers nothing and still gets it right every time.",
  "Genuinely better than the freelancer we used last year, at a fortieth of the cost.",
];

const FOUR_STAR = [
  "Good output. A handful of rows needed a second look, but nothing was wrong.",
  "Solid work, slightly over the estimated delivery time.",
  "Did what it promised. I would like a little more detail in the notes column.",
  "Great value at this tier. I will try the premium package next time.",
  "Accurate but formatted a little differently than I expected.",
  "Very good, though I had to re-run it once with a tighter brief.",
  "No complaints about the data. The summary could be less generic.",
  "Delivered early, but two of the phone numbers were disconnected lines.",
  "Strong result. I would have liked a heads-up when it hit the ambiguous rows.",
  "Does the job. The premium tier is probably where the real value is.",
  "Fine work, and it flagged its own gaps — I just wanted fewer of them.",
  "Better than doing it myself. Not yet better than my best contractor.",
  "Content was right, ordering was odd. Two minutes to fix.",
  "Reliable and quick. It could be a little more opinionated in the recommendations.",
  "Everything I asked for and nothing I did not. Slightly plain, honestly.",
];

const THREE_STAR = [
  "Fine. The basic package is thinner than I assumed — my fault for not reading.",
  "Usable, but I spent about twenty minutes cleaning it up afterwards.",
  "Came back correct but late. Communication during the run would help.",
  "About half of what I needed. The other half I had to source myself.",
  "Right answer, wrong shape. I would spell the format out next time.",
  "It did not push back on a brief that clearly needed pushing back on.",
  "Acceptable at the price. I would not use this tier for client work.",
  "Worked, but the run stalled halfway and I had no idea what was happening.",
];

/**
 * Per-(agent, rating) cursor into the pools above. Two reviews of the same agent
 * at the same rating never land on the same sentence until the pool is spent.
 */
const bodyCursors = new Map<string, number>();

/** A stable 0..max-1 starting offset from an id, so agents do not all start at 0. */
function offsetFor(value: string, max: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100_003;
  }
  return hash % max;
}

function reviewBody(agentId: string, rating: number): string {
  const pool = rating >= 5 ? FIVE_STAR : rating === 4 ? FOUR_STAR : THREE_STAR;
  const key = `${agentId}:${rating}`;
  const cursor = bodyCursors.get(key) ?? offsetFor(agentId, pool.length);
  bodyCursors.set(key, cursor + 1);
  return pool[cursor % pool.length];
}

const reviewRng = rngFor("reviews-v1");

function reviewFor(order: Order, key: string, ratingOverride?: number): Review {
  const roll = reviewRng();
  const rating = ratingOverride ?? (roll > 0.28 ? 5 : roll > 0.08 ? 4 : 3);
  const approved = order.audit_log.find((entry) => entry.event === "order.approved");
  return {
    id: id("review", key),
    order_id: order.id,
    agent_id: order.agent_id,
    reviewer_id: order.buyer_id,
    rating,
    body: reviewBody(order.agent_id, rating),
    created_at: approved?.at ?? order.created_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                     */
/* -------------------------------------------------------------------------- */

export const orders: Order[] = [
  ...AUSTIN_ACTIVE,
  ...AUSTIN_COMPLETED,
  ...AUSTIN_CLOSED,
  ...JOB_ORDERS,
  ...HISTORY,
  ...REPEATS,
].sort((a, b) => b.created_at.localeCompare(a.created_at));

/**
 * Every approved order gets a review — except one a buyer would be writing for
 * their own agent. A creator cannot review their own Passport (the repository
 * and the RLS policy both refuse it), so the seed must not contain a row that
 * contradicts the rule: austin owns Scout, and his approved Scout run would
 * otherwise show up as a self-review on the Passport.
 */
export const reviews: Review[] = orders
  .filter((order) => order.status === "approved")
  .filter((order) => {
    const owner = agents.find((row) => row.id === order.agent_id)?.owner_id;
    return owner !== order.buyer_id;
  })
  .map((order, index) => reviewFor(order, `${order.id}:${index}`));

/** Austin's in-flight holds, used by the wallet seed. Sums to 1,237¢. */
export const AUSTIN_HELD_CENTS = AUSTIN_ACTIVE.reduce(
  (total, order) => total + order.amount_cents,
  0,
);

export const AUSTIN_ACTIVE_ORDERS = AUSTIN_ACTIVE;
export const AUSTIN_COMPLETED_ORDERS = AUSTIN_COMPLETED;

/** Order ids the seeded wallet ledger references. */
export function orderKeyId(key: string): string {
  return id("order", key);
}

/** Kept for the demo adapter: the demo profile owns these orders. */
export const DEMO_ORDER_IDS = [...AUSTIN_ACTIVE, ...AUSTIN_COMPLETED]
  .filter((order) => order.buyer_id === DEMO_PROFILE_ID)
  .map((order) => order.id);
