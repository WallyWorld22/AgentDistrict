import type {
  Agent,
  ContractField,
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
import { intBetween, pick, rngFor, round, type Rng } from "./rng";
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
/* -------------------------------------------------------------------------- */

const FL_ADDRESSES = [
  "1234 Palm Dr, Orlando, FL 32801",
  "88 Seagrape Ln, Port St. Lucie, FL 34952",
  "4517 Bayshore Blvd, Tampa, FL 33611",
  "210 NE Ocean Blvd, Stuart, FL 34996",
  "9032 Sabal Palm Way, Kissimmee, FL 34747",
  "615 Indian River Dr, Fort Pierce, FL 34950",
  "77 Coquina Ct, Vero Beach, FL 32963",
  "3401 Curlew Rd, Palm Harbor, FL 34683",
  "1120 Hibiscus Ave, Melbourne, FL 32901",
  "560 Banyan Trail, Jupiter, FL 33458",
  "2295 Citrus Grove Rd, Winter Garden, FL 34787",
  "804 Mangrove Cir, Cape Coral, FL 33904",
];

const BUSINESSES = [
  "Castellano Roofing",
  "Sunstate Pool Service",
  "Blue Heron Gutters",
  "Treasure Coast HVAC",
  "Palmetto Home Solutions",
  "Riverbend Exteriors",
  "Coastal Comfort Air",
  "Gulfstream Plumbing",
  "Everglade Landscaping",
  "Lighthouse Electrical",
  "Ibis Pressure Washing",
  "Mariner Home Services",
];

const PEOPLE = [
  "Ray Castellano",
  "Denise Whitfield",
  "Marcus Ellery",
  "Priya Raman",
  "Tom Vasquez",
  "Ellen Brody",
  "Sam Okonjo",
  "Grace Lindqvist",
];

const PHRASES = [
  "Confirmed against county records",
  "Two sources agreed",
  "Owner-occupied, no rental flag",
  "Permit gap since 2019",
  "Website live, form working",
  "Listed hours match the phone greeting",
  "Flagged for manual review",
  "Matched on domain, not on name",
];

function phone(rng: Rng): string {
  const area = pick(rng, ["407", "772", "813", "321", "561", "941"]);
  return `+1${area}${intBetween(rng, 200, 989)}${intBetween(rng, 1000, 9999)}`;
}

function domain(rng: Rng, business: string): string {
  return `https://${business.toLowerCase().replace(/[^a-z]+/g, "")}.com`;
}

function isoDate(rng: Rng): string {
  const month = String(intBetween(rng, 1, 12)).padStart(2, "0");
  const day = String(intBetween(rng, 1, 28)).padStart(2, "0");
  return `2026-${month}-${day}`;
}

/** Plausible value for a contract field, chosen deterministically. */
function sampleValue(field: ContractField, rng: Rng): string | number {
  const name = field.name.toLowerCase();
  if (field.options && field.options.length > 0) return pick(rng, field.options);
  if (name.includes("address")) return pick(rng, FL_ADDRESSES);
  if (name.includes("business") || name.includes("company") || name.includes("competitor")) {
    return pick(rng, BUSINESSES);
  }
  if (name.includes("phone")) return phone(rng);
  if (name.includes("email")) {
    const business = pick(rng, BUSINESSES);
    return `office@${business.toLowerCase().replace(/[^a-z]+/g, "")}.com`;
  }
  if (name.includes("website") || name.includes("url") || name.includes("link")) {
    return domain(rng, pick(rng, BUSINESSES));
  }
  if (name.includes("owner") || name.includes("inspector") || name.includes("contractor")) {
    return pick(rng, PEOPLE);
  }
  if (name.includes("date") || name.includes("issued")) return isoDate(rng);
  if (name.includes("confidence") || name.includes("accuracy")) {
    return round(0.82 + rng() * 0.17, 3);
  }
  if (name.includes("score") || name.includes("priority")) return intBetween(rng, 41, 98);
  if (name.includes("age")) return intBetween(rng, 4, 27);
  if (name.includes("count") || name.includes("households") || name.includes("velocity")) {
    return intBetween(rng, 12, 4800);
  }
  if (name.includes("cents") || name.includes("amount")) return intBetween(rng, 1200, 480000);
  if (field.type === "number") return intBetween(rng, 1, 240);
  if (field.type === "boolean") return rng() > 0.75 ? "true" : "false";
  return pick(rng, PHRASES);
}

function tableRows(
  fields: ContractField[],
  count: number,
  rng: Rng,
): Array<Record<string, string | number>> {
  return Array.from({ length: count }, () => {
    const row: Record<string, string | number> = {};
    for (const field of fields) row[field.name] = sampleValue(field, rng);
    return row;
  });
}

/** Build a structured deliverable matching the gig's own output contract. */
function buildOutput(source: Gig, worker: Agent, rowCount: number, rng: Rng): OrderOutput {
  const contract = source.output_contract;
  const fields = contract.fields;
  const columns = fields.map((field) => field.name);

  switch (contract.format) {
    case "csv":
    case "table":
      return {
        format: contract.format,
        summary: `${contract.summary} ${rowCount} rows delivered by ${worker.name}.`,
        columns,
        rows: tableRows(fields, rowCount, rng),
      };
    case "markdown":
      return {
        format: "markdown",
        summary: contract.summary,
        markdown: [
          `# ${source.title.replace(/^I will /, "")}`,
          "",
          `Delivered by **${worker.name}** (@${worker.handle}) — simulated run.`,
          "",
          "## What was done",
          "",
          ...fields.map((field) => `- **${field.name}** — ${field.description}`),
          "",
          "## Notes",
          "",
          `${contract.summary} Every item below was produced against the gig's published output contract.`,
        ].join("\n"),
        files: [
          { path: "index.html", language: "html", bytes: 18422 },
          { path: "styles.css", language: "css", bytes: 6140 },
          { path: "schema.jsonld", language: "json", bytes: 2088 },
          { path: "README.md", language: "markdown", bytes: 1204 },
        ],
      };
    case "json": {
      const payload: Record<string, string | number> = {};
      for (const field of fields) payload[field.name] = sampleValue(field, rng);
      return {
        format: "json",
        summary: contract.summary,
        json: payload,
      };
    }
    case "links":
    default:
      return {
        format: "links",
        summary: contract.summary,
        links: fields.slice(0, 4).map((field, index) => ({
          label: field.name,
          href: `https://cdn.agentdistrict.example/${source.slug}/${index + 1}`,
        })),
      };
  }
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
  const rng = rngFor(`order:${init.key}`);
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
      finished && source ? buildOutput(source, worker, init.rows ?? 6, rng) : null,
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
    brief: "615 Indian River Dr, Fort Pierce. Full picture including comps and reroof signal.",
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

const HISTORY: Order[] = gigs.map((source, index) => {
  const buyer = BUYER_HANDLES[index % BUYER_HANDLES.length];
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

/** Six extra repeat orders on the most-hired gigs, for a denser review corpus. */
const REPEAT_GIG_SLUGS = [
  "find-100-qualified-local-businesses",
  "property-analysis-ownership-permits-comps",
  "full-qa-pass-with-repro-steps",
  "reroof-opportunity-scoring",
  "territories-heatmaps-route-priorities",
  "offer-landing-copy-and-three-emails",
];

const REPEATS: Order[] = REPEAT_GIG_SLUGS.map((slug, index) => {
  const source = gig(slug);
  const pkg = source.packages[(index + 1) % 3];
  const buyer = BUYER_HANDLES[(index * 3 + 4) % BUYER_HANDLES.length];
  const daysBack = 11 + index * 9;
  const base = -daysBack * 86400;
  return makeOrder({
    key: `repeat-${slug}`,
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
];

const FOUR_STAR = [
  "Good output. A handful of rows needed a second look, but nothing was wrong.",
  "Solid work, slightly over the estimated delivery time.",
  "Did what it promised. I would like a little more detail in the notes column.",
  "Great value at this tier. I will try the premium package next time.",
  "Accurate but formatted a little differently than I expected.",
  "Very good, though I had to re-run it once with a tighter brief.",
];

const THREE_STAR = [
  "Fine. The basic package is thinner than I assumed — my fault for not reading.",
  "Usable, but I spent about twenty minutes cleaning it up afterwards.",
  "Came back correct but late. Communication during the run would help.",
];

function reviewBody(rating: number, rng: Rng): string {
  if (rating >= 5) return pick(rng, FIVE_STAR);
  if (rating === 4) return pick(rng, FOUR_STAR);
  return pick(rng, THREE_STAR);
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
    body: reviewBody(rating, reviewRng),
    created_at: approved?.at ?? order.created_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                     */
/* -------------------------------------------------------------------------- */

export const orders: Order[] = [
  ...AUSTIN_ACTIVE,
  ...AUSTIN_COMPLETED,
  ...JOB_ORDERS,
  ...HISTORY,
  ...REPEATS,
].sort((a, b) => b.created_at.localeCompare(a.created_at));

/** Every approved order gets a review — 48 in total. */
export const reviews: Review[] = orders
  .filter((order) => order.status === "approved")
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
