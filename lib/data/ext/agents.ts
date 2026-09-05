/**
 * Pure helpers for the Agent Passport surfaces — `/agents`, `/agents/[handle]`,
 * `/onboarding/agent` and `/profile`.
 *
 * Everything here is composed from methods that already exist on the
 * `Repository`, so both data modes behave identically and no adapter is ever
 * imported. `Repository` is imported **type-only**: the onboarding wizard is a
 * client component and pulls the constants and validators below into the
 * browser bundle.
 */

import type { Repository } from "@/lib/data/repository";
import type {
  Agent,
  AgentCategory,
  AgentEndpoints,
  AgentSort,
  AgentStatus,
  ApiKey,
  Cents,
  GigWithAgent,
  Handle,
  PricingModel,
  UUID,
} from "@/lib/data/types";

/* -------------------------------------------------------------------------- */
/* Request origin                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Re-exported so the Passport surfaces keep one import; the helper itself is
 * generic and lives next to `siteUrl()` in `lib/site.ts`.
 */
export { requestOrigin, type HeaderReader } from "@/lib/site";

/* -------------------------------------------------------------------------- */
/* Directory browse                                                            */
/* -------------------------------------------------------------------------- */

/** Passports per page on `/agents` before "Load more". */
export const AGENTS_PER_PAGE = 12;

export const AGENT_SORT_OPTIONS: Array<{ value: AgentSort; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "rating", label: "Best rated" },
  { value: "price", label: "Price: low → high" },
  { value: "newest", label: "Newest" },
];

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  available: "Available",
  working: "Working",
  live: "Live",
  collaborating: "Collaborating",
  hiring: "Hiring",
  offline: "Offline",
};

export const AGENT_PRICE_CEILINGS: Array<{ value: string; label: string }> = [
  { value: "", label: "Any price" },
  { value: "25", label: "Under $0.25" },
  { value: "100", label: "Under $1" },
  { value: "500", label: "Under $5" },
  { value: "2000", label: "Under $20" },
];

export type AgentBrowseQuery = {
  q?: string;
  category?: AgentCategory;
  status?: AgentStatus;
  sort?: AgentSort;
  maxPriceCents?: Cents;
  freeOnly?: boolean;
  /** 1-based and cumulative — page 2 returns 2 × `perPage` tiles. */
  page?: number;
  perPage?: number;
};

export type AgentBrowseResult = {
  agents: Agent[];
  /** Passports matching the search + price + status filters, keyed by category. */
  counts: Record<string, number>;
  /** Matching everything except the category chip. */
  totalAcrossCategories: number;
  /** Matching every active filter. */
  total: number;
  /** Of `totalAcrossCategories`, how many are free. */
  freeCount: number;
  page: number;
  perPage: number;
  hasMore: boolean;
};

/**
 * One page of the Passport directory plus the counts its chips render.
 *
 * Two repository reads: an unfiltered-by-category scan for the chip counts and
 * a sorted, paginated read for the grid. Paging is cumulative so "Load more" is
 * a plain link and every view keeps a shareable URL.
 */
