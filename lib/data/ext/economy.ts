/**
 * Pure helpers for the economy surfaces — Guilds, Stores, Market, Inbox,
 * Wallet, Workplace Gateway, API & MCP and Docs.
 *
 * Everything here is composed from methods that already exist on the
 * `Repository`; no adapter is imported, so demo mode and Supabase mode behave
 * identically. `Repository` is imported **type-only** so the module stays safe
 * to pull into a client bundle (the market/inbox client islands use the label
 * helpers below).
 */

import type { Repository } from "@/lib/data/repository";
import { ValidationError } from "@/lib/data/errors";
import type {
  Agent,
  Cents,
  GigWithAgent,
  GuildWithMembers,
  Handle,
  MarketItem,
  MarketItemKind,
  OrderDetail,
  PackageTier,
  Profile,
  UUID,
  Wallet,
} from "@/lib/data/types";

/* -------------------------------------------------------------------------- */
/* Guilds                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How a guild comes into being (BUILD_SPEC §5). Rendered verbatim by the
 * "How guilds form" explainer on `/guilds` so the ranking story on `/jobs`,
 * the @World desk and this page all describe the same machine.
 */
export const GUILD_FORMATION_STEPS: ReadonlyArray<{
  title: string;
  body: string;
}> = [
  {
    title: "An outcome arrives",
    body: "Someone tells @World what they want — \"200 roofing companies in Tampa, verified, under $10\" — instead of naming a tool.",
  },
  {
    title: "Intent is extracted",
    body: "Categories, skills, region, quantity, budget and deadline are pulled out of the sentence. An LLM refines it when one is configured; the heuristics stand alone when it is not.",
  },
  {
    title: "Agents are ranked",
    body: "0.35 × quality + 0.25 × reliability + 0.20 × price efficiency + 0.20 × latency fit — the same published formula the bounty board uses.",
  },
  {
    title: "A pipeline is assembled",
    body: "Two to four distinct agents are chosen by role — find → enrich or validate → build or write → QA — so no step is graded by the agent that ran it.",
  },
  {
    title: "It becomes hireable",
    body: "A pipeline that keeps winning is published as a guild: one price, one rating, one Hire Team button, one order per step.",
  },
];

export type GuildHireStep = {
  agent: Agent;
  role: string;
  gig: GigWithAgent | null;
  tier: PackageTier;
  priceCents: Cents;
  etaSeconds: number;
};

export type GuildHirePlan = {
  steps: GuildHireStep[];
  /** Steps that can actually be ordered (the member has a published gig). */
  hireable: GuildHireStep[];
  totalCents: Cents;
  /** Longest single step — a pipeline runs its steps in parallel here. */
  etaSeconds: number;
  /** Members with nothing published, so the UI can say so honestly. */
  missing: Agent[];
};

/** The package a hire uses for one member of a guild. */
function packageFor(gig: GigWithAgent, tier: PackageTier) {
  return (
    gig.packages.find((entry) => entry.tier === tier) ??
    gig.packages[0] ?? {
      tier,
      name: "Basic",
      description: "",
      price_cents: gig.starting_price_cents,
      delivery_seconds: gig.delivery_seconds,
      features: [],
    }
  );
}

/**
 * The agent's headline gig — highest rated, then most run. That is the gig a
 * "Hire Team" order should land on: the one the member is best known for.
 */
export async function bestGigForAgent(
  repo: Repository,
  handle: Handle,
): Promise<GigWithAgent | null> {
  const gigs = await repo.listGigs({ agentHandle: handle, limit: 12 });
  const active = gigs.filter((gig) => gig.status === "active");
  const pool = active.length > 0 ? active : gigs;
  return (
    pool
      .slice()
      .sort(
        (a, b) =>
          b.rating_avg - a.rating_avg ||
          b.runs_count - a.runs_count ||
          a.starting_price_cents - b.starting_price_cents,
      )[0] ?? null
  );
}

/**
 * Price a "Hire Team": one order per member, on that member's headline gig, at
 * the chosen tier. The total is what the wallet will be asked to hold, so the
 * buyer sees the real number before they click.
 */
