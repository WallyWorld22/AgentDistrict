import type {
  Agent,
  AgentCategory,
  AgentClaim,
  AgentEndpoints,
  AgentStatus,
  ApiKey,
  AuthorType,
  Bid,
  BidStatus,
  Channel,
  ChannelHost,
  ChannelKind,
  ChatMessage,
  Competition,
  CompetitionEntry,
  CompetitionStatus,
  CostBreakdown,
  DataPolicy,
  DistrictAnalytics,
  DistrictEvent,
  EventKind,
  Gig,
  GigPackage,
  GigStatus,
  Guild,
  GuildMember,
  GuildStatus,
  InputContract,
  Job,
  JobStatus,
  LoungeMessage,
  MarketItem,
  MarketItemKind,
  Message,
  Order,
  OrderAuditEntry,
  OrderOutput,
  OrderStatus,
  OutputContract,
  PackageTier,
  Presence,
  PricingModel,
  Profile,
  RequiredOutput,
  Review,
  Room,
  SenderType,
  Store,
  Thread,
  TransactionKind,
  Wallet,
  WalletTransaction,
} from "../types";

/**
 * Row → domain mappers for the Supabase adapter.
 *
 * PostgREST hands back JSON whose column names already match the domain types
 * (both are snake_case), so these are mostly *coercions*: `numeric` columns can
 * arrive as strings, `jsonb` can be `null`, and `text[]` can be missing. Every
 * mapper is total — it never throws on a partial row, it substitutes a safe
 * default, which keeps a schema drift from taking a page down.
 */

export type Row = Record<string, unknown>;

export function asRow(value: unknown): Row {
  return value && typeof value === "object" ? (value as Row) : {};
}

export function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(asRow) : [];
}

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const nullableStr = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const num = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function obj<T>(value: unknown, fallback: T): T {
  return value !== null && typeof value === "object" ? (value as T) : fallback;
}

function arr<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

const enumOr = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

/* -------------------------------------------------------------------------- */

export function toProfile(row: Row): Profile {
  return {
    id: str(row.id),
    handle: str(row.handle),
    display_name: str(row.display_name),
    avatar_url: nullableStr(row.avatar_url),
    bio: nullableStr(row.bio),
    is_creator: bool(row.is_creator),
    is_verified_human: bool(row.is_verified_human),
    // Added by 0010. `bool()` defaults to false, so a row read from a project
    // that has not applied it yet is simply "not an operator" rather than a
    // crash — and never accidentally an operator.
    is_admin: bool(row.is_admin),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at, str(row.created_at)),
  };
}

/**
 * `district_analytics()` → `DistrictAnalytics`.
 *
 * The RPC returns one jsonb document; everything is re-read through the same
 * coercion helpers as a table row, so a shape change in SQL degrades to zeros
 * rather than to `undefined` leaking into the page.
 */
export function toDistrictAnalytics(value: unknown): DistrictAnalytics {
  const root = asRow(value);
  const totals = asRow(root.totals);
  const daily = arr<unknown>(root.daily).map((entry) => {
    const point = asRow(entry);
    return {
      date: str(point.date),
      humans: num(point.humans),
      agents: num(point.agents),
      claims: num(point.claims),
      posts: num(point.posts),
      orders: num(point.orders),
      orderVolumeCents: num(point.orderVolumeCents),
    };
  });

  return {
    generated_at: str(root.generated_at, new Date().toISOString()),
    totals: {
      humans: num(totals.humans),
      agents: num(totals.agents),
      claimedAgents: num(totals.claimedAgents),
      posts: num(totals.posts),
      orders: num(totals.orders),
      orderVolumeCents: num(totals.orderVolumeCents),
      gigs: num(totals.gigs),
      jobs: num(totals.jobs),
    },
    daily,
  };
}

export function toStore(row: Row): Store {
  return {
    id: str(row.id),
    slug: str(row.slug),
    name: str(row.name),
    tagline: str(row.tagline),
    banner_gradient: str(row.banner_gradient),
    owner_id: str(row.owner_id),
    hires_count: num(row.hires_count),
    rating_avg: num(row.rating_avg),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at, str(row.created_at)),
  };
}

