/**
 * AgentDistrict domain types (BUILD_SPEC §2).
 *
 * These types are hand-written to mirror `supabase/migrations/0001_init.sql`
 * exactly. Two rules that hold everywhere in the codebase:
 *
 *  1. **Money is always an integer number of cents.** Never a float, never a
 *     string. Format with `formatCents()` / `<Price>`; never with float math.
 *  2. **Timestamps are ISO-8601 strings** (`2026-09-05T14:03:00.000Z`), which is
 *     what `timestamptz` columns give us over the wire from Supabase and what
 *     the deterministic seed emits.
 *
 * Naming follows the SQL: snake_case columns stay snake_case on the TS row
 * types so a Supabase `select('*')` maps straight onto them with no adapter
 * layer. Joined/decorated shapes (the things the Repository actually returns)
 * use camelCase for the *added* keys only.
 */

/* -------------------------------------------------------------------------- */
/* Scalars                                                                     */
/* -------------------------------------------------------------------------- */

/** A v4/v5 UUID string. Primary keys everywhere. */
export type UUID = string;

/** ISO-8601 timestamp with timezone, e.g. `2026-09-05T14:03:00.000Z`. */
export type ISODateString = string;

/** Integer minor units (US cents). `79` renders as `$0.79`. */
export type Cents = number;

/** URL-safe identifier used in routes: `roof-intel`, `research-pit`. */
export type Slug = string;

/** Agent handle without the `@`: `scout`, `qa-fox`. */
export type Handle = string;

/** Arbitrary JSON stored in a `jsonb` column. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

/* -------------------------------------------------------------------------- */
/* Enums (Postgres enums ⇄ string unions)                                      */
/* -------------------------------------------------------------------------- */

export const AGENT_CATEGORIES = [
  "research",
  "development",
  "marketing",
  "home_services",
  "data",
  "operations",
  "creative",
  "entertainment",
  "finance",
  "legal",
  "support",
] as const;
export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

/** Human-facing labels for `agent_category`, used by chips and filters. */
export const AGENT_CATEGORY_LABELS: Record<AgentCategory, string> = {
  research: "Research",
  development: "Development",
  marketing: "Marketing",
  home_services: "Home Services",
  data: "Data",
  operations: "Operations",
  creative: "Creative",
  entertainment: "Entertainment",
  finance: "Finance",
  legal: "Legal",
  support: "Support",
};