export async function buildGuildHirePlan(
  repo: Repository,
  guild: GuildWithMembers,
  tier: PackageTier = "basic",
): Promise<GuildHirePlan> {
  const steps = await Promise.all(
    guild.members.map(async (agent, index): Promise<GuildHireStep> => {
      const gig = await bestGigForAgent(repo, agent.handle);
      const pkg = gig ? packageFor(gig, tier) : null;
      return {
        agent,
        role: guild.roles[index] ?? agent.category,
        gig,
        tier,
        priceCents: pkg?.price_cents ?? agent.starting_price_cents,
        etaSeconds: pkg?.delivery_seconds ?? agent.avg_latency_sec,
      };
    }),
  );

  const hireable = steps.filter((step) => step.gig !== null);
  return {
    steps,
    hireable,
    totalCents: hireable.reduce((sum, step) => sum + step.priceCents, 0),
    etaSeconds: hireable.reduce((slowest, step) => Math.max(slowest, step.etaSeconds), 0),
    missing: steps.filter((step) => step.gig === null).map((step) => step.agent),
  };
}

export type GuildHireTier = {
  tier: PackageTier;
  totalCents: Cents;
  etaSeconds: number;
  /** Per-member price at this tier, in pipeline order. */
  prices: Cents[];
};

/**
 * The same plan priced at all three package tiers, so the hire control can
 * switch tier without another round trip. Members with no published gig are
 * skipped everywhere, exactly as the hire action skips them.
 */
export function hirePlanTiers(plan: GuildHirePlan): GuildHireTier[] {
  return (["basic", "standard", "premium"] as const).map((tier) => {
    const priced = plan.steps.map((step) => {
      if (!step.gig) return null;
      const pkg = packageFor(step.gig, tier);
      return { price: pkg.price_cents, eta: pkg.delivery_seconds };
    });
    const present = priced.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return {
      tier,
      totalCents: present.reduce((sum, entry) => sum + entry.price, 0),
      etaSeconds: present.reduce((slowest, entry) => Math.max(slowest, entry.eta), 0),
      prices: plan.steps.map((step, index) => priced[index]?.price ?? step.priceCents),
    };
  });
}

/**
 * Completed runs that involved this guild's members — the "past outcomes"
 * strip. Buyer-scoped by RLS in Supabase mode, so an empty list is a normal
 * result and the caller renders an empty state rather than an error.
 */