export function toAgent(row: Row): Agent {
  return {
    id: str(row.id),
    handle: str(row.handle),
    name: str(row.name),
    tagline: str(row.tagline),
    description: str(row.description),
    avatar_emoji: str(row.avatar_emoji, "🤖"),
    avatar_gradient: str(row.avatar_gradient),
    owner_id: str(row.owner_id),
    store_id: nullableStr(row.store_id),
    category: str(row.category, "research") as AgentCategory,
    skills: strArray(row.skills),
    regions: strArray(row.regions),
    status: str(row.status, "available") as AgentStatus,
    room_slug: nullableStr(row.room_slug),
    pricing_model: str(row.pricing_model, "per_run") as PricingModel,
    starting_price_cents: num(row.starting_price_cents),
    verified: bool(row.verified),
    rating_avg: num(row.rating_avg),
    rating_count: num(row.rating_count),
    jobs_completed: num(row.jobs_completed),
    repeat_hire_rate: num(row.repeat_hire_rate),
    reliability: num(row.reliability),
    dispute_rate: num(row.dispute_rate),
    avg_latency_sec: num(row.avg_latency_sec),
    endpoints: obj<AgentEndpoints>(row.endpoints, {}),
    mcp_tools: strArray(row.mcp_tools),
    is_free: bool(row.is_free),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at, str(row.created_at)),
  };
}

export function toGig(row: Row): Gig {
  return {
    id: str(row.id),
    slug: str(row.slug),
    agent_id: str(row.agent_id),
    title: str(row.title),
    description: str(row.description),
    category: str(row.category, "research") as AgentCategory,
    tags: strArray(row.tags),
    input_contract: obj<InputContract>(row.input_contract, { summary: "", fields: [] }),
    output_contract: obj<OutputContract>(row.output_contract, {
      summary: "",
      format: "json",
      fields: [],
    }),
    packages: arr<GigPackage>(row.packages),
    starting_price_cents: num(row.starting_price_cents),
    delivery_seconds: num(row.delivery_seconds),
    runs_count: num(row.runs_count),
    rating_avg: num(row.rating_avg),
    rating_count: num(row.rating_count),
    status: str(row.status, "active") as GigStatus,
    created_at: str(row.created_at),
    updated_at: str(row.updated_at, str(row.created_at)),
  };
}

export function toJob(row: Row): Job {
  return {
    id: str(row.id),
    title: str(row.title),
    description: str(row.description),
    category: str(row.category, "research") as AgentCategory,
    budget_cents: num(row.budget_cents),
    deadline_seconds: num(row.deadline_seconds),
    required_output: obj<RequiredOutput>(row.required_output, { format: "csv" }),
    data_policy: obj<DataPolicy>(row.data_policy, {
      pii: "none",
      retention_days: 0,
      allow_subcontracting: false,
    }),
    poster_id: str(row.poster_id),
    status: str(row.status, "open") as JobStatus,
    awarded_bid_id: nullableStr(row.awarded_bid_id),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at, str(row.created_at)),
  };
}

export function toBid(row: Row): Bid {
  return {
    id: str(row.id),
    job_id: str(row.job_id),
    agent_id: str(row.agent_id),
    guild_id: nullableStr(row.guild_id),
    amount_cents: num(row.amount_cents),
    eta_seconds: num(row.eta_seconds),
    note: str(row.note),
    status: str(row.status, "pending") as BidStatus,
    created_at: str(row.created_at),
  };
}

export function toOrder(row: Row): Order {
  return {
    id: str(row.id),
    buyer_id: str(row.buyer_id),
    agent_id: str(row.agent_id),
    gig_id: nullableStr(row.gig_id),
    job_id: nullableStr(row.job_id),
    bid_id: nullableStr(row.bid_id),
    package_tier: (nullableStr(row.package_tier) as PackageTier | null) ?? null,
    brief: str(row.brief),
    amount_cents: num(row.amount_cents),
    status: str(row.status, "queued") as OrderStatus,
    progress: num(row.progress),
    eta_seconds: num(row.eta_seconds),
    started_at: nullableStr(row.started_at),
    delivered_at: nullableStr(row.delivered_at),
    output: row.output ? obj<OrderOutput>(row.output, { format: "json", summary: "" }) : null,
    cost_breakdown: row.cost_breakdown
      ? obj<CostBreakdown>(row.cost_breakdown, {
          agent_cents: 0,
          district_fee_cents: 0,
          tools_cents: 0,
          total_cents: 0,
        })
      : null,
    audit_log: arr<OrderAuditEntry>(row.audit_log),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at, str(row.created_at)),
  };
}

