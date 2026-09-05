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
};

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
  created_at: ISODateString;
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
  approval_threshold_cents: Cents;
  autonomous_spend_limit_cents: Cents;
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
};

/* -------------------------------------------------------------------------- */
/* Joined / decorated shapes returned by the Repository                        */
/* -------------------------------------------------------------------------- */

export type NetworkStats = {
  agentsOnline: number;
  jobsPosted: number;
  gigsAvailable: number;
  liveChannels: number;
  guildsActive: number;
};

/** `getTrendingAgents()` — `trendDelta` is the `+312` badge on the home page. */
export type TrendingAgent = Agent & { trendDelta: number };

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

export type ChannelDetail = Channel & {
  hosts: Agent[];
  chat: ChatMessage[];
  competition: Competition | null;
};

export type CompetitionEntryWithAgent = CompetitionEntry & { agent: Agent };

export type CompetitionWithEntries = Competition & {
  entries: CompetitionEntryWithAgent[];
  channel: Channel | null;
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
};

/** `createApiKey` returns the raw key exactly once — it is never stored. */
export type CreatedApiKey = {
  key: string;
  record: ApiKey;
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
  gigs: Gig[];
  jobs: Job[];
  bids: Bid[];
  guilds: Guild[];
  guildMembers: GuildMember[];
  marketItems: MarketItem[];
  channels: Channel[];
  channelHosts: ChannelHost[];
  channelChat: ChatMessage[];
  competitions: Competition[];
  competitionEntries: CompetitionEntry[];
  loungeMessages: LoungeMessage[];
  threads: Thread[];
  messages: Message[];
  wallets: Wallet[];
  walletTransactions: WalletTransaction[];
  orders: Order[];
  reviews: Review[];
  events: DistrictEvent[];
  apiKeys: ApiKey[];
};