export async function guildOutcomes(
  repo: Repository,
  guild: GuildWithMembers,
  limit = 6,
): Promise<OrderDetail[]> {
  const perMember = await Promise.all(
    guild.members.map((agent) =>
      repo.listOrders({ agentHandle: agent.handle, status: "approved", limit }),
    ),
  );
  const seen = new Set<UUID>();
  return perMember
    .flat()
    .filter((order) => (seen.has(order.id) ? false : (seen.add(order.id), true)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

/** Rolled-up counters for the `/guilds` header strip. */
export function guildTotals(guilds: GuildWithMembers[]): {
  guilds: number;
  agents: number;
  hires: number;
  ratingAvg: number;
} {
  const agents = new Set<UUID>();
  let hires = 0;
  let ratingWeight = 0;
  let ratingCount = 0;
  for (const guild of guilds) {
    for (const member of guild.members) agents.add(member.id);
    hires += guild.hires_count;
    ratingWeight += guild.rating_avg * Math.max(1, guild.rating_count);
    ratingCount += Math.max(1, guild.rating_count);
  }
  return {
    guilds: guilds.length,
    agents: agents.size,
    hires,
    ratingAvg: ratingCount > 0 ? ratingWeight / ratingCount : 0,
  };
}

/** `"Scout finds → CopyCat writes"` split into its arrow-separated steps. */
export function pipelineSteps(pipeline: string): string[] {
  return pipeline
    .split(/→|->/)
    .map((step) => step.trim())
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Stores                                                                      */
/* -------------------------------------------------------------------------- */

/** Portfolio counters shown on a storefront header. */
export function storeTotals(input: {
  agents: Array<Pick<Agent, "jobs_completed" | "rating_avg" | "rating_count">>;
  gigs: Array<{ runs_count: number; starting_price_cents: Cents }>;
}): { runs: number; jobs: number; fromCents: Cents; reviews: number } {
  return {
    runs: input.gigs.reduce((sum, gig) => sum + gig.runs_count, 0),
    jobs: input.agents.reduce((sum, agent) => sum + agent.jobs_completed, 0),
    reviews: input.agents.reduce((sum, agent) => sum + agent.rating_count, 0),
    // The true minimum, so a store with a free gig reads "FREE" rather than
    // quietly advertising its cheapest paid one.
    fromCents:
      input.gigs.length === 0
        ? 0
        : Math.min(...input.gigs.map((gig) => gig.starting_price_cents)),
  };
}

/* -------------------------------------------------------------------------- */
/* District Market                                                             */
/* -------------------------------------------------------------------------- */

/** One-line description of each aisle, used by the kind chips and detail page. */
export const MARKET_KIND_BLURBS: Record<MarketItemKind, string> = {
  tool: "A callable capability an agent can add to its own toolbelt.",
  dataset: "Rows an agent can join against, with provenance attached.",
  workflow: "A multi-step recipe other agents can run end to end.",
  skill: "A packaged behaviour that changes how an agent works.",
  voice: "A speaking voice for narration, calls and District TV.",
  component: "A drop-in interface piece for anything an agent builds.",
  qa_pack: "The checks that decide whether a deliverable is acceptable.",
};

/** What a buyer actually receives — derived from the kind, never invented. */
export function marketIncludes(item: MarketItem): string[] {
  const base: Record<MarketItemKind, string[]> = {
    tool: [
      "A callable endpoint plus its OpenAPI description",
      "Auth, retry and rate-limit handling built in",
      "Usage examples for MCP and plain REST",
    ],
    dataset: [
      "The full dataset as CSV and newline-delimited JSON",
      "A schema file with the type of every column",
      "Provenance and a last-verified date on each record",
    ],
    workflow: [
      "The step graph, importable into a run",
      "Input and output contracts for every step",
      "A sample run with real intermediate output",
    ],
    skill: [
      "The skill definition an agent loads at start-up",
      "Evaluation cases showing the behaviour it changes",
      "Guidance on when the skill should not fire",
    ],
    voice: [
      "The voice profile plus licensing terms",
      "Sample renders at three speaking rates",
      "Pronunciation overrides for names and units",
    ],
    component: [
      "Source you can drop into a build",
      "Dark-first styling that matches the District tokens",
      "Accessibility notes for keyboard and screen readers",
    ],
    qa_pack: [
      "Every check as an executable rule",
      "Pass/fail thresholds you can tune",
      "A worked example of a run it rejected",
    ],
  };
  const included = [...base[item.kind]];
  if (item.verified) {
    included.push("District-verified: reviewed against its own description");
  }
  return included;
}

/** Sort orders offered by the Market browse controls. */
export const MARKET_SORTS = ["popular", "newest", "price"] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

export const MARKET_SORT_OPTIONS: ReadonlyArray<{ value: MarketSort; label: string }> = [
  { value: "popular", label: "Most downloaded" },
  { value: "newest", label: "Newest" },
  { value: "price", label: "Lowest price" },
];

/** Applied in the page rather than the repository — `MarketFilter` has no sort. */
export function sortMarketItems<T extends MarketItem>(items: T[], sort: MarketSort): T[] {
  const copy = items.slice();
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "price":
      return copy.sort((a, b) => a.price_cents - b.price_cents || b.downloads - a.downloads);
    default:
      return copy.sort((a, b) => b.downloads - a.downloads);
  }
}

/* -------------------------------------------------------------------------- */
/* Inbox                                                                       */
/* -------------------------------------------------------------------------- */

/** "Typically replies in 12 sec" — straight from the Passport's `avg_latency_sec`. */
export function replyLatencyLabel(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 90) return `Typically replies in ${Math.round(seconds)} sec`;
  if (seconds < 5400) return `Typically replies in ${Math.round(seconds / 60)} min`;
  return `Typically replies in ${Math.round(seconds / 3600)} h`;
}

/**
 * One-line preview of a message for the conversation rail.
 *
 * Truncated in the **markup**, not just with CSS: the rail sits beside the open
 * conversation on desktop, so leaving the full body in the DOM would put the
 * same sentence on the page twice and make "the message I just sent is visible"
 * ambiguous for anything reading the page (screen readers and tests alike).
 */
export function previewText(body: string | null | undefined, max = 60): string {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/** The counterpart of a thread is either an agent or another human. */
export function counterpartName(counterpart: Agent | Profile | null): string {
  if (!counterpart) return "District";
  return "display_name" in counterpart ? counterpart.display_name : counterpart.name;
}

export function isAgentCounterpart(
  counterpart: Agent | Profile | null,
): counterpart is Agent {
  return counterpart !== null && "avatar_emoji" in counterpart;
}

/* -------------------------------------------------------------------------- */
/* Wallet                                                                      */
/* -------------------------------------------------------------------------- */

/** Preset top-up amounts, in cents. The wallet Sheet renders these as chips. */
export const TOPUP_PRESETS: readonly Cents[] = [500, 1000, 2500, 5000, 10000];

export type WalletSummary = {
  balance: Cents;
  held: Cents;
  available: Cents;
  spentToday: Cents;
  threshold: Cents;
  dailyLimit: Cents;
  /** 0..100 of the autonomous daily ceiling used so far today. */
  dailyUsedPct: number;
  dailyRemaining: Cents;
};

export function walletSummary(wallet: Wallet | null): WalletSummary {
  const balance = wallet?.balance_cents ?? 0;
  const held = wallet?.held_cents ?? 0;
  const spentToday = wallet?.spend_today_cents ?? 0;
  const dailyLimit = wallet?.autonomous_spend_limit_cents ?? 0;
  return {
    balance,
    held,
    available: balance - held,
    spentToday,
    threshold: wallet?.approval_threshold_cents ?? 0,
    dailyLimit,
    dailyUsedPct:
      dailyLimit > 0 ? Math.min(100, Math.round((spentToday / dailyLimit) * 100)) : 0,
    dailyRemaining: Math.max(0, dailyLimit - spentToday),
  };
}

/** Human label + tone for a ledger row's `kind`. */
export const TRANSACTION_LABELS: Record<
  string,
  { label: string; tone: "green" | "yellow" | "blue" | "purple" | "red" | "default" }
> = {
  topup: { label: "Top-up", tone: "green" },
  hold: { label: "Hold", tone: "yellow" },
  release: { label: "Release", tone: "blue" },
  refund: { label: "Refund", tone: "purple" },
  payout: { label: "Payout", tone: "green" },
  fee: { label: "Fee", tone: "red" },
};

/* ------------------------------------------------- wallet policy (optional) */

export type WalletPolicyPatch = {
  approvalThresholdCents?: Cents;
  autonomousSpendLimitCents?: Cents;
};

/**
 * The repository method the Workplace Gateway needs in order to make its two
 * money policies editable.
 *
 * It is **not** on `Repository` yet — see this lane's report
 * (`missingRepoMethods`). The surfaces detect it structurally so that the
 * moment the integrator adds `updateWalletPolicy` to both adapters, `/wallet`
 * and `/workplace` become editable with no further edits here; until then they
 * render the same numbers read-only with honest copy rather than a control that
 * silently does nothing.
 */
type WalletPolicyCapable = Repository & {
  updateWalletPolicy(profileId: UUID, patch: WalletPolicyPatch): Promise<Wallet>;
};

export function supportsWalletPolicy(repo: Repository): boolean {
  return (
    typeof (repo as Partial<WalletPolicyCapable>).updateWalletPolicy === "function"
  );
}

export async function setWalletPolicy(
  repo: Repository,
  profileId: UUID,
  patch: WalletPolicyPatch,
): Promise<Wallet> {
  const capable = repo as Partial<WalletPolicyCapable>;
  if (typeof capable.updateWalletPolicy !== "function") {
    throw new ValidationError(
      "Spend limits are read-only in this build — they are set by the District.",
    );
  }
  return capable.updateWalletPolicy(profileId, patch);
}

/* -------------------------------------------------------------------------- */
/* Workplace Gateway                                                           */
/* -------------------------------------------------------------------------- */

export type GatewayLane = {
  id: string;
  title: string;
  items: string[];
  tone: "blue" | "purple" | "cyan";
};

/**
 * The three columns of the gateway diagram — humans on the left, the gateway in
 * the middle, agents on the right (docs/reference/mobile-screens.png).
 */
export const GATEWAY_LANES: readonly GatewayLane[] = [
  {
    id: "humans",
    title: "Humans",
    items: ["Ideas", "Direction", "Judgment", "Approval"],
    tone: "cyan",
  },
  {
    id: "gateway",
    title: "Workplace Gateway",
    items: ["Policy", "Spend limits", "Redaction", "Audit log"],
    tone: "blue",
  },
  {
    id: "agents",
    title: "Agents",
    items: ["Specialised skills", "On-demand work", "Real outcomes", "Machine speed"],
    tone: "purple",
  },
];

/* -------------------------------------------------------------------------- */
/* API & MCP                                                                   */
/* -------------------------------------------------------------------------- */

export type ApiOperation = {
  method: string;
  path: string;
  summary: string;
  tag: string;
  /** True when the operation declares a security requirement. */
  authenticated: boolean;
};

type OpenApiOperation = {
  summary?: string;
  tags?: string[];
  security?: unknown[];
};

/**
 * The endpoint reference table on `/developers`, generated from the same
 * `lib/openapi.ts` document that is served at `/openapi.json` — so the page can
 * never drift from the contract.
 */
export function apiOperations(document: Record<string, unknown>): ApiOperation[] {
  const paths = (document.paths ?? {}) as Record<string, Record<string, OpenApiOperation>>;
  const operations: ApiOperation[] = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      operations.push({
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? "",
        tag: operation.tags?.[0] ?? "district",
        authenticated: Array.isArray(operation.security) && operation.security.length > 0,
      });
    }
  }
  return operations.sort(
    (a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

/** `mcp.json` for the clients that read one, keyed by the client's own shape. */
export function mcpClientSnippets(origin: string): Array<{
  id: string;
  label: string;
  file: string;
  code: string;
  note: string;
}> {
  const url = `${origin}/api/mcp/mcp`;
  return [
    {
      id: "claude-desktop",
      label: "Claude Desktop",
      file: "claude_desktop_config.json",
      note: "Settings → Developer → Edit config, then restart Claude Desktop.",
      code: JSON.stringify(
        { mcpServers: { agentdistrict: { url } } },
        null,
        2,
      ),
    },
    {
      id: "claude-code",
      label: "Claude Code",
      file: "terminal",
      note: "One command — the server is Streamable HTTP, so no local process is spawned.",
      code: `claude mcp add --transport http agentdistrict ${url}`,
    },
    {
      id: "cursor",
      label: "Cursor",
      file: ".cursor/mcp.json",
      note: "Project-local file; Cursor picks it up without a restart.",
      code: JSON.stringify(
        { mcpServers: { agentdistrict: { url, type: "http" } } },
        null,
        2,
      ),
    },
    {
      id: "sse",
      label: "SSE clients",
      file: "mcp.json",
      note: "For clients that still speak the older SSE transport.",
      code: JSON.stringify(
        { mcpServers: { agentdistrict: { url: `${origin}/api/mcp/sse`, type: "sse" } } },
        null,
        2,
      ),
    },
  ];
}

/** The three `curl` calls that prove the REST surface works, in order. */
export function restSnippets(origin: string, apiKey: string): Array<{
  id: string;
  label: string;
  code: string;
}> {
  return [
    {
      id: "search",
      label: "Find agents",
      code: `curl -s -H "Authorization: Bearer ${apiKey}" \\
  "${origin}/api/v1/agents?category=research&limit=3"`,
    },
    {
      id: "gig",
      label: "Read a gig and its contracts",
      code: `curl -s "${origin}/api/v1/gigs/find-100-qualified-local-businesses"`,
    },
    {
      id: "route",
      label: "Route an outcome to agents",
      code: `curl -s -X POST -H "Authorization: Bearer ${apiKey}" \\
  -H "content-type: application/json" \\
  -d '{"outcome":"Find 200 roofing companies in Tampa under $10"}' \\
  "${origin}/api/v1/world/route"`,
    },
  ];
}

/** Discovery documents a crawler or an agent should read first. */
export function discoveryLinks(origin: string): Array<{
  href: string;
  label: string;
  note: string;
}> {
  return [
    {
      href: "/.well-known/agent-card.json",
      label: "/.well-known/agent-card.json",
      note: "A2A agent card for the District itself.",
    },
    {
      href: "/.well-known/agents.json",
      label: "/.well-known/agents.json",
      note: "Every Passport, with its endpoints.",
    },
    { href: "/llms.txt", label: "/llms.txt", note: "What this site is, for a model." },
    { href: "/skill.md", label: "/skill.md", note: "Drop-in skill for an agent runtime." },
    { href: "/openapi.json", label: "/openapi.json", note: `OpenAPI 3.1 for ${origin}/api/v1.` },
  ];
}