export function toReview(row: Row): Review {
  return {
    id: str(row.id),
    order_id: nullableStr(row.order_id),
    agent_id: str(row.agent_id),
    reviewer_id: str(row.reviewer_id),
    rating: num(row.rating),
    body: str(row.body),
    created_at: str(row.created_at),
  };
}

export function toGuild(row: Row): Guild {
  return {
    id: str(row.id),
    slug: str(row.slug),
    name: str(row.name),
    description: str(row.description),
    pipeline: str(row.pipeline),
    starting_price_cents: num(row.starting_price_cents),
    rating_avg: num(row.rating_avg),
    rating_count: num(row.rating_count),
    hires_count: num(row.hires_count),
    status: str(row.status, "available") as GuildStatus,
    owner_id: nullableStr(row.owner_id),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at, str(row.created_at)),
  };
}

export function toGuildMember(row: Row): GuildMember {
  return {
    guild_id: str(row.guild_id),
    agent_id: str(row.agent_id),
    role: str(row.role),
    position: num(row.position),
  };
}

export function toMarketItem(row: Row): MarketItem {
  return {
    id: str(row.id),
    slug: str(row.slug),
    title: str(row.title),
    description: str(row.description),
    kind: str(row.kind, "tool") as MarketItemKind,
    price_cents: num(row.price_cents),
    seller_store_id: nullableStr(row.seller_store_id),
    verified: bool(row.verified),
    downloads: num(row.downloads),
    tags: strArray(row.tags),
    icon_emoji: str(row.icon_emoji, "📦"),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at, str(row.created_at)),
  };
}

export function toRoom(row: Row): Room {
  return {
    id: str(row.id),
    slug: str(row.slug),
    name: str(row.name),
    category: str(row.category, "research") as AgentCategory,
    description: str(row.description),
    icon: str(row.icon, "🛋️"),
    position: num(row.position),
  };
}

export function toPresence(row: Row): Presence {
  return {
    agent_id: str(row.agent_id),
    room_slug: str(row.room_slug),
    status: str(row.status, "available") as AgentStatus,
    capacity: num(row.capacity),
    queue_len: num(row.queue_len),
    updated_at: str(row.updated_at),
  };
}

export function toLoungeMessage(row: Row): LoungeMessage {
  return {
    id: str(row.id),
    room_slug: nullableStr(row.room_slug),
    author_type: str(row.author_type, "human") as AuthorType,
    author_id: nullableStr(row.author_id),
    author_name: str(row.author_name),
    body: str(row.body),
    created_at: str(row.created_at),
  };
}

export function toChannel(row: Row): Channel {
  return {
    id: str(row.id),
    slug: str(row.slug),
    title: str(row.title),
    description: str(row.description),
    kind: str(row.kind, "show") as ChannelKind,
    is_live: bool(row.is_live),
    viewers: num(row.viewers),
    thumbnail_gradient: str(row.thumbnail_gradient),
    schedule: str(row.schedule),
    followers: num(row.followers),
    owner_id: nullableStr(row.owner_id),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at, str(row.created_at)),
  };
}

export function toChannelHost(row: Row): ChannelHost {
  return {
    channel_id: str(row.channel_id),
    agent_id: str(row.agent_id),
    position: num(row.position),
  };
}

export function toChatMessage(row: Row): ChatMessage {
  return {
    id: str(row.id),
    channel_id: str(row.channel_id),
    author_name: str(row.author_name),
    body: str(row.body),
    created_at: str(row.created_at),
  };
}

export function toCompetition(row: Row): Competition {
  return {
    id: str(row.id),
    channel_id: str(row.channel_id),
    title: str(row.title),
    task: str(row.task),
    ends_at: str(row.ends_at),
    status: str(row.status, "live") as CompetitionStatus,
    prize_cents: num(row.prize_cents),
    created_at: str(row.created_at),
  };
}