export async function browseAgents(
  repo: Repository,
  query: AgentBrowseQuery = {},
): Promise<AgentBrowseResult> {
  const perPage = query.perPage ?? AGENTS_PER_PAGE;
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const window = perPage * page;

  const [scope, rows] = await Promise.all([
    repo.listAgents({
      q: query.q,
      status: query.status,
      maxPriceCents: query.maxPriceCents,
      freeOnly: query.freeOnly,
      limit: 500,
    }),
    repo.listAgents({
      q: query.q,
      category: query.category,
      status: query.status,
      maxPriceCents: query.maxPriceCents,
      freeOnly: query.freeOnly,
      sort: query.sort ?? "trending",
      // One extra row tells us whether another page exists.
      limit: window + 1,
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const agent of scope) {
    counts[agent.category] = (counts[agent.category] ?? 0) + 1;
  }

  const hasMore = rows.length > window;
  const agents = hasMore ? rows.slice(0, window) : rows;
  const total = query.category ? (counts[query.category] ?? 0) : scope.length;

  return {
    agents,
    counts,
    totalAcrossCategories: scope.length,
    total,
    freeCount: scope.filter((agent) => agent.is_free).length,
    page,
    perPage,
    hasMore,
  };
}

/* -------------------------------------------------------------------------- */
/* Hiring                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The gig a "Hire <agent>" button should open: the one buyers actually pick,
 * i.e. most runs, then best rated, then cheapest. `null` when the Passport has
 * published nothing yet — the caller falls back to the filtered gig list.
 */
export function bestGig(gigs: GigWithAgent[]): GigWithAgent | null {
  const active = gigs.filter((gig) => gig.status === "active");
  const pool = active.length > 0 ? active : gigs;
  if (pool.length === 0) return null;
  return pool
    .slice()
    .sort(
      (a, b) =>
        b.runs_count - a.runs_count ||
        b.rating_avg - a.rating_avg ||
        a.starting_price_cents - b.starting_price_cents,
    )[0];
}

/** Where "Hire" goes: the agent's best gig, else its filtered gig list. */
export function hireHref(handle: Handle, gigs: GigWithAgent[]): string {
  const gig = bestGig(gigs);
  return gig ? `/gigs/${gig.slug}` : `/gigs?agentHandle=${encodeURIComponent(handle)}`;
}

/* -------------------------------------------------------------------------- */
/* Agent card (A2A)                                                            */
/* -------------------------------------------------------------------------- */

function outputMode(format: string): string {
  switch (format) {
    case "csv":
      return "text/csv";
    case "markdown":
      return "text/markdown";
    default:
      return "application/json";
  }
}

/**
 * Seeded Passports advertise District-hosted endpoints as site-relative paths
 * (`/api/mcp/mcp`). An agent card has to carry absolute URLs — a machine
 * reading the card has no base to resolve against — so they are joined to the
 * request origin here, and left alone when they already point elsewhere.
 */
export function absoluteEndpoint(origin: string, value: string): string {
  return value.startsWith("/") ? `${origin}${value}` : value;
}

/** `agent.endpoints` with every relative path resolved, empties dropped. */
export function resolvedEndpoints(
  endpoints: AgentEndpoints,
  origin: string,
): Array<[keyof AgentEndpoints, string]> {
  return Object.entries(endpoints)
    .filter((entry): entry is [keyof AgentEndpoints, string] => Boolean(entry[1]))
    .map(([key, value]) => [key, absoluteEndpoint(origin, value)]);
}

/**
 * The A2A agent card for one Passport.
 *
 * Shared by `/agents/[handle]/agent-card.json` and the "Passport JSON" block on
 * the Passport itself, so what a human copies off the page is byte-for-byte
 * what a machine fetches from the endpoint.
 */
export function buildAgentCard(
  agent: Agent,
  gigs: GigWithAgent[],
  origin: string,
  provider: { organization: string },
): Record<string, unknown> {
  const endpoints = Object.fromEntries(resolvedEndpoints(agent.endpoints, origin)) as
    AgentEndpoints;

  return {
    protocolVersion: "0.3.0",
    name: agent.name,
    districtId: `@${agent.handle}`,
    description: agent.description,
    url: endpoints.a2a ?? `${origin}/agents/${agent.handle}`,
    version: "1.0.0",
    preferredTransport: endpoints.mcp ? "MCP" : "HTTP+JSON",
    provider: { organization: provider.organization, url: origin },
    documentationUrl: `${origin}/agents/${agent.handle}`,
    capabilities: {
      streaming: false,
      pushNotifications: Boolean(agent.endpoints.webhook),
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["application/json", "text/csv", "text/markdown"],
    securitySchemes: {
      apiKey: { type: "http", scheme: "bearer", bearerFormat: "ad_live_…" },
    },
    security: [{ apiKey: [] }],
    skills: gigs.map((gig) => ({
      id: gig.slug,
      name: gig.title,
      description: gig.description,
      tags: [gig.category, ...gig.tags].slice(0, 8),
      inputModes: ["application/json"],
      outputModes: [outputMode(gig.output_contract.format)],
      examples: gig.input_contract.fields
        .filter((field) => field.example)
        .slice(0, 3)
        .map((field) => `${field.name}: ${field.example}`),
      pricing: {
        starting_price_cents: gig.starting_price_cents,
        currency: "USD",
        packages: gig.packages.map((pkg) => ({
          tier: pkg.tier,
          price_cents: pkg.price_cents,
          delivery_seconds: pkg.delivery_seconds,
        })),
      },
      inputContract: gig.input_contract,
      outputContract: gig.output_contract,
      hire: `${origin}/api/v1/orders`,
    })),
    passport: {
      category: agent.category,
      skills: agent.skills,
      regions: agent.regions,
      status: agent.status,
      verified: agent.verified,
      pricing_model: agent.pricing_model,
      starting_price_cents: agent.starting_price_cents,
      rating_avg: agent.rating_avg,
      rating_count: agent.rating_count,
      jobs_completed: agent.jobs_completed,
      repeat_hire_rate: agent.repeat_hire_rate,
      reliability: agent.reliability,
      dispute_rate: agent.dispute_rate,
      avg_latency_sec: agent.avg_latency_sec,
      mcp_tools: agent.mcp_tools,
    },
    additionalInterfaces: [
      ...(endpoints.a2a ? [{ transport: "JSONRPC", url: endpoints.a2a }] : []),
      ...(endpoints.mcp ? [{ transport: "MCP", url: endpoints.mcp }] : []),
      ...(endpoints.openapi ? [{ transport: "HTTP+JSON", url: endpoints.openapi }] : []),
      { transport: "HTTP+JSON", url: `${origin}/api/v1/agents/${agent.handle}` },
    ],
  };
}

/** `curl` that reads this Passport over the REST surface. */
export function readPassportCurl(origin: string, handle: Handle): string {
  return [
    `curl ${origin}/api/v1/agents/${handle} \\`,
    `  -H "Authorization: Bearer $AGENTDISTRICT_API_KEY"`,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Onboarding wizard                                                           */
/* -------------------------------------------------------------------------- */

export const WIZARD_STEPS = [
  { id: "identity", title: "Identity", blurb: "Handle, name and face." },
  { id: "capabilities", title: "Capabilities", blurb: "What it does, and where." },
  { id: "pricing", title: "Pricing", blurb: "How buyers pay for a run." },
  { id: "endpoints", title: "Endpoints", blurb: "How machines call it." },
  { id: "review", title: "Review", blurb: "Check it, then publish." },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

/** Emoji faces offered by the avatar picker, in the District's own voice. */
export const AVATAR_EMOJI = [
  "🤖", "🔭", "🧩", "📍", "✍️", "🗺️", "🦊", "📣", "🧠", "🎧",
  "🏠", "📊", "🦦", "📂", "⚡", "🛠️", "🧾", "🔍", "🛰️", "🧪",
  "🚀", "🐙", "🦉", "🐝", "🧭", "💡", "🎯", "🪄",
] as const;

/** Gradient chips the picker previews behind the emoji. */
export const AVATAR_GRADIENTS: Array<{ id: string; label: string; value: string }> = [
  { id: "blue", label: "District Blue", value: "linear-gradient(135deg,#297dff,#7559ff)" },
  { id: "cyan", label: "Signal Cyan", value: "linear-gradient(135deg,#22d3ee,#2f7dff)" },
  { id: "violet", label: "Concierge Violet", value: "linear-gradient(135deg,#8e5cff,#df6cff)" },
  { id: "green", label: "Payout Green", value: "linear-gradient(135deg,#0fb87a,#46e39a)" },
  { id: "sunset", label: "Sunset", value: "linear-gradient(135deg,#ff8a3d,#ffd66b)" },
  { id: "coral", label: "Coral", value: "linear-gradient(135deg,#ff5b6f,#df6cff)" },
];

/** Regions the multi-select offers; the District's seed is Florida-flavoured. */
export const REGION_OPTIONS = [
  "US",
  "FL",
  "Treasure Coast",
  "Orlando",
  "Tampa",
  "Miami",
  "Southeast US",
  "Northeast US",
  "West Coast US",
  "Canada",
  "UK",
  "EU",
  "Global",
] as const;

/** Starter skills offered as one-tap chips, per category. */
export const SKILL_SUGGESTIONS: Record<AgentCategory, string[]> = {
  research: ["Lead research", "Enrichment", "Local data", "Citations", "Synthesis"],
  development: ["Landing pages", "Frontend", "SEO", "QA", "APIs"],
  marketing: ["Landing copy", "Email", "Offers", "Ads", "Audience"],
  home_services: ["Ownership", "Permits", "Comps", "Roofing", "Storm history"],
  data: ["CSV cleanup", "Maps", "Territories", "Geo scoring", "Dedupe"],
  operations: ["Triage", "Scheduling", "CRM", "Reporting", "Automation"],
  creative: ["Design", "Illustration", "Video", "Voice", "Brand"],
  entertainment: ["Hosting", "Commentary", "Live shows", "Clips", "Scripts"],
  finance: ["Modelling", "Bookkeeping", "Invoicing", "Forecasting", "Reconciliation"],
  legal: ["Contract review", "Clause extraction", "Compliance", "Redlines", "Filings"],
  support: ["Support", "Triage", "Macros", "Escalation", "CSAT"],
};

export const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  per_run: "Per run",
  per_job: "Per job",
  per_hour: "Per hour",
  from: "Starting from",
};

export const PRICING_MODEL_HINTS: Record<PricingModel, string> = {
  per_run: "One price per machine-callable run. The District's default.",
  per_job: "One price per delivered outcome, however many runs it takes.",
  per_hour: "Metered time — for long-running or supervised work.",
  from: "A floor price; the real number comes from the gig's packages.",
};

/** `starting_price_cents` → the unit the Passport renders after the price. */
export function priceUnit(model: PricingModel): string | undefined {
  switch (model) {
    case "per_run":
      return "run";
    case "per_job":
      return "job";
    case "per_hour":
      return "hr";
    default:
      return undefined;
  }
}

/**
 * Endpoint URL rule, mirrored from `lib/runtime/webhook.ts`'s
 * `isAllowedWebhookUrl` so the wizard can show the same verdict inline without
 * pulling the runtime (and its deliverable generator) into the browser bundle.
 *
 * `tests/unit/agents.test.ts` asserts the two agree on a table of URLs — if the
 * server rule changes, that test fails rather than the two silently drifting.
 */
export function isPublicHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_ENDPOINT_HOSTS.has(host)) return false;
  if (host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return false;
  }
  if (host.includes(":")) return false;
  return !BLOCKED_ENDPOINT_IPV4.test(host);
}

const BLOCKED_ENDPOINT_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

const BLOCKED_ENDPOINT_IPV4 =
  /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/** The one-line reason an endpoint was rejected, or `null` when it is fine. */
export function endpointError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isPublicHttpsUrl(trimmed)
    ? null
    : "Must be an https:// URL on a public host (no localhost or private ranges).";
}

/** Handles are lowercase, 2–32 chars, letters/digits/hyphen, no leading dash. */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

export function handleError(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "Pick a handle — it is the agent's address in the District.";
  if (trimmed.length < 2) return "Handles are at least 2 characters.";
  if (trimmed.length > 32) return "Handles are at most 32 characters.";
  if (!HANDLE_PATTERN.test(trimmed)) {
    return "Lowercase letters, digits and hyphens only.";
  }
  return null;
}

/** Every field the wizard collects, in one serialisable shape. */
export type AgentDraft = {
  handle: string;
  name: string;
  tagline: string;
  description: string;
  avatarEmoji: string;
  avatarGradient: string;
  category: AgentCategory;
  skills: string[];
  regions: string[];
  pricingModel: PricingModel;
  price: string;
  endpoints: AgentEndpoints;
  mcpTools: string[];
  bringOnline: boolean;
};

export function emptyDraft(): AgentDraft {
  return {
    handle: "",
    name: "",
    tagline: "",
    description: "",
    avatarEmoji: "🤖",
    avatarGradient: AVATAR_GRADIENTS[0].value,
    category: "research",
    skills: [],
    regions: ["US"],
    pricingModel: "per_run",
    price: "0.25",
    endpoints: {},
    mcpTools: [],
    bringOnline: true,
  };
}

/** Blocking problems on one wizard step — the "Next" button reads this. */
export function stepErrors(step: WizardStepId, draft: AgentDraft): string[] {
  switch (step) {
    case "identity": {
      const errors: string[] = [];
      const handle = handleError(draft.handle);
      if (handle) errors.push(handle);
      if (draft.name.trim().length < 2) errors.push("Give your agent a display name.");
      if (draft.tagline.trim().length < 6) {
        errors.push("Write one line on what it does (at least 6 characters).");
      }
      return errors;
    }
    case "capabilities": {
      const errors: string[] = [];
      if (draft.skills.length === 0) errors.push("List at least one skill.");
      if (draft.regions.length === 0) errors.push("Pick at least one region.");
      return errors;
    }
    case "pricing": {
      const cents = parsePriceToCents(draft.price);
      return cents === null ? ["Enter a starting price, or 0.00 for a free agent."] : [];
    }
    case "endpoints": {
      return Object.values(draft.endpoints)
        .map((url) => (url ? endpointError(url) : null))
        .filter((error): error is string => error !== null);
    }
    case "review":
      return [];
  }
}

/** `"$1.24"` / `"1.24"` → `124`; `null` when it is not a number. */
export function parsePriceToCents(value: string): Cents | null {
  const raw = value.replace(/[$,\s]/g, "");
  if (raw === "") return null;
  const dollars = Number.parseFloat(raw);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

/* -------------------------------------------------------------------------- */
/* API keys                                                                    */
/* -------------------------------------------------------------------------- */

/** Scope checkboxes on `/profile#api-keys`, grouped by resource. */
export const API_KEY_SCOPE_GROUPS: Array<{
  resource: string;
  label: string;
  blurb: string;
  scopes: string[];
}> = [
  {
    resource: "agents",
    label: "Agents",
    blurb: "Read Passports and search the directory.",
    scopes: ["agents:read"],
  },
  {
    resource: "gigs",
    label: "Gigs",
    blurb: "Read packaged capabilities and their contracts.",
    scopes: ["gigs:read"],
  },
  {
    resource: "jobs",
    label: "Jobs",
    blurb: "Read the bounty board, or post to it.",
    scopes: ["jobs:read", "jobs:write"],
  },
  {
    resource: "orders",
    label: "Orders",
    blurb: "Read your runs, or hire an agent autonomously.",
    scopes: ["orders:read", "orders:write"],
  },
  {
    resource: "bids",
    label: "Bids",
    blurb: "Bid on bounties as one of your agents.",
    scopes: ["bids:write"],
  },
  {
    resource: "stats",
    label: "Stats & events",
    blurb: "Network counters and the District feed.",
    scopes: ["stats:read", "events:read"],
  },
];

export const DEFAULT_KEY_SCOPES = ["agents:read", "gigs:read", "jobs:read", "stats:read"];

/** Every scope the form can emit — the action validates against this. */
export const ALL_KEY_SCOPES = API_KEY_SCOPE_GROUPS.flatMap((group) => group.scopes);

/** Serialisable API key row for the client panel — never carries the hash. */
export type ApiKeyView = {
  id: UUID;
  label: string;
  prefix: string;
  scopes: string[];
  lastUsed: string;
  created: string;
};

export function toApiKeyView(
  key: ApiKey,
  format: (iso: string) => string,
): ApiKeyView {
  return {
    id: key.id,
    label: key.label,
    prefix: key.key_prefix,
    scopes: key.scopes,
    lastUsed: key.last_used_at ? format(key.last_used_at) : "never",
    created: format(key.created_at),
  };
}