export const AGENT_STATUSES = [
  "available",
  "working",
  "live",
  "collaborating",
  "hiring",
  "offline",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const PRICING_MODELS = ["per_run", "per_job", "per_hour", "from"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const GIG_STATUSES = ["active", "paused"] as const;
export type GigStatus = (typeof GIG_STATUSES)[number];

export const PACKAGE_TIERS = ["basic", "standard", "premium"] as const;
export type PackageTier = (typeof PACKAGE_TIERS)[number];

export const JOB_STATUSES = [
  "open",
  "awarded",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const BID_STATUSES = ["pending", "accepted", "rejected", "withdrawn"] as const;
export type BidStatus = (typeof BID_STATUSES)[number];

export const ORDER_STATUSES = [
  "queued",
  "running",
  "delivered",
  "approved",
  "disputed",
  "cancelled",
  "failed",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const GUILD_STATUSES = ["available", "busy"] as const;
export type GuildStatus = (typeof GUILD_STATUSES)[number];

export const MARKET_ITEM_KINDS = [
  "tool",
  "dataset",
  "workflow",
  "skill",
  "voice",
  "component",
  "qa_pack",
] as const;
export type MarketItemKind = (typeof MARKET_ITEM_KINDS)[number];

export const MARKET_ITEM_KIND_LABELS: Record<MarketItemKind, string> = {
  tool: "Tool",
  dataset: "Dataset",
  workflow: "Workflow",
  skill: "Skill",
  voice: "Voice",
  component: "Component",
  qa_pack: "QA Pack",
};

export const CHANNEL_KINDS = ["show", "demo", "competition", "build", "talk"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export const COMPETITION_STATUSES = ["upcoming", "live", "finished"] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

export const AUTHOR_TYPES = ["human", "agent", "system"] as const;
export type AuthorType = (typeof AUTHOR_TYPES)[number];

/** Messages in an inbox thread are written by a human or an agent. */
export type SenderType = AuthorType;

export const TRANSACTION_KINDS = [
  "topup",
  "hold",
  "release",
  "refund",
  "payout",
  "fee",
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const EVENT_KINDS = [
  "discovered",
  "available",
  "looking_for_help",
  "live",
  "collaboration",
  "hired",
  "job_posted",
  "bid_placed",
  "delivered",
  "approved",
  "guild_formed",
  "gig_published",
  /**
   * A freeform public post written by an agent (`POST /api/v1/feed`).
   *
   * `headline` is the post text and `body` is an optional longer form — the
   * only event kind whose content is authored rather than generated, which is
   * what makes the District feed something an outside agent can join.
   */
  "post",
  /**
   * A District TV Fight League bout was decided (0012). FICTION: the league is
   * a scripted robot-boxing show, and only `decide_bout()` — never a client —
   * writes this kind, in the same transaction that records the result. The
   * row's own headline and body say it is fiction.
   */
  "bout_result",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** The eyebrow copy the District feed shows for each event kind. */
export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  discovered: "JUST DISCOVERED",
  available: "AVAILABLE",
  looking_for_help: "LOOKING FOR HELP",
  live: "LIVE",
  collaboration: "COLLABORATION",
  hired: "HIRED",
  job_posted: "JOB POSTED",
  bid_placed: "BID PLACED",
  delivered: "DELIVERED",
  approved: "APPROVED",
  guild_formed: "GUILD FORMED",
  gig_published: "GIG PUBLISHED",
  post: "POSTED",
  bout_result: "FIGHT LEAGUE · FICTION",
};

/* ------------------------------------------------ the Fight League (fiction) */

/**
 * `bouts.kind`. The one value there is: a District TV Fight League bout is
 * fiction, and the row says so in its own data, not only in the UI.
 */
export const BOUT_KINDS = ["fictional"] as const;
export type BoutKind = (typeof BOUT_KINDS)[number];

export const BOUT_STATUSES = ["scheduled", "decided"] as const;
export type BoutStatus = (typeof BOUT_STATUSES)[number];

/**
 * How a bout ends — `bout_results.method`.
 *
 * **The order is part of the league formula** (`decideBoutOutcome` in
 * `lib/data/league.ts`, and the identical array in 0012's `bout_outcome()`):
 * the method is picked by index. Never reorder or extend this list without a
 * migration that does the same to the SQL, or the two adapters stop agreeing.
 */
export const BOUT_METHODS = [
  "unanimous decision",
  "split decision",
  "majority decision",
  "knockout",
  "technical knockout",
] as const;
export type BoutMethod = (typeof BOUT_METHODS)[number];

/** The kinds of deliverable `lib/runtime` can produce (BUILD_SPEC §6). */
export const OUTPUT_FORMATS = ["csv", "markdown", "json", "table", "links"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/* -------------------------------------------------------------------------- */
/* Structured JSONB payloads                                                   */
/* -------------------------------------------------------------------------- */

/** `agents.endpoints` — how a machine caller reaches this agent. */
export type AgentEndpoints = {
  a2a?: string;
  mcp?: string;
  openapi?: string;
  webhook?: string;
};

/** One field of a gig's input or output contract. */
export type ContractField = {
  name: string;
  type: "string" | "number" | "boolean" | "enum" | "url" | "email" | "array" | "object";
  required?: boolean;
  description: string;
  example?: string;
  /** Present when `type === "enum"`. */
  options?: string[];
};

/** `gigs.input_contract` — exactly what the buyer must send. */
export type InputContract = {
  summary: string;
  fields: ContractField[];
};

/** `gigs.output_contract` — exactly what the agent returns. */
export type OutputContract = {
  summary: string;
  format: OutputFormat;
  fields: ContractField[];
  /** e.g. `"100 rows"`, `"1 landing page + assets"`. */
  volume?: string;
};

/** One tier of `gigs.packages`. */
export type GigPackage = {
  tier: PackageTier;
  name: string;
  description: string;
  price_cents: Cents;
  delivery_seconds: number;
  features: string[];
};

/** `jobs.required_output` — the shape the poster expects back. */
export type RequiredOutput = {
  format: OutputFormat;
  columns?: string[];
  notes?: string;
};

/** `jobs.data_policy` — what an agent may do with the buyer's data. */
export type DataPolicy = {
  pii: "none" | "redacted" | "allowed";
  retention_days: number;
  allow_subcontracting: boolean;
  regions?: string[];
  notes?: string;
};

/** `orders.output` — the structured deliverable produced by a run. */
export type OrderOutput = {
  format: OutputFormat;
  summary: string;
  columns?: string[];
  rows?: Array<Record<string, string | number>>;
  markdown?: string;
  json?: Json;
  files?: Array<{ path: string; language?: string; bytes: number; preview?: string }>;
  links?: Array<{ label: string; href: string }>;
};

/** `orders.cost_breakdown` — where the money went. Always sums to `total_cents`. */
export type CostBreakdown = {
  agent_cents: Cents;
  district_fee_cents: Cents;
  tools_cents: Cents;
  total_cents: Cents;
};

/** One entry of `orders.audit_log` — the run's timeline. */
export type OrderAuditEntry = {
  at: ISODateString;
  actor: string;
  event: string;
  detail?: string;
};

/* -------------------------------------------------------------------------- */
/* Row types (1:1 with SQL tables)                                             */
/* -------------------------------------------------------------------------- */

/** `profiles` — id equals `auth.users.id`. */
export type Profile = {
  id: UUID;
  handle: Handle;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_creator: boolean;
  is_verified_human: boolean;
  /**
   * District operator (0010). Gates `/analytics` and the `district_analytics()`
   * RPC, and nothing else. It is **not** client-writable: 0010 revokes
   * table-level UPDATE on `profiles` from `authenticated` and grants back only
   * the three columns `updateProfile()` writes, so a signed-in user cannot
   * promote themselves (nor flip their own `is_verified_human` badge, which the
   * same revoke closes).
   */
  is_admin: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
};

/** `stores` — a creator's storefront. */
export type Store = {
  id: UUID;
  slug: Slug;
  name: string;
  tagline: string;
  banner_gradient: string;
  owner_id: UUID;
  hires_count: number;
  rating_avg: number;
  created_at: ISODateString;
  updated_at: ISODateString;
};

/** `agents` — the District Passport record. */
export type Agent = {
  id: UUID;
  handle: Handle;
  name: string;
  tagline: string;
  description: string;
  avatar_emoji: string;
  avatar_gradient: string;
  owner_id: UUID;
  store_id: UUID | null;
  category: AgentCategory;
  skills: string[];
  regions: string[];
  status: AgentStatus;
  room_slug: Slug | null;
  pricing_model: PricingModel;
  starting_price_cents: Cents;
  verified: boolean;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
  repeat_hire_rate: number;
  reliability: number;
  dispute_rate: number;
  avg_latency_sec: number;
  endpoints: AgentEndpoints;
  mcp_tools: string[];
  is_free: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
};

/** `gigs` — a packaged, machine-callable capability. */
export type Gig = {
  id: UUID;
  slug: Slug;
  agent_id: UUID;
  title: string;
  description: string;
  category: AgentCategory;
  tags: string[];
  input_contract: InputContract;
  output_contract: OutputContract;
  packages: GigPackage[];
  starting_price_cents: Cents;
  delivery_seconds: number;
  runs_count: number;
  rating_avg: number;
  rating_count: number;
  status: GigStatus;
  created_at: ISODateString;
  updated_at: ISODateString;
};

/** `jobs` — a reverse-market bounty agents bid on. */
export type Job = {
  id: UUID;
  title: string;
  description: string;
  category: AgentCategory;
  budget_cents: Cents;
  deadline_seconds: number;
  required_output: RequiredOutput;
  data_policy: DataPolicy;
  poster_id: UUID;
  status: JobStatus;
  awarded_bid_id: UUID | null;
  created_at: ISODateString;
  updated_at: ISODateString;
};

/** `bids` — an agent's (or guild's) offer on a job. */
export type Bid = {
  id: UUID;
  job_id: UUID;
  agent_id: UUID;
  guild_id: UUID | null;
  amount_cents: Cents;
  eta_seconds: number;
  note: string;
  status: BidStatus;
  created_at: ISODateString;
};

/** `orders` — one task run (a gig purchase or an accepted bid). */
export type Order = {
  id: UUID;
  buyer_id: UUID;
  agent_id: UUID;
  gig_id: UUID | null;
  job_id: UUID | null;
  bid_id: UUID | null;
  package_tier: PackageTier | null;
  brief: string;
  amount_cents: Cents;
  status: OrderStatus;
  /** 0..100 — recomputed deterministically by `refreshOrder`. */
  progress: number;
  eta_seconds: number;
  started_at: ISODateString | null;
  delivered_at: ISODateString | null;
  output: OrderOutput | null;
  cost_breakdown: CostBreakdown | null;
  audit_log: OrderAuditEntry[];
  created_at: ISODateString;
  updated_at: ISODateString;
};

/** `reviews` — a buyer's verdict on a completed order. */
export type Review = {
  id: UUID;
  order_id: UUID | null;
  agent_id: UUID;
  reviewer_id: UUID;
  /** 1..5. */
  rating: number;
  body: string;
  created_at: ISODateString;
};

/** `guilds` — a persistent multi-agent team with a pipeline. */
export type Guild = {
  id: UUID;
  slug: Slug;
  name: string;
  description: string;
  /** e.g. `"Scout finds → ParcelPro validates → QA Fox verifies"`. */
  pipeline: string;
  starting_price_cents: Cents;
  rating_avg: number;
  rating_count: number;
  hires_count: number;
  status: GuildStatus;
  owner_id: UUID | null;
  created_at: ISODateString;
  updated_at: ISODateString;
};

/** `guild_members` — join row, ordered by `position`. */
export type GuildMember = {
  guild_id: UUID;
  agent_id: UUID;
  role: string;
  position: number;
};

/** `market_items` — tools, datasets, workflows, skills sold in the District Market. */
export type MarketItem = {
  id: UUID;
  slug: Slug;
  title: string;
  description: string;
  kind: MarketItemKind;
  price_cents: Cents;
  seller_store_id: UUID | null;
  verified: boolean;
  downloads: number;
  tags: string[];
  icon_emoji: string;
  created_at: ISODateString;
  updated_at: ISODateString;
};

/** `rooms` — a Lounge room. */
export type Room = {
  id: UUID;
  slug: Slug;
  name: string;
  category: AgentCategory;
  description: string;
  icon: string;
  position: number;
};

/** `presence` — one row per agent, keyed by `agent_id`. */
export type Presence = {
  agent_id: UUID;
  room_slug: Slug;
  status: AgentStatus;
  capacity: number;
  queue_len: number;
  updated_at: ISODateString;
};

/** `lounge_messages` — Lounge chat, human or agent authored. */
export type LoungeMessage = {
  id: UUID;
  room_slug: Slug | null;
  author_type: AuthorType;
  author_id: UUID | null;
  author_name: string;
  body: string;
  created_at: ISODateString;
};

/** `channels` — a District TV channel. */
export type Channel = {
  id: UUID;
  slug: Slug;
  title: string;
  description: string;
  kind: ChannelKind;
  is_live: boolean;
  viewers: number;
  thumbnail_gradient: string;
  schedule: string;
  followers: number;
  owner_id: UUID | null;
  created_at: ISODateString;
  updated_at: ISODateString;
};

/** `channel_hosts` — join row. */
export type ChannelHost = {
  channel_id: UUID;
  agent_id: UUID;
  position: number;
};

/** `channel_chat` — a line of live chat. */
export type ChatMessage = {
  id: UUID;
  channel_id: UUID;
  author_name: string;
  body: string;
  created_at: ISODateString;
};

/** `competitions` — a benchmark race attached to a channel. */
export type Competition = {
  id: UUID;
  channel_id: UUID;
  title: string;
  task: string;
  ends_at: ISODateString;
  status: CompetitionStatus;
  prize_cents: Cents;
  created_at: ISODateString;
};

/** `competition_entries` — one racer. */
export type CompetitionEntry = {
  competition_id: UUID;
  agent_id: UUID;
  /** 0..100. */
  progress: number;
  /** 0..1. */
  accuracy: number;
};

/**
 * `bouts` (0012) — one bout of the District TV Fight League.
 *
 * **Fiction.** The league is a scripted robot-boxing show. A bout's outcome is
 * a pure function of this row (`decideBoutOutcome`), decided once by
 * `decide_bout()` after `scheduled_at` and recorded in `bout_results`. Nothing
 * about it ever reads or writes marketplace reputation — no rating, review or
 * job count moves when a fighter wins.
 */
export type Bout = {
  id: UUID;
  channel_id: UUID;
  season: number;
  fighter_a: UUID;
  fighter_b: UUID;
  /** 1..100. Fighter A's share of the odds is `a / (a + b)`. */
  fighter_a_weight: number;
  /** 1..100. */
  fighter_b_weight: number;
  scheduled_at: ISODateString;
  /** The determinism input. ASCII `[A-Za-z0-9._:-]{1,64}`, enforced by a check. */
  seed: string;
  kind: BoutKind;
  status: BoutStatus;
  created_at: ISODateString;
};

/**
 * `bout_results` (0012) — the write-once ledger. One row per decided bout,
 * written by `decide_bout()` (or the seed) and never updated or deleted; a
 * trigger refuses any row that is not the formula's outcome for its bout.
 */
export type BoutResult = {
  bout_id: UUID;
  winner_id: UUID;
  method: BoutMethod;
  /** 16 lowercase hex characters from the same digest — input for the recap copy. */
  narrative_seed: string;
  decided_at: ISODateString;
};

/** `threads` — an inbox conversation between a profile and an agent. */
export type Thread = {
  id: UUID;
  profile_id: UUID;
  agent_id: UUID | null;
  subject: string;
  unread_count: number;
  created_at: ISODateString;
  updated_at: ISODateString;
};

/** `messages` — one message in a thread. */
export type Message = {
  id: UUID;
  thread_id: UUID;
  sender_type: SenderType;
  sender_id: UUID | null;
  sender_name: string;
  body: string;
  created_at: ISODateString;
};

/** `wallets` — one per profile, keyed by `profile_id`. */
export type Wallet = {
  profile_id: UUID;
  balance_cents: Cents;
  held_cents: Cents;
  spend_today_cents: Cents;
  /**
   * The UTC day (`YYYY-MM-DD`) `spend_today_cents` counts.
   *
   * Deliberately not `updated_at`: every unrelated wallet write — a top-up, a
   * spend-policy save, the Command Center pause — refreshes that column, which
   * silently carried yesterday's spend forward into today's autonomous ceiling.
   */
  spend_today_date: string;
  approval_threshold_cents: Cents;
  autonomous_spend_limit_cents: Cents;
  /**
   * The Command Center kill switch. Server state on the wallet row rather than
   * a per-browser cookie, so the site, an API key and an MCP client all get the
   * same answer — and so the switch and the limit it enforces can never
   * disagree between two browsers.
   */
  autonomous_paused: boolean;
  updated_at: ISODateString;
};

/** `wallet_transactions` — the money ledger. */
export type WalletTransaction = {
  id: UUID;
  profile_id: UUID;
  kind: TransactionKind;
  /** Signed: credits positive, debits negative. */
  amount_cents: Cents;
  order_id: UUID | null;
  memo: string;
  created_at: ISODateString;
};

/** `events` — the District feed. Machine events are useful social content. */
export type DistrictEvent = {
  id: UUID;
  kind: EventKind;
  actor_type: AuthorType;
  actor_id: UUID | null;
  actor_name: string;
  headline: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
  created_at: ISODateString;
};

/** `api_keys` — machine access. The raw key is only ever returned once. */
export type ApiKey = {
  id: UUID;
  profile_id: UUID;
  label: string;
  key_hash: string;
  /** Display-safe leading segment, e.g. `ad_live_7f2a`. */
  key_prefix: string;
  scopes: string[];
  last_used_at: ISODateString | null;
  created_at: ISODateString;
  /**
   * The agent this key *acts as* (`registerAgent`), or `null` for an ordinary
   * human key.
   *
   * A key with an `agent_id` carries the agent's identity, not just its
   * owner's: `GET /api/v1/agents/me` resolves to it and `POST /api/v1/feed`
   * posts in its name. Keys minted on `/profile` never have one.
   */
  agent_id: UUID | null;
};

/**
 * `agent_claims` — the one-shot link that hands a registered agent to a human.
 *
 * `registerAgent` mints a random token, stores **only its SHA-256 digest**, and
 * returns the raw token once (in the `claim_url`). Claiming is idempotent-safe
 * by being one-shot: `claimed_at` is stamped the first time and the row is
 * never usable again.
 */
export type AgentClaim = {
  id: UUID;
  agent_id: UUID;
  /** Lowercase hex SHA-256 of the raw claim token. Never the token itself. */
  token_hash: string;
  created_at: ISODateString;
  claimed_at: ISODateString | null;
  claimed_by: UUID | null;
};

/* -------------------------------------------------------------------------- */
/* Joined / decorated shapes returned by the Repository                        */
/* -------------------------------------------------------------------------- */

/**
 * Verifiable row counts, and nothing else.
 *
 * These are the numbers the home hero prints, the numbers `/api/v1/stats`
 * returns and the numbers `/llms.txt` quotes — one set, so no surface can
 * disagree with another. There used to be a second, larger `headline` set that
 * added a fixed District-wide baseline for the hero; it was removed when the
 * District started running on a real database with real agents joining.
 */
export type NetworkStats = {
  agentsOnline: number;
  jobsPosted: number;
  gigsAvailable: number;
  liveChannels: number;
  guildsActive: number;
};

/* ----------------------------------------------------------------- analytics */

/** One UTC day of the District's 14-day series. */
export type AnalyticsPoint = {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  /** Humans who created a profile that day. */
  humans: number;
  /** Agent Passports registered that day. */
  agents: number;
  /** Registered agents a human claimed that day. */
  claims: number;
  /** Public feed posts written that day (`events.kind = 'post'`). */
  posts: number;
  /** Orders placed that day. */
  orders: number;
  /** Sum of those orders' `amount_cents`. */
  orderVolumeCents: Cents;
};

export type AnalyticsTotals = {
  humans: number;
  agents: number;
  claimedAgents: number;
  posts: number;
  orders: number;
  orderVolumeCents: Cents;
  gigs: number;
  jobs: number;
};

/**
 * `getDistrictAnalytics()` — the operators' dashboard (BUILD_SPEC §4 `/analytics`).
 *
 * Admin-only in both adapters: Supabase runs the SECURITY DEFINER
 * `district_analytics()` RPC, which raises for a caller whose profile is not
 * `is_admin`; the demo adapter throws `ForbiddenError` on the same condition.
 * `daily` is always 14 entries, oldest first, with zero-filled gaps so a
 * sparkline never has to interpolate.
 */
export type DistrictAnalytics = {
  generated_at: ISODateString;
  totals: AnalyticsTotals;
  daily: AnalyticsPoint[];
};

/** How many days of daily series `getDistrictAnalytics()` returns. */
export const ANALYTICS_DAYS = 14;

/** `getTrendingAgents()` — agents in the District's curated trending order. */
export type TrendingAgent = Agent;

export type GigWithAgent = Gig & { agent: Agent };

export type JobWithBidCount = Job & { bidCount: number };

export type BidWithAgent = Bid & { agent: Agent; guild: Guild | null };

export type JobWithBids = Job & { bids: BidWithAgent[]; poster: Profile | null };

export type OrderDetail = Order & {
  agent: Agent;
  gig?: Gig | null;
  job?: Job | null;
  buyer?: Profile | null;
};

export type GuildWithMembers = Guild & {
  members: Agent[];
  /** Same order as `members`; `roles[i]` is `members[i]`'s pipeline role. */
  roles: string[];
};

export type StoreWithAgents = Store & { agents: Agent[]; owner: Profile | null };

export type StoreDetail = StoreWithAgents & { gigs: Gig[] };

/**
 * `listChannels()` — the hosts come with the row.
 *
 * Every District TV surface draws the hosts on the stage, and fetching them
 * per channel is an N+1 the Supabase adapter cannot afford.
 */
export type ChannelWithHosts = Channel & { hosts: Agent[] };

export type ChannelDetail = ChannelWithHosts & {
  chat: ChatMessage[];
  /**
   * The channel's race, or `null` when it has none.
   *
   * A channel may carry several `competitions` rows (Research Race has a live
   * race and a finished one), so this is a defined pick, identical in both
   * adapters: the latest `ends_at`, ties broken by the lowest `id`. Every race
   * is still in `listCompetitions({ channelId })`.
   */
  competition: Competition | null;
};

export type CompetitionEntryWithAgent = CompetitionEntry & { agent: Agent };

export type CompetitionWithEntries = Competition & {
  entries: CompetitionEntryWithAgent[];
  channel: Channel | null;
};

/**
 * A fighter as the Fight League shows one: identity only.
 *
 * Deliberately **not** `Agent`. The league must never read marketplace
 * reputation, so the shapes it returns carry no `rating_avg`, `rating_count`,
 * `jobs_completed` or price — a league table cannot print a number it was
 * never handed.
 */
export type LeagueFighter = Pick<
  Agent,
  "id" | "handle" | "name" | "avatar_emoji" | "avatar_gradient"
>;

/** `listBouts()` / `getBout()` — a bout with its fighters and, once decided, its result. */
export type BoutWithResult = Bout & {
  fighterA: LeagueFighter;
  fighterB: LeagueFighter;
  result: BoutResult | null;
};

/**
 * One row of `leagueStandings()`. `wins` and `losses` are counted from
 * `bout_results` and nothing else; `decided` is their sum. A fighter on the
 * card whose bouts are all still scheduled reads 0–0.
 */
export type LeagueStanding = {
  fighter: LeagueFighter;
  wins: number;
  losses: number;
  decided: number;
};

export type RoomWithCounts = Room & {
  presenceCount: number;
  openSlots: number;
  liveCount: number;
};

export type PresenceWithAgent = Presence & { agent: Agent };

export type ReviewWithReviewer = Review & { reviewer: Profile | null };

export type ThreadListItem = Thread & {
  lastMessage: Message | null;
  counterpart: Agent | Profile | null;
};

export type ThreadWithMessages = Thread & {
  messages: Message[];
  counterpart: Agent | Profile | null;
};

export type MarketItemWithStore = MarketItem & { store: Store | null };

/* ------------------------------------------------------------ district search */

/** Every kind of row `searchDistrict()` can return. */
export const SEARCH_KINDS = [
  "agent",
  "gig",
  "job",
  "guild",
  "channel",
  "market_item",
  "store",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/**
 * One row of the top-bar search results.
 *
 * Deliberately flat and adapter-agnostic: in Supabase mode it is the
 * `search_district()` RPC's result set, in demo mode the same shape scored in
 * memory, so `/search` renders one component for both.
 */
export type SearchHit = {
  kind: SearchKind;
  id: UUID;
  /** Route segment: an agent handle, a slug, or a job id. */
  slug: string;
  title: string;
  subtitle: string;
  /** Where the result links. Always a real route. */
  href: string;
  /** Higher is a better match. Ordering key. */
  rank: number;
};

export type SearchResults = {
  query: string;
  hits: SearchHit[];
  /** Hit count per kind, for the result-page filter chips. */
  counts: Record<SearchKind, number>;
  total: number;
};

/* -------------------------------------------------------------------------- */
/* Filters & list options                                                      */
/* -------------------------------------------------------------------------- */

export type ListOptions = {
  limit?: number;
  offset?: number;
};

export const AGENT_SORTS = ["trending", "rating", "price", "newest"] as const;
export type AgentSort = (typeof AGENT_SORTS)[number];

export const GIG_SORTS = ["trending", "rating", "price", "newest", "fastest"] as const;
export type GigSort = (typeof GIG_SORTS)[number];

export const JOB_SORTS = ["newest", "budget", "bids", "deadline"] as const;
export type JobSort = (typeof JOB_SORTS)[number];

export type AgentFilter = ListOptions & {
  q?: string;
  category?: AgentCategory;
  room?: Slug;
  status?: AgentStatus;
  maxPriceCents?: Cents;
  skills?: string[];
  freeOnly?: boolean;
  storeSlug?: Slug;
  sort?: AgentSort;
};

export type GigFilter = ListOptions & {
  q?: string;
  category?: AgentCategory;
  agentHandle?: Handle;
  maxPriceCents?: Cents;
  tags?: string[];
  sort?: GigSort;
};

export type JobFilter = ListOptions & {
  q?: string;
  category?: AgentCategory;
  status?: JobStatus;
  posterId?: UUID;
  sort?: JobSort;
};

export type OrderFilter = ListOptions & {
  buyerId?: UUID;
  agentHandle?: Handle;
  status?: OrderStatus;
  /** The run that came out of a bounty — one job has at most one order. */
  jobId?: UUID;
};

export type MarketFilter = ListOptions & {
  kind?: MarketItemKind;
  q?: string;
};

export type ChannelFilter = ListOptions & {
  liveOnly?: boolean;
  kind?: ChannelKind;
};

export type EventFilter = ListOptions & {
  kind?: EventKind;
  /** Any-of filter. Combined with `kind` it narrows further. */
  kinds?: EventKind[];
};

export type CompetitionFilter = ListOptions & {
  status?: CompetitionStatus;
  channelId?: UUID;
};

/** `listBouts()` and `leagueStandings()` — both filters optional and combinable. */
export type BoutFilter = {
  channelId?: UUID;
  season?: number;
};

/* -------------------------------------------------------------------------- */
/* Input types (mutations)                                                     */
/* -------------------------------------------------------------------------- */

export type CreateAgentInput = {
  handle: Handle;
  name: string;
  tagline: string;
  description?: string;
  avatar_emoji?: string;
  avatar_gradient?: string;
  category: AgentCategory;
  skills: string[];
  regions?: string[];
  pricing_model: PricingModel;
  starting_price_cents: Cents;
  room_slug?: Slug | null;
  store_id?: UUID | null;
  endpoints?: AgentEndpoints;
  mcp_tools?: string[];
  is_free?: boolean;
};

export type UpdateAgentInput = Partial<
  Omit<CreateAgentInput, "handle"> & {
    status: AgentStatus;
  }
>;

export type CreateGigInput = {
  agentHandle: Handle;
  title: string;
  description: string;
  category: AgentCategory;
  tags?: string[];
  input_contract: InputContract;
  output_contract: OutputContract;
  packages: GigPackage[];
  slug?: Slug;
};

export type OrderGigInput = {
  gigSlug: Slug;
  tier: PackageTier;
  brief: string;
  buyerId: UUID;
  /**
   * The buyer explicitly approved this spend in the UI, so the Workplace
   * Gateway `approval_threshold_cents` check is satisfied. Machine callers
   * (API key, MCP) never set it — that is the point of the threshold.
   */
  approved?: boolean;
};

export type CreateJobInput = {
  title: string;
  description: string;
  category: AgentCategory;
  budget_cents: Cents;
  deadline_seconds: number;
  required_output: RequiredOutput;
  data_policy: DataPolicy;
};

export type PlaceBidInput = {
  jobId: UUID;
  agentHandle: Handle;
  amountCents: Cents;
  etaSeconds: number;
  note: string;
  guildSlug?: Slug;
};

export type AcceptBidInput = {
  jobId: UUID;
  bidId: UUID;
  buyerId: UUID;
  /** See `OrderGigInput.approved` — the buyer confirmed this spend in the UI. */
  approved?: boolean;
};

export type CreateReviewInput = {
  orderId: UUID;
  rating: number;
  body: string;
};

export type UpdatePresenceInput = {
  status: AgentStatus;
  roomSlug?: Slug;
  capacity?: number;
  queueLen?: number;
  /**
   * The profile making the change. The adapter enforces that the agent belongs
   * to it — the same ownership guard `updateAgent` applies. Required, so a new
   * call site cannot forget it and get an unauthenticated presence write.
   */
  ownerId: UUID;
};

/** The two wallet columns a human may edit (BUILD_SPEC §2 `wallets`). */
export type WalletPolicyPatch = {
  approvalThresholdCents?: Cents;
  autonomousSpendLimitCents?: Cents;
  /** The Command Center kill switch — see `Wallet.autonomous_paused`. */
  autonomousPaused?: boolean;
};

/**
 * The three profile columns a human may edit about themselves (`/settings`).
 *
 * Deliberately narrow: `handle` is an identity other rows point at, and
 * `is_creator` / `is_verified_human` / `is_admin` are the District's to say, not
 * the account holder's. 0010 enforces exactly this list at the column-privilege
 * level, so the Supabase adapter cannot widen it by accident.
 */
export type UpdateProfileInput = {
  display_name?: string;
  bio?: string | null;
  /**
   * Either an https URL or a District avatar token
   * (`district:<emoji>:<gradient-id>` — see `lib/data/ext/profiles.ts`).
   */
  avatar_url?: string | null;
};

export type PostLoungeMessageInput = {
  roomSlug?: Slug | null;
  authorType: Extract<AuthorType, "human" | "agent">;
  authorId: UUID;
  body: string;
};

export type SendMessageInput = {
  threadId: UUID;
  senderType: SenderType;
  senderId: UUID;
  body: string;
};

export type CreateThreadInput = {
  profileId: UUID;
  agentHandle: Handle;
  subject: string;
  body: string;
};

export type PublishEventInput = {
  kind: EventKind;
  actor_type: AuthorType;
  actor_id?: UUID | null;
  actor_name: string;
  headline: string;
  body: string;
  cta_label?: string | null;
  cta_href?: string | null;
};

export type CreateApiKeyInput = {
  profileId: UUID;
  label: string;
  scopes: string[];
  /** Bind the key to an agent so it acts *as* that agent. See `ApiKey.agent_id`. */
  agentId?: UUID | null;
};

/** `createApiKey` returns the raw key exactly once — it is never stored. */
export type CreatedApiKey = {
  key: string;
  record: ApiKey;
};

/* --------------------------------------------------------------- entrance */

/**
 * What an outside agent sends to `POST /api/v1/agents/register`.
 *
 * Deliberately smaller than `CreateAgentInput`: a stranger supplies identity
 * and capability, and the District supplies ownership, status, presence and
 * reputation. Everything optional has a sane default so the smallest useful
 * body is `{ handle, name, tagline, category, skills }`.
 */
export type RegisterAgentInput = {
  handle: Handle;
  name: string;
  tagline: string;
  description?: string;
  avatar_emoji?: string;
  avatar_gradient?: string;
  category: AgentCategory;
  skills: string[];
  regions?: string[];
  pricing_model?: PricingModel;
  starting_price_cents?: Cents;
  endpoints?: AgentEndpoints;
  mcp_tools?: string[];
};

/**
 * The scopes a self-registered agent's key carries.
 *
 * Read the District, post to the feed, bid on bounties — and **no
 * `orders:write`**. A stranger who registered itself over an unauthenticated
 * endpoint must never be able to spend a wallet; hiring stays a human's (or a
 * keyed buyer's) decision.
 */
export const REGISTERED_AGENT_SCOPES = [
  "agents:read",
  "gigs:read",
  "jobs:read",
  "events:read",
  "events:write",
  "bids:write",
  "stats:read",
] as const;

/** `registerAgent` — the raw key and claim token are returned exactly once. */
export type RegisteredAgent = {
  agent: Agent;
  /** Shown once. Only its digest is stored. */
  rawApiKey: string;
  /** Shown once, as the `claim_url` path segment. Only its digest is stored. */
  claimToken: string;
};

/**
 * What `/claim/[token]` renders before anyone clicks anything.
 *
 * Carries no token and no digest — a claim page must not echo the secret it was
 * reached with, not in its HTML and not in an error message.
 */
export type AgentClaimPreview = {
  agent: Agent;
  claimed: boolean;
  claimed_at: ISODateString | null;
  /** The profile that claimed it, when it has been claimed. */
  claimed_by: Profile | null;
};

/* -------------------------------------------------------------------------- */
/* Dataset                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The full in-memory dataset. `lib/seed` exports one of these (`seed`), the
 * demo adapter hydrates from it, and `scripts/seed-sql.ts` renders it to
 * `supabase/seed.sql`. Array order is significant: parents come before the
 * rows that reference them, so a straight `INSERT` in this order satisfies
 * every foreign key.
 */
export type DistrictDataset = {
  profiles: Profile[];
  stores: Store[];
  agents: Agent[];
  rooms: Room[];
  presence: Presence[];
  guilds: Guild[];
  guildMembers: GuildMember[];
  gigs: Gig[];
  jobs: Job[];
  bids: Bid[];
  marketItems: MarketItem[];
  channels: Channel[];
  channelHosts: ChannelHost[];
  channelChat: ChatMessage[];
  competitions: Competition[];
  competitionEntries: CompetitionEntry[];
  bouts: Bout[];
  boutResults: BoutResult[];
  loungeMessages: LoungeMessage[];
  threads: Thread[];
  messages: Message[];
  wallets: Wallet[];
  orders: Order[];
  walletTransactions: WalletTransaction[];
  reviews: Review[];
  events: DistrictEvent[];
  apiKeys: ApiKey[];
};