export function toCompetitionEntry(row: Row): CompetitionEntry {
  return {
    competition_id: str(row.competition_id),
    agent_id: str(row.agent_id),
    progress: num(row.progress),
    accuracy: num(row.accuracy),
  };
}

export function toThread(row: Row): Thread {
  return {
    id: str(row.id),
    profile_id: str(row.profile_id),
    agent_id: nullableStr(row.agent_id),
    subject: str(row.subject),
    unread_count: num(row.unread_count),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at, str(row.created_at)),
  };
}

export function toMessage(row: Row): Message {
  return {
    id: str(row.id),
    thread_id: str(row.thread_id),
    sender_type: str(row.sender_type, "human") as SenderType,
    sender_id: nullableStr(row.sender_id),
    sender_name: str(row.sender_name),
    body: str(row.body),
    created_at: str(row.created_at),
  };
}

export function toWallet(row: Row): Wallet {
  return {
    profile_id: str(row.profile_id),
    balance_cents: num(row.balance_cents),
    held_cents: num(row.held_cents),
    spend_today_cents: num(row.spend_today_cents),
    spend_today_date: str(row.spend_today_date, str(row.updated_at)).slice(0, 10),
    approval_threshold_cents: num(row.approval_threshold_cents),
    autonomous_spend_limit_cents: num(row.autonomous_spend_limit_cents),
    autonomous_paused: Boolean(row.autonomous_paused),
    updated_at: str(row.updated_at),
  };
}

export function toWalletTransaction(row: Row): WalletTransaction {
  return {
    id: str(row.id),
    profile_id: str(row.profile_id),
    kind: str(row.kind, "hold") as TransactionKind,
    amount_cents: num(row.amount_cents),
    order_id: nullableStr(row.order_id),
    memo: str(row.memo),
    created_at: str(row.created_at),
  };
}

export function toEvent(row: Row): DistrictEvent {
  return {
    id: str(row.id),
    kind: str(row.kind, "available") as EventKind,
    actor_type: str(row.actor_type, "agent") as AuthorType,
    actor_id: nullableStr(row.actor_id),
    actor_name: str(row.actor_name),
    headline: str(row.headline),
    body: str(row.body),
    cta_label: nullableStr(row.cta_label),
    cta_href: nullableStr(row.cta_href),
    created_at: str(row.created_at),
  };
}

export function toApiKey(row: Row): ApiKey {
  return {
    id: str(row.id),
    profile_id: str(row.profile_id),
    label: str(row.label),
    key_hash: str(row.key_hash),
    key_prefix: str(row.key_prefix),
    scopes: strArray(row.scopes),
    last_used_at: nullableStr(row.last_used_at),
    created_at: str(row.created_at),
    // Added by 0009_entrance.sql. `nullableStr` keeps this total against a
    // database that has not had 0009 applied yet — the column is simply absent
    // and the key reads as an ordinary human key.
    agent_id: nullableStr(row.agent_id),
  };
}

/** `agent_claims` (0009_entrance.sql). */
export function toAgentClaim(row: Row): AgentClaim {
  return {
    id: str(row.id),
    agent_id: str(row.agent_id),
    token_hash: str(row.token_hash),
    created_at: str(row.created_at),
    claimed_at: nullableStr(row.claimed_at),
    claimed_by: nullableStr(row.claimed_by),
  };
}

/** `network_stats()` returns a single jsonb object. */
export function toNetworkCounts(value: unknown): {
  agentsOnline: number;
  jobsPosted: number;
  gigsAvailable: number;
  liveChannels: number;
  guildsActive: number;
} {
  const row = asRow(value);
  return {
    agentsOnline: num(row.agentsOnline),
    jobsPosted: num(row.jobsPosted),
    gigsAvailable: num(row.gigsAvailable),
    liveChannels: num(row.liveChannels),
    guildsActive: num(row.guildsActive),
  };
}

/** `room_presence_counts()` returns one row per room. */
export function toRoomCounts(row: Row): {
  room_slug: string;
  presence_count: number;
  live_count: number;
  open_slots: number;
} {
  return {
    room_slug: str(row.room_slug),
    presence_count: num(row.presence_count),
    live_count: num(row.live_count),
    open_slots: num(row.open_slots),
  };
}

export { bool, enumOr, num, str, strArray, nullableStr };
