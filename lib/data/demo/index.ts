import {
  DEMO_PROFILE_HANDLE,
  FEATURED_GIG_SLUGS,
  REGISTRY_PROFILE_HANDLE,
  ROOM_FOR_CATEGORY,
  seed,
} from "@/lib/seed";
import { runtimeFor } from "@/lib/runtime";
import { computeProgress, costBreakdownFor, projectedStatus } from "@/lib/runtime/progress";
import { formatCents, slugify } from "@/lib/utils";
import { validateAgentEndpoints } from "../endpoints";
import {
  ConflictError,
  ForbiddenError,
  InsufficientFundsError,
  NotFoundError,
  ValidationError,
} from "../errors";
import {
  API_KEY_PREFIX,
  apiKeyMatches,
  apiKeyPrefix,
  generateApiKey,
  generateClaimToken,
  hashApiKey,
  hashClaimToken,
} from "../hash";
import { districtNow } from "../clock";
import type { Repository, RepositoryMode } from "../repository";
import { headlineStats } from "../stats";
import { compareTrendingGigs, trendDeltaFor } from "../trending";
import type {
  AcceptBidInput,
  Agent,
  AgentClaim,
  AgentClaimPreview,
  AgentFilter,
  ApiKey,
  RegisterAgentInput,
  RegisteredAgent,
  Bid,
  BidWithAgent,
  Channel,
  ChannelDetail,
  ChannelFilter,
  ChannelWithHosts,
  ChatMessage,
  CompetitionFilter,
  CompetitionWithEntries,
  CreateAgentInput,
  CreateApiKeyInput,
  CreateGigInput,
  CreateJobInput,
  CreateReviewInput,
  CreateThreadInput,
  CreatedApiKey,
  DistrictDataset,
  DistrictEvent,
  EventFilter,
  Gig,
  GigFilter,
  GigWithAgent,
  GuildWithMembers,
  Handle,
  Job,
  JobFilter,
  JobWithBidCount,
  JobWithBids,
  ListOptions,
  LoungeMessage,
  MarketFilter,
  MarketItemWithStore,
  Message,
  NetworkStats,
  Order,
  OrderDetail,
  OrderFilter,
  OrderGigInput,
  PlaceBidInput,
  PostLoungeMessageInput,
  Presence,
  PresenceWithAgent,
  Profile,
  PublishEventInput,
  Review,
  ReviewWithReviewer,
  RoomWithCounts,
  SearchHit,
  SearchKind,
  SearchResults,
  SendMessageInput,
  Slug,
  StoreDetail,
  StoreWithAgents,
  Thread,
  ThreadListItem,
  ThreadWithMessages,
  TrendingAgent,
  UUID,
  UpdateAgentInput,
  UpdatePresenceInput,
  Wallet,
  WalletPolicyPatch,
  WalletTransaction,
} from "../types";
import { REGISTERED_AGENT_SCOPES } from "../types";
import { emptySearchCounts, filterByTerms, rankSearchHits } from "../search";

/** Sentinel: a handle filter that matched nothing, so the page is empty. */
const MISSING = "\u0000missing";

/**
 * The in-memory adapter (BUILD_SPEC §2).
 *
 * It hydrates a **deep clone** of `lib/seed` so mutations never corrupt the
 * frozen seed module, then serves and mutates that clone. Everything is
 * process-local: **the store resets on cold start** (a new serverless instance,
 * a dev-server reload, a redeploy), which is exactly what a zero-env demo
 * should do.
 *
 * ### The District clock
 * Seeded timestamps are relative to `SEED_EPOCH` (2026-09-05T18:00Z), so the
 * adapter treats that instant as "now" at boot and lets it advance in real
 * time: `now() = SEED_EPOCH + (Date.now() − bootedAt)`. Seeded content reads
 * with the right relative times ("2m ago") *and* in-flight orders keep making
 * progress while the process is warm. Tests inject their own clock.
 */
export class DemoRepository implements Repository {
  readonly mode: RepositoryMode = "demo";

  private readonly db: DistrictDataset;
  private readonly now: () => number;
  private readonly listeners = new Set<(event: DistrictEvent) => void>();
  /**
   * `"<channelId>:<profileId>"` for every follow. Demo mode has no
   * `channel_followers` table to clone, so the set lives beside the dataset
   * and — like every other demo mutation — resets on cold start.
   */
  private readonly channelFollows = new Set<string>();
  /**
   * Claim rows, keyed by `token_hash`.
   *
   * Demo mode has no `agent_claims` table to clone — the seed ships no claims,
   * because a claim only exists once an agent has registered itself — so, like
   * `channelFollows`, it lives beside the dataset and resets on cold start.
   */
  private readonly agentClaims = new Map<string, AgentClaim>();

  constructor(options: { now?: () => number; dataset?: DistrictDataset } = {}) {
    this.db = options.dataset ?? structuredClone(seed);
    this.now = options.now ?? districtNow;
  }

  /* ------------------------------------------------------------- internals */

  private nowIso(): string {
    return new Date(this.now()).toISOString();
  }

  private id(): UUID {
    return crypto.randomUUID();
  }

  /** Live event feed for `/api/events`; demo-only, not part of `Repository`. */
  subscribe(listener: (event: DistrictEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private agentById(id: UUID): Agent | null {
    return this.db.agents.find((agent) => agent.id === id) ?? null;
  }

  private requireAgentById(id: UUID): Agent {
    const agent = this.agentById(id);
    if (!agent) throw new NotFoundError("Agent");
    return agent;
  }

  private requireAgentByHandle(handle: Handle): Agent {
    const agent = this.db.agents.find((candidate) => candidate.handle === handle);
    if (!agent) throw new NotFoundError(`Agent @${handle}`);
    return agent;
  }

  private requireWallet(profileId: UUID): Wallet {
    const wallet = this.db.wallets.find((row) => row.profile_id === profileId);
    if (!wallet) throw new NotFoundError("Wallet");
    return wallet;
  }

  private gigById(id: UUID | null): Gig | null {
    if (!id) return null;
    return this.db.gigs.find((gig) => gig.id === id) ?? null;
  }

  private jobById(id: UUID | null): Job | null {
    if (!id) return null;
    return this.db.jobs.find((job) => job.id === id) ?? null;
  }

  private profileById(id: UUID | null): Profile | null {
    if (!id) return null;
    return this.db.profiles.find((profile) => profile.id === id) ?? null;
  }

  /**
   * Hold `amount` against a wallet's available balance and log the ledger row.
   *
   * This is where the Workplace Gateway policy actually bites (BUILD_SPEC §2/§4):
   *
   * - `approval_threshold_cents` — a spend above it needs the buyer to say yes
   *   in the UI (`options.approved`). A machine caller never sets that flag, so
   *   an API key cannot silently spend more than the threshold allows;
   * - `autonomous_spend_limit_cents` — a hard daily ceiling;
   * - `spend_today_cents` resets when the last *spend* was on an earlier UTC
   *   day (`spend_today_date`), so it is a daily figure rather than a number
   *   that only grows.
   */
  private holdFunds(
    profileId: UUID,
    amount: number,
    orderId: UUID,
    memo: string,
    options: { approved?: boolean } = {},
  ): void {
    const wallet = this.requireWallet(profileId);
    const available = wallet.balance_cents - wallet.held_cents;
    if (amount > available) {
      throw new InsufficientFundsError(
        `This order costs ${formatCents(amount)} but only ${formatCents(available)} is available.`,
      );
    }

    const spentToday = this.spendToday(wallet);
    if (!options.approved) {
      // Autonomous spend only: a human who clicked "Continue ($x)" has already
      // seen and approved the price, which is what the threshold is for.
      if (wallet.autonomous_paused) {
        throw new ConflictError(
          "External agent spending is paused in the Command Center — no unattended run can start.",
        );
      }
      // A ceiling of zero means "no unattended spend at all". It must never
      // read as "no ceiling": saving 0.00 in the spend policy is the *tightest*
      // setting a buyer can ask for, not the loosest.
      if (amount > wallet.approval_threshold_cents) {
        throw new ConflictError(
          `${formatCents(amount)} is over the ${formatCents(
            wallet.approval_threshold_cents,
          )} approval threshold — a human has to approve this spend.`,
        );
      }
      if (spentToday + amount > wallet.autonomous_spend_limit_cents) {
        throw new ConflictError(
          `This would take today's autonomous spend past the ${formatCents(
            wallet.autonomous_spend_limit_cents,
          )} daily limit.`,
        );
      }
    }

    wallet.held_cents += amount;
    wallet.spend_today_cents = spentToday + amount;
    wallet.spend_today_date = this.today();
    wallet.updated_at = this.nowIso();
    this.db.walletTransactions.unshift({
      id: this.id(),
      profile_id: profileId,
      kind: "hold",
      amount_cents: -amount,
      order_id: orderId,
      memo,
      created_at: this.nowIso(),
    });
  }

  /** Today, as `YYYY-MM-DD` on the District clock. */
  private today(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  /**
   * `spend_today_cents`, zeroed when the last **spend** was on an earlier UTC
   * day. Reading `updated_at` here was a real bug: a top-up or a policy save
   * refreshes it without touching the counter, so the day never rolled over and
   * yesterday's spend was charged against today's ceiling for ever.
   */
  private spendToday(wallet: Wallet): number {
    return wallet.spend_today_date >= this.today() ? wallet.spend_today_cents : 0;
  }

  /**
   * Return an order's hold to the buyer and rewrite its single money-out ledger
   * row as a `refund`. Used when a run is disputed or fails — leaving the hold
   * in place locked the buyer's credits forever.
   *
   * Settling is **idempotent**: an order whose ledger row is no longer a `hold`
   * has already been released or refunded, and touching the wallet again would
   * free `held_cents` belonging to *other* in-flight orders (and drive
   * `spend_today_cents` to zero, defeating the daily ceiling).
   */
  private refundHold(order: Order, memo: string): void {
    const wallet = this.db.wallets.find((row) => row.profile_id === order.buyer_id);
    if (!wallet) return;
    const settled = this.db.walletTransactions.some(
      (tx) => tx.order_id === order.id && (tx.kind === "refund" || tx.kind === "release"),
    );
    if (settled) return;
    const timestamp = this.nowIso();
    wallet.held_cents = Math.max(0, wallet.held_cents - order.amount_cents);
    // A refund only gives back *today's* spend. On a stale counter the day has
    // rolled over, so there is nothing of today's to reduce.
    wallet.spend_today_cents = Math.max(0, this.spendToday(wallet) - order.amount_cents);
    wallet.spend_today_date = this.today();
    wallet.updated_at = timestamp;

    const holdRow = this.db.walletTransactions.find(
      (tx) => tx.order_id === order.id && tx.kind === "hold",
    );
    if (holdRow) {
      holdRow.kind = "refund";
      holdRow.amount_cents = order.amount_cents;
      holdRow.memo = memo;
      holdRow.created_at = timestamp;
    } else {
      this.db.walletTransactions.unshift({
        id: this.id(),
        profile_id: order.buyer_id,
        kind: "refund",
        amount_cents: order.amount_cents,
        order_id: order.id,
        memo,
        created_at: timestamp,
      });
    }
  }

  private decorateOrder(order: Order): OrderDetail {
    return {
      ...order,
      agent: this.requireAgentById(order.agent_id),
      gig: this.gigById(order.gig_id),
      job: this.jobById(order.job_id),
      buyer: this.profileById(order.buyer_id),
    };
  }

  /**
   * Deterministically advance one order (BUILD_SPEC §6). Mutates in place and
   * returns the same row so callers can read it straight back.
   */
  private async advance(order: Order): Promise<Order> {
    if (order.status !== "queued" && order.status !== "running") return order;

    const now = this.now();
    const progress = computeProgress(order, now);
    const next = projectedStatus(order, progress);

    if (next === "delivered") {
      const agent = this.requireAgentById(order.agent_id);
      const result = await runtimeFor(agent).execute(order, agent, {
        gig: this.gigById(order.gig_id),
        job: this.jobById(order.job_id),
        now,
      });

      order.progress = 100;
      order.status = result.status === "failed" ? "failed" : "delivered";
      order.output = result.output;
      order.delivered_at = result.audit.at(-1)?.at ?? this.nowIso();
      order.audit_log = [...order.audit_log, ...result.audit];
      order.updated_at = this.nowIso();

      // Nothing was delivered, so the buyer gets their credits back.
      if (order.status === "failed") {
        this.refundHold(order, `Refunded — ${agent.name} could not complete this run`);
      }

      await this.publishEvent({
        kind: "delivered",
        actor_type: "agent",
        actor_id: agent.id,
        actor_name: agent.name,
        headline: `${agent.name} delivered a run`,
        body: order.brief.slice(0, 160),
        cta_label: "Review deliverable",
        cta_href: `/orders/${order.id}`,
      });
      return order;
    }

    if (order.progress !== progress || order.status !== next) {
      order.progress = progress;
      order.status = next;
      order.updated_at = this.nowIso();
    }
    return order;
  }

  /* ----------------------------------------------------------------- stats */

  async getNetworkStats(): Promise<NetworkStats> {
    const real = {
      agentsOnline: this.db.agents.filter((agent) => agent.status !== "offline").length,
      jobsPosted: this.db.jobs.length,
      gigsAvailable: this.db.gigs.filter((gig) => gig.status === "active").length,
      liveChannels: this.db.channels.filter((channel) => channel.is_live).length,
      guildsActive: this.db.guilds.filter((guild) => guild.status === "available").length,
    };
    return { ...real, headline: headlineStats(real) };
  }

  async listEvents(filter: EventFilter = {}): Promise<DistrictEvent[]> {
    const { limit = 20, offset = 0, kind, kinds } = filter;
    return this.db.events
      .filter((event) => (kind ? event.kind === kind : true))
      .filter((event) => (kinds && kinds.length > 0 ? kinds.includes(event.kind) : true))
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(offset, offset + limit);
  }

  async publishEvent(input: PublishEventInput): Promise<DistrictEvent> {
    const event: DistrictEvent = {
      id: this.id(),
      kind: input.kind,
      actor_type: input.actor_type,
      actor_id: input.actor_id ?? null,
      actor_name: input.actor_name,
      headline: input.headline,
      body: input.body,
      cta_label: input.cta_label ?? null,
      cta_href: input.cta_href ?? null,
      created_at: this.nowIso(),
    };
    this.db.events.unshift(event);
    for (const listener of this.listeners) listener(event);
    return event;
  }

  /* ---------------------------------------------------------------- search */

  async searchDistrict(query: string, limit = 24): Promise<SearchResults> {
    const needle = query.trim();
    if (!needle) {
      return { query: "", hits: [], counts: emptySearchCounts(), total: 0 };
    }

    const candidates: Array<SearchHit & { haystack: string }> = [];
    const push = (
      kind: SearchKind,
      id: UUID,
      slug: string,
      title: string,
      subtitle: string,
      href: string,
      extra: string,
    ) => {
      candidates.push({
        kind,
        id,
        slug,
        title,
        subtitle,
        href,
        rank: 0,
        haystack: `${title} ${subtitle} ${extra}`,
      });
    };

    for (const agent of this.db.agents) {
      push(
        "agent",
        agent.id,
        agent.handle,
        agent.name,
        agent.tagline,
        `/agents/${agent.handle}`,
        `${agent.handle} ${agent.skills.join(" ")} ${agent.regions.join(" ")} ${agent.category}`,
      );
    }
    for (const gig of this.db.gigs) {
      if (gig.status !== "active") continue;
      push(
        "gig",
        gig.id,
        gig.slug,
        gig.title,
        gig.description,
        `/gigs/${gig.slug}`,
        `${gig.tags.join(" ")} ${gig.category}`,
      );
    }
    for (const job of this.db.jobs) {
      push("job", job.id, job.id, job.title, job.description, `/jobs/${job.id}`, job.category);
    }
    for (const guild of this.db.guilds) {
      push(
        "guild",
        guild.id,
        guild.slug,
        guild.name,
        guild.pipeline || guild.description,
        `/guilds/${guild.slug}`,
        guild.description,
      );
    }
    for (const channel of this.db.channels) {
      push(
        "channel",
        channel.id,
        channel.slug,
        channel.title,
        channel.description,
        `/tv/${channel.slug}`,
        `${channel.kind} ${channel.schedule}`,
      );
    }
    for (const item of this.db.marketItems) {
      push(
        "market_item",
        item.id,
        item.slug,
        item.title,
        item.description,
        `/market/${item.slug}`,
        `${item.tags.join(" ")} ${item.kind}`,
      );
    }
    for (const store of this.db.stores) {
      push("store", store.id, store.slug, store.name, store.tagline, `/stores/${store.slug}`, "");
    }

    return rankSearchHits(needle, candidates, limit);
  }

  /* ---------------------------------------------------------------- agents */

  async listAgents(filter: AgentFilter = {}): Promise<Agent[]> {
    const {
      q,
      category,
      room,
      status,
      maxPriceCents,
      skills,
      freeOnly,
      storeSlug,
      sort = "trending",
      limit = 48,
      offset = 0,
    } = filter;

    const storeId = storeSlug
      ? (this.db.stores.find((store) => store.slug === storeSlug)?.id ?? null)
      : null;
    const needle = q?.trim();

    const matching = this.db.agents.filter((agent) => {
      if (category && agent.category !== category) return false;
      if (room && agent.room_slug !== room) return false;
      if (status && agent.status !== status) return false;
      if (freeOnly && !agent.is_free) return false;
      if (storeSlug && agent.store_id !== storeId) return false;
      if (maxPriceCents !== undefined && agent.starting_price_cents > maxPriceCents) return false;
      if (skills && skills.length > 0) {
        const owned = agent.skills.map((skill) => skill.toLowerCase());
        const wanted = skills.map((skill) => skill.toLowerCase());
        if (!wanted.some((skill) => owned.some((have) => have.includes(skill)))) return false;
      }
      return true;
    });

    // Per-term, not whole-phrase: the Supabase adapter runs `q` through
    // `websearch_to_tsquery`, so anything else made the two modes disagree and
    // made every multi-word query return nothing in demo mode.
    const rows = needle
      ? filterByTerms(matching, needle, (agent) =>
          [
            agent.name,
            agent.handle,
            agent.tagline,
            agent.description,
            ...agent.skills,
            ...agent.regions,
          ].join(" "),
        )
      : matching;

    const sorted = rows.slice().sort((a, b) => {
      switch (sort) {
        case "rating":
          return b.rating_avg - a.rating_avg || b.rating_count - a.rating_count;
        case "price":
          return a.starting_price_cents - b.starting_price_cents;
        case "newest":
          return b.created_at.localeCompare(a.created_at);
        case "trending":
        default:
          return trendDeltaFor(b) - trendDeltaFor(a) || b.rating_avg - a.rating_avg;
      }
    });

    return sorted.slice(offset, offset + limit);
  }

  async getAgentByHandle(handle: Handle): Promise<Agent | null> {
    return this.db.agents.find((agent) => agent.handle === handle) ?? null;
  }

  async getAgentById(id: UUID): Promise<Agent | null> {
    return this.agentById(id);
  }

  async getTrendingAgents(limit = 5): Promise<TrendingAgent[]> {
    return this.db.agents
      .map((agent) => ({ ...agent, trendDelta: trendDeltaFor(agent) }))
      .sort((a, b) => b.trendDelta - a.trendDelta)
      .slice(0, limit);
  }

  async listCollaborators(handle: Handle, limit = 4): Promise<Agent[]> {
    const agent = this.requireAgentByHandle(handle);
    const guildIds = this.db.guildMembers
      .filter((member) => member.agent_id === agent.id)
      .map((member) => member.guild_id);
    const peerIds = new Set(
      this.db.guildMembers
        .filter((member) => guildIds.includes(member.guild_id) && member.agent_id !== agent.id)
        .map((member) => member.agent_id),
    );
    const peers = this.db.agents.filter((candidate) => peerIds.has(candidate.id));
    if (peers.length >= limit) return peers.slice(0, limit);

    const fillers = this.db.agents
      .filter(
        (candidate) =>
          candidate.id !== agent.id &&
          !peerIds.has(candidate.id) &&
          candidate.category === agent.category,
      )
      .sort((a, b) => b.rating_avg - a.rating_avg);
    return [...peers, ...fillers].slice(0, limit);
  }

  async listAgentsByOwner(ownerId: UUID): Promise<Agent[]> {
    return this.db.agents.filter((agent) => agent.owner_id === ownerId);
  }

  async createAgent(input: CreateAgentInput, ownerId: UUID): Promise<Agent> {
    const handle = slugify(input.handle);
    if (!handle) throw new ValidationError("A handle is required");
    if (this.db.agents.some((agent) => agent.handle === handle)) {
      throw new ConflictError(`@${handle} is already registered in the District`);
    }

    const timestamp = this.nowIso();
    const agent: Agent = {
      id: this.id(),
      handle,
      name: input.name,
      tagline: input.tagline,
      description: input.description ?? input.tagline,
      avatar_emoji: input.avatar_emoji ?? "🤖",
      avatar_gradient: input.avatar_gradient ?? "linear-gradient(135deg,#297dff,#7559ff)",
      owner_id: ownerId,
      store_id: input.store_id ?? null,
      category: input.category,
      skills: input.skills,
      regions: input.regions ?? ["US"],
      status: "available",
      room_slug: input.room_slug ?? ROOM_FOR_CATEGORY[input.category],
      pricing_model: input.pricing_model,
      starting_price_cents: input.starting_price_cents,
      verified: false,
      rating_avg: 0,
      rating_count: 0,
      jobs_completed: 0,
      repeat_hire_rate: 0,
      reliability: 0.95,
      dispute_rate: 0,
      avg_latency_sec: 120,
      endpoints: validateAgentEndpoints(input.endpoints),
      mcp_tools: input.mcp_tools ?? [],
      is_free: input.is_free ?? input.starting_price_cents === 0,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.db.agents.push(agent);
    this.db.presence.push({
      agent_id: agent.id,
      room_slug: agent.room_slug ?? ROOM_FOR_CATEGORY[agent.category],
      status: "available",
      capacity: 3,
      queue_len: 0,
      updated_at: timestamp,
    });

    await this.publishEvent({
      kind: "discovered",
      actor_type: "agent",
      actor_id: agent.id,
      actor_name: agent.name,
      headline: `${agent.name} joined the District`,
      body: agent.tagline,
      cta_label: "View passport",
      cta_href: `/agents/${agent.handle}`,
    });
    return agent;
  }

  async updateAgent(handle: Handle, patch: UpdateAgentInput, ownerId: UUID): Promise<Agent> {
    const agent = this.requireAgentByHandle(handle);
    if (agent.owner_id !== ownerId) throw new ForbiddenError("You do not own this agent");

    if (patch.name !== undefined) agent.name = patch.name;
    if (patch.tagline !== undefined) agent.tagline = patch.tagline;
    if (patch.description !== undefined) agent.description = patch.description;
    if (patch.avatar_emoji !== undefined) agent.avatar_emoji = patch.avatar_emoji;
    if (patch.avatar_gradient !== undefined) agent.avatar_gradient = patch.avatar_gradient;
    if (patch.category !== undefined) agent.category = patch.category;
    if (patch.skills !== undefined) agent.skills = patch.skills;
    if (patch.regions !== undefined) agent.regions = patch.regions;
    if (patch.pricing_model !== undefined) agent.pricing_model = patch.pricing_model;
    if (patch.starting_price_cents !== undefined) {
      agent.starting_price_cents = patch.starting_price_cents;
    }
    if (patch.room_slug !== undefined) agent.room_slug = patch.room_slug;
    if (patch.store_id !== undefined) agent.store_id = patch.store_id;
    if (patch.endpoints !== undefined) {
      agent.endpoints = validateAgentEndpoints(patch.endpoints);
    }
    if (patch.mcp_tools !== undefined) agent.mcp_tools = patch.mcp_tools;
    if (patch.is_free !== undefined) agent.is_free = patch.is_free;
    if (patch.status !== undefined) agent.status = patch.status;
    agent.updated_at = this.nowIso();
    return agent;
  }

  async updatePresence(agentHandle: Handle, input: UpdatePresenceInput): Promise<Presence> {
    const agent = this.requireAgentByHandle(agentHandle);
    // Same guard `updateAgent` applies — presence is part of an agent's public
    // record, so only its owner may move it.
    if (agent.owner_id !== input.ownerId) {
      throw new ForbiddenError("You do not own this agent");
    }
    let presence = this.db.presence.find((row) => row.agent_id === agent.id);
    if (!presence) {
      presence = {
        agent_id: agent.id,
        room_slug: input.roomSlug ?? ROOM_FOR_CATEGORY[agent.category],
        status: input.status,
        capacity: input.capacity ?? 3,
        queue_len: input.queueLen ?? 0,
        updated_at: this.nowIso(),
      };
      this.db.presence.push(presence);
    } else {
      presence.status = input.status;
      if (input.roomSlug !== undefined) presence.room_slug = input.roomSlug;
      if (input.capacity !== undefined) presence.capacity = input.capacity;
      if (input.queueLen !== undefined) presence.queue_len = input.queueLen;
      presence.updated_at = this.nowIso();
    }
    agent.status = input.status;
    if (input.roomSlug !== undefined) agent.room_slug = input.roomSlug;
    agent.updated_at = this.nowIso();
    return presence;
  }

  async listReviewsForAgent(handle: Handle, limit = 12): Promise<ReviewWithReviewer[]> {
    const agent = this.requireAgentByHandle(handle);
    return this.db.reviews
      .filter((review) => review.agent_id === agent.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((review) => ({ ...review, reviewer: this.profileById(review.reviewer_id) }));
  }

  /**
   * Reviews left on runs of one gig. Reviews point at an order, and an order
   * carries the gig it came from, so this is the gig-scoped counterpart to
   * `listReviewsForAgent` (which is broader — every run by that agent).
   */
  async listReviewsForGig(slug: Slug, limit = 12): Promise<ReviewWithReviewer[]> {
    const gig = this.db.gigs.find((row) => row.slug === slug);
    if (!gig) return [];
    const orderIds = new Set(
      this.db.orders.filter((order) => order.gig_id === gig.id).map((order) => order.id),
    );
    return this.db.reviews
      .filter((review) => review.order_id !== null && orderIds.has(review.order_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((review) => ({ ...review, reviewer: this.profileById(review.reviewer_id) }));
  }

  async createReview(input: CreateReviewInput, reviewerId: UUID): Promise<Review> {
    // `Number.isInteger` first: `NaN < 1` and `NaN > 5` are both false, so a
    // range check alone let an un-parsed rating through and folded `NaN` into
    // the agent's lifetime average, unrecoverably.
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new ValidationError("Rating must be a whole number between 1 and 5");
    }
    const order = this.db.orders.find((row) => row.id === input.orderId);
    if (!order) throw new NotFoundError("Order");
    if (order.buyer_id !== reviewerId) throw new ForbiddenError("Only the buyer can review a run");
    // Reputation only moves once money has actually moved, and never in favour
    // of your own agent — otherwise a creator can farm 5-star reviews on a free
    // package of their own gig, and rating is 35% of the ranking score.
    if (order.status !== "approved") {
      throw new ConflictError("Only an approved run can be reviewed");
    }
    if (this.requireAgentById(order.agent_id).owner_id === reviewerId) {
      throw new ForbiddenError("You cannot review your own agent");
    }
    if (this.db.reviews.some((review) => review.order_id === order.id)) {
      throw new ConflictError("This order already has a review");
    }
    // Free runs cost nothing to mint, so without this an agent's rating could
    // be walked anywhere at zero cost. One review per reviewer per agent from a
    // free run; a paid run is rate-limited by the buyer's own wallet.
    // `reviews_insert_reviewer` (0008) enforces the same rule in SQL.
    if (
      order.amount_cents === 0 &&
      this.db.reviews.some(
        (review) => review.agent_id === order.agent_id && review.reviewer_id === reviewerId,
      )
    ) {
      throw new ConflictError("You have already reviewed this agent from a free run");
    }

    const review: Review = {
      id: this.id(),
      order_id: order.id,
      agent_id: order.agent_id,
      reviewer_id: reviewerId,
      rating: Math.round(input.rating),
      body: input.body,
      created_at: this.nowIso(),
    };
    this.db.reviews.unshift(review);

    // Incremental rating update — never recomputed from the seeded sample,
    // which is deliberately smaller than the lifetime `rating_count`.
    const agent = this.requireAgentById(order.agent_id);
    agent.rating_avg =
      Math.round(
        ((agent.rating_avg * agent.rating_count + review.rating) / (agent.rating_count + 1)) * 100,
      ) / 100;
    agent.rating_count += 1;
    agent.updated_at = this.nowIso();

    const gig = this.gigById(order.gig_id);
    if (gig) {
      gig.rating_avg =
        Math.round(
          ((gig.rating_avg * gig.rating_count + review.rating) / (gig.rating_count + 1)) * 100,
        ) / 100;
      gig.rating_count += 1;
      gig.updated_at = this.nowIso();
    }

    return review;
  }

  /* -------------------------------------------------------- the entrance */

  async registerAgent(input: RegisterAgentInput): Promise<RegisteredAgent> {
    const registry = await this.getProfileByHandle(REGISTRY_PROFILE_HANDLE);
    if (!registry) throw new NotFoundError("The District registry profile");

    // `createAgent` owns handle validation, the taken-handle 409, presence and
    // the `discovered` event, so registration is genuinely the same front door
    // the onboarding wizard uses — only the owner and the credential differ.
    const agent = await this.createAgent(
      {
        handle: input.handle,
        name: input.name,
        tagline: input.tagline,
        description: input.description,
        avatar_emoji: input.avatar_emoji,
        avatar_gradient: input.avatar_gradient,
        category: input.category,
        skills: input.skills,
        regions: input.regions,
        pricing_model: input.pricing_model ?? "per_run",
        starting_price_cents: input.starting_price_cents ?? 0,
        endpoints: input.endpoints,
        mcp_tools: input.mcp_tools,
      },
      registry.id,
    );

    // An unclaimed stranger is **not online**. It has knocked on the door: it
    // can read the District, post to the feed and bid, but it does not count
    // towards `agentsOnline` and does not occupy a Lounge seat until a human
    // vouches for it in `claimAgent`. Without this, anyone with a curl loop
    // could inflate the District's headline counters and fill the Lounge scene
    // with agents nobody stands behind.
    agent.status = "offline";
    const presence = this.db.presence.find((row) => row.agent_id === agent.id);
    if (presence) presence.status = "offline";

    const rawApiKey = generateApiKey();
    this.db.apiKeys.unshift({
      id: this.id(),
      profile_id: registry.id,
      label: `@${agent.handle} (self-registered)`,
      key_hash: await hashApiKey(rawApiKey),
      key_prefix: apiKeyPrefix(rawApiKey),
      scopes: [...REGISTERED_AGENT_SCOPES],
      last_used_at: null,
      created_at: this.nowIso(),
      agent_id: agent.id,
    });

    const claimToken = generateClaimToken();
    this.agentClaims.set(await hashClaimToken(claimToken), {
      id: this.id(),
      agent_id: agent.id,
      token_hash: await hashClaimToken(claimToken),
      created_at: this.nowIso(),
      claimed_at: null,
      claimed_by: null,
    });

    return { agent, rawApiKey, claimToken };
  }

  async claimAgent(rawToken: string, profileId: UUID): Promise<Agent> {
    const claim = this.agentClaims.get(await hashClaimToken(rawToken));
    // Deliberately the same error for "no such token" and "malformed token":
    // a claim link is a bearer secret, and a distinguishable response turns
    // this endpoint into an oracle.
    if (!claim) throw new NotFoundError("That claim link");
    if (claim.claimed_at) {
      throw new ConflictError("This agent has already been claimed.");
    }
    const profile = this.profileById(profileId);
    if (!profile) throw new NotFoundError("Profile");

    const agent = this.requireAgentById(claim.agent_id);
    const timestamp = this.nowIso();
    agent.owner_id = profileId;
    agent.verified = true;
    // Vouched for, so now it is live: offline → available, on the agent and on
    // its Lounge presence row together, which is what keeps `agents.status`,
    // the Lounge scene and the network counters from disagreeing.
    agent.status = "available";
    agent.updated_at = timestamp;
    const presence = this.db.presence.find((row) => row.agent_id === agent.id);
    if (presence) {
      presence.status = "available";
      presence.updated_at = timestamp;
    }
    claim.claimed_at = timestamp;
    claim.claimed_by = profileId;

    // The agent's own key follows its owner. Without this the key still acts as
    // the registry after the claim, and `POST /api/v1/jobs/{id}/bids` — which
    // checks `agent.owner_id === profile.id` — would start refusing the agent's
    // own bids the moment its human claimed it.
    for (const key of this.db.apiKeys) {
      if (key.agent_id === agent.id) key.profile_id = profileId;
    }

    await this.publishEvent({
      kind: "available",
      actor_type: "agent",
      actor_id: agent.id,
      actor_name: agent.name,
      headline: `${agent.name} was claimed and verified`,
      body: `${profile.display_name} now owns this Passport.`,
      cta_label: "View passport",
      cta_href: `/agents/${agent.handle}`,
    });
    return agent;
  }

  async getAgentClaim(rawToken: string): Promise<AgentClaimPreview | null> {
    const claim = this.agentClaims.get(await hashClaimToken(rawToken));
    if (!claim) return null;
    const agent = this.agentById(claim.agent_id);
    if (!agent) return null;
    return {
      agent,
      claimed: claim.claimed_at !== null,
      claimed_at: claim.claimed_at,
      claimed_by: this.profileById(claim.claimed_by),
    };
  }

  /* ------------------------------------------------------------------ gigs */

  private withAgent(gig: Gig): GigWithAgent {
    return { ...gig, agent: this.requireAgentById(gig.agent_id) };
  }

  /** Every gig matching `filter`, sorted, *before* `limit`/`offset` is applied. */
  private matchingGigs(filter: GigFilter = {}): Gig[] {
    const { q, category, agentHandle, maxPriceCents, tags, sort = "trending" } = filter;
    const needle = q?.trim();
    // A list read returns an empty page for an unknown handle rather than
    // throwing — see the Repository contract in `lib/data/repository.ts`.
    const agentId = agentHandle
      ? (this.db.agents.find((agent) => agent.handle === agentHandle)?.id ?? MISSING)
      : null;
    if (agentId === MISSING) return [];

    const matching = this.db.gigs.filter((gig) => {
      if (gig.status !== "active") return false;
      if (category && gig.category !== category) return false;
      if (agentId && gig.agent_id !== agentId) return false;
      if (maxPriceCents !== undefined && gig.starting_price_cents > maxPriceCents) return false;
      if (tags && tags.length > 0) {
        const owned = gig.tags.map((tag) => tag.toLowerCase());
        if (!tags.some((tag) => owned.includes(tag.toLowerCase()))) return false;
      }
      return true;
    });

    const rows = needle
      ? filterByTerms(matching, needle, (gig) => {
          const agent = this.agentById(gig.agent_id);
          return [
            gig.title,
            gig.description,
            ...gig.tags,
            agent?.name ?? "",
            agent?.handle ?? "",
          ].join(" ");
        })
      : matching;

    const sorted = rows.slice().sort((a, b) => {
      switch (sort) {
        case "rating":
          return b.rating_avg - a.rating_avg || b.rating_count - a.rating_count;
        case "price":
          return a.starting_price_cents - b.starting_price_cents;
        case "newest":
          return b.created_at.localeCompare(a.created_at);
        case "fastest":
          return a.delivery_seconds - b.delivery_seconds;
        case "trending":
        default:
          return compareTrendingGigs(a, b);
      }
    });

    return sorted;
  }

  async listGigs(filter: GigFilter = {}): Promise<GigWithAgent[]> {
    const { limit = 48, offset = 0 } = filter;
    return this.matchingGigs(filter)
      .slice(offset, offset + limit)
      .map((gig) => this.withAgent(gig));
  }

  async countGigs(filter: GigFilter = {}): Promise<number> {
    return this.matchingGigs(filter).length;
  }

  async getGigBySlug(slug: Slug): Promise<GigWithAgent | null> {
    const gig = this.db.gigs.find((row) => row.slug === slug);
    return gig ? this.withAgent(gig) : null;
  }

  async getFeaturedGigs(limit = 3): Promise<GigWithAgent[]> {
    const featured = FEATURED_GIG_SLUGS.map((slug) =>
      this.db.gigs.find((gig) => gig.slug === slug),
    ).filter((gig): gig is Gig => Boolean(gig));

    const fillers = this.db.gigs
      .filter((gig) => !featured.includes(gig))
      .sort((a, b) => b.runs_count - a.runs_count);

    return [...featured, ...fillers].slice(0, limit).map((gig) => this.withAgent(gig));
  }

  async createGig(input: CreateGigInput, ownerId: UUID): Promise<Gig> {
    const agent = this.requireAgentByHandle(input.agentHandle);
    if (agent.owner_id !== ownerId) throw new ForbiddenError("You do not own this agent");
    if (input.packages.length === 0) throw new ValidationError("A gig needs at least one package");

    const base = slugify(input.slug ?? input.title) || `gig-${Date.now()}`;
    let slug = base;
    let suffix = 2;
    while (this.db.gigs.some((gig) => gig.slug === slug)) slug = `${base}-${suffix++}`;

    const timestamp = this.nowIso();
    const gig: Gig = {
      id: this.id(),
      slug,
      agent_id: agent.id,
      title: input.title,
      description: input.description,
      category: input.category,
      tags: input.tags ?? [],
      input_contract: input.input_contract,
      output_contract: input.output_contract,
      packages: input.packages,
      starting_price_cents: Math.min(...input.packages.map((pkg) => pkg.price_cents)),
      delivery_seconds: Math.min(...input.packages.map((pkg) => pkg.delivery_seconds)),
      runs_count: 0,
      rating_avg: 0,
      rating_count: 0,
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.db.gigs.push(gig);

    await this.publishEvent({
      kind: "gig_published",
      actor_type: "agent",
      actor_id: agent.id,
      actor_name: agent.name,
      headline: `${agent.name} published a new gig`,
      body: gig.title,
      cta_label: "View gig",
      cta_href: `/gigs/${gig.slug}`,
    });
    return gig;
  }

  async orderGig(input: OrderGigInput): Promise<Order> {
    const gig = this.db.gigs.find((row) => row.slug === input.gigSlug);
    if (!gig) throw new NotFoundError(`Gig ${input.gigSlug}`);
    if (gig.status !== "active") {
      throw new ConflictError("This gig is paused and is not taking new orders.");
    }
    const pkg = gig.packages.find((candidate) => candidate.tier === input.tier);
    if (!pkg) throw new ValidationError(`Gig ${gig.slug} has no ${input.tier} package`);
    const agent = this.requireAgentById(gig.agent_id);
    const brief = input.brief.trim();
    if (!brief) throw new ValidationError("A brief is required");

    const timestamp = this.nowIso();
    const order: Order = {
      id: this.id(),
      buyer_id: input.buyerId,
      agent_id: agent.id,
      gig_id: gig.id,
      job_id: null,
      bid_id: null,
      package_tier: pkg.tier,
      brief,
      amount_cents: pkg.price_cents,
      status: "queued",
      progress: 0,
      eta_seconds: pkg.delivery_seconds,
      started_at: timestamp,
      delivered_at: null,
      output: null,
      cost_breakdown: null,
      audit_log: [
        { at: timestamp, actor: "buyer", event: "order.created", detail: "Brief accepted, funds held." },
        {
          at: timestamp,
          actor: "district",
          event: "policy.checked",
          detail: "Spend limit and data policy verified.",
        },
        {
          at: timestamp,
          actor: `@${agent.handle}`,
          event: "run.started",
          detail: "Simulated run — no external calls were made.",
        },
      ],
      created_at: timestamp,
      updated_at: timestamp,
    };

    this.holdFunds(
      input.buyerId,
      order.amount_cents,
      order.id,
      `Hold — ${agent.name} · ${pkg.name}`,
      { approved: input.approved },
    );
    this.db.orders.unshift(order);
    gig.runs_count += 1;

    await this.publishEvent({
      kind: "hired",
      actor_type: "agent",
      actor_id: agent.id,
      actor_name: agent.name,
      headline: `${agent.name} was hired`,
      body: `${gig.title} · ${pkg.name}`,
      cta_label: "Watch the run",
      cta_href: `/orders/${order.id}`,
    });
    return order;
  }

  /* ------------------------------------------------------------------ jobs */

  private bidCount(jobId: UUID): number {
    return this.db.bids.filter((bid) => bid.job_id === jobId && bid.status !== "withdrawn").length;
  }

  async listJobs(filter: JobFilter = {}): Promise<JobWithBidCount[]> {
    const { q, category, status, posterId, sort = "newest", limit = 48, offset = 0 } = filter;
    const needle = q?.trim();

    const matching = this.db.jobs.filter((job) => {
      if (category && job.category !== category) return false;
      if (status && job.status !== status) return false;
      if (posterId && job.poster_id !== posterId) return false;
      return true;
    });
    const rows = needle
      ? filterByTerms(matching, needle, (job) => `${job.title} ${job.description}`)
      : matching;

    const decorated = rows.map((job) => ({ ...job, bidCount: this.bidCount(job.id) }));

    decorated.sort((a, b) => {
      switch (sort) {
        case "budget":
          return b.budget_cents - a.budget_cents;
        case "bids":
          return b.bidCount - a.bidCount;
        case "deadline":
          return a.deadline_seconds - b.deadline_seconds;
        case "newest":
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });

    return decorated.slice(offset, offset + limit);
  }

  async getJob(id: UUID): Promise<JobWithBids | null> {
    const job = this.db.jobs.find((row) => row.id === id);
    if (!job) return null;
    const bids: BidWithAgent[] = this.db.bids
      .filter((bid) => bid.job_id === job.id)
      .sort((a, b) => a.amount_cents - b.amount_cents)
      .map((bid) => ({
        ...bid,
        agent: this.requireAgentById(bid.agent_id),
        guild: bid.guild_id
          ? (this.db.guilds.find((guild) => guild.id === bid.guild_id) ?? null)
          : null,
      }));
    return { ...job, bids, poster: this.profileById(job.poster_id) };
  }

  async createJob(input: CreateJobInput, posterId: UUID): Promise<Job> {
    if (input.budget_cents <= 0) throw new ValidationError("Budget must be greater than zero");
    const timestamp = this.nowIso();
    const job: Job = {
      id: this.id(),
      title: input.title,
      description: input.description,
      category: input.category,
      budget_cents: input.budget_cents,
      deadline_seconds: input.deadline_seconds,
      required_output: input.required_output,
      data_policy: input.data_policy,
      poster_id: posterId,
      status: "open",
      awarded_bid_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.db.jobs.unshift(job);

    const poster = this.profileById(posterId);
    await this.publishEvent({
      kind: "job_posted",
      actor_type: "human",
      actor_id: posterId,
      actor_name: poster?.display_name ?? "A buyer",
      headline: "New job posted",
      body: job.title,
      cta_label: "Place a bid",
      cta_href: `/jobs/${job.id}`,
    });
    return job;
  }

  async placeBid(input: PlaceBidInput): Promise<Bid> {
    const job = this.db.jobs.find((row) => row.id === input.jobId);
    if (!job) throw new NotFoundError("Job");
    if (job.status !== "open") throw new ConflictError("This job is no longer open for bids");
    const agent = this.requireAgentByHandle(input.agentHandle);
    if (input.amountCents <= 0) throw new ValidationError("Bid amount must be greater than zero");
    // The reverse auction only means anything if the poster is not also the
    // seller: post → bid → award → approve would otherwise mint a completed job
    // for the price of one cent. The friendlier wording lives in the form
    // action; this is the trust boundary, so every caller hits it.
    if (job.poster_id === agent.owner_id) {
      throw new ForbiddenError("You cannot bid on your own bounty");
    }

    const guild = input.guildSlug
      ? (this.db.guilds.find((row) => row.slug === input.guildSlug) ?? null)
      : null;

    const bid: Bid = {
      id: this.id(),
      job_id: job.id,
      agent_id: agent.id,
      guild_id: guild?.id ?? null,
      amount_cents: input.amountCents,
      eta_seconds: input.etaSeconds,
      note: input.note,
      status: "pending",
      created_at: this.nowIso(),
    };
    this.db.bids.push(bid);

    await this.publishEvent({
      kind: "bid_placed",
      actor_type: "agent",
      actor_id: agent.id,
      actor_name: agent.name,
      headline: `${agent.name} bid on a job`,
      body: job.title,
      cta_label: "See bids",
      cta_href: `/jobs/${job.id}`,
    });
    return bid;
  }

  async listBidsForJobs(jobIds: UUID[]): Promise<Record<UUID, BidWithAgent[]>> {
    const wanted = new Set(jobIds);
    const out: Record<UUID, BidWithAgent[]> = {};
    for (const id of jobIds) out[id] = [];
    for (const bid of this.db.bids) {
      if (!wanted.has(bid.job_id)) continue;
      out[bid.job_id].push({
        ...bid,
        agent: this.requireAgentById(bid.agent_id),
        guild: this.db.guilds.find((guild) => guild.id === bid.guild_id) ?? null,
      });
    }
    for (const id of jobIds) {
      out[id].sort((a, b) => a.amount_cents - b.amount_cents || a.eta_seconds - b.eta_seconds);
    }
    return out;
  }

  async acceptBid(input: AcceptBidInput): Promise<Order> {
    const job = this.db.jobs.find((row) => row.id === input.jobId);
    if (!job) throw new NotFoundError("Job");
    if (job.poster_id !== input.buyerId) {
      throw new ForbiddenError("Only the job poster can award this job");
    }
    if (job.status !== "open") throw new ConflictError("This job has already been awarded");

    const bid = this.db.bids.find((row) => row.id === input.bidId && row.job_id === job.id);
    if (!bid) throw new NotFoundError("Bid");
    const agent = this.requireAgentById(bid.agent_id);
    // Mirror of the `placeBid` guard, for a bid that predates it.
    if (job.poster_id === agent.owner_id) {
      throw new ForbiddenError("You cannot award your own bounty to your own agent");
    }

    const timestamp = this.nowIso();
    const order: Order = {
      id: this.id(),
      buyer_id: input.buyerId,
      agent_id: agent.id,
      gig_id: null,
      job_id: job.id,
      bid_id: bid.id,
      package_tier: null,
      brief: job.description,
      amount_cents: bid.amount_cents,
      status: "queued",
      progress: 0,
      eta_seconds: bid.eta_seconds,
      started_at: timestamp,
      delivered_at: null,
      output: null,
      cost_breakdown: null,
      audit_log: [
        {
          at: timestamp,
          actor: "buyer",
          event: "order.created",
          detail: `Bid accepted for ${job.title}. Funds held.`,
        },
        {
          at: timestamp,
          actor: `@${agent.handle}`,
          event: "run.started",
          detail: "Simulated run — no external calls were made.",
        },
      ],
      created_at: timestamp,
      updated_at: timestamp,
    };

    this.holdFunds(
      input.buyerId,
      order.amount_cents,
      order.id,
      `Hold — ${agent.name} · ${job.title}`,
      { approved: input.approved },
    );

    bid.status = "accepted";
    for (const other of this.db.bids) {
      if (other.job_id === job.id && other.id !== bid.id && other.status === "pending") {
        other.status = "rejected";
      }
    }
    job.awarded_bid_id = bid.id;
    job.status = "in_progress";
    job.updated_at = timestamp;
    this.db.orders.unshift(order);

    await this.publishEvent({
      kind: "hired",
      actor_type: "agent",
      actor_id: agent.id,
      actor_name: agent.name,
      headline: `${agent.name} won a bounty`,
      body: job.title,
      cta_label: "Watch the run",
      cta_href: `/orders/${order.id}`,
    });
    return order;
  }

  /* ---------------------------------------------------------------- orders */

  /** Advances every match, then returns them newest-first (pre-pagination). */
  private async matchingOrders(filter: OrderFilter = {}): Promise<Order[]> {
    const { buyerId, agentHandle, status, jobId } = filter;
    const agentId = agentHandle
      ? (this.db.agents.find((agent) => agent.handle === agentHandle)?.id ?? MISSING)
      : null;
    if (agentId === MISSING) return [];

    const rows = this.db.orders.filter((order) => {
      if (buyerId && order.buyer_id !== buyerId) return false;
      if (agentId && order.agent_id !== agentId) return false;
      if (jobId && order.job_id !== jobId) return false;
      return true;
    });

    for (const order of rows) await this.advance(order);

    return rows
      .filter((order) => (status ? order.status === status : true))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async listOrders(filter: OrderFilter = {}): Promise<OrderDetail[]> {
    const { limit = 50, offset = 0 } = filter;
    const rows = await this.matchingOrders(filter);
    return rows.slice(offset, offset + limit).map((order) => this.decorateOrder(order));
  }

  async countOrders(filter: OrderFilter = {}): Promise<number> {
    return (await this.matchingOrders(filter)).length;
  }

  async getOrder(id: UUID): Promise<OrderDetail | null> {
    const order = this.db.orders.find((row) => row.id === id);
    if (!order) return null;
    await this.advance(order);
    return this.decorateOrder(order);
  }

  async refreshOrder(id: UUID): Promise<Order> {
    const order = this.db.orders.find((row) => row.id === id);
    if (!order) throw new NotFoundError("Order");
    return this.advance(order);
  }

  async approveOrder(id: UUID, buyerId: UUID): Promise<Order> {
    const order = this.db.orders.find((row) => row.id === id);
    if (!order) throw new NotFoundError("Order");
    if (order.buyer_id !== buyerId) throw new ForbiddenError("Only the buyer can approve this run");
    if (order.status === "approved") return order;

    await this.advance(order);
    if (order.status !== "delivered") {
      throw new ConflictError("This run has not been delivered yet");
    }

    const timestamp = this.nowIso();
    const agent = this.requireAgentById(order.agent_id);
    const amount = order.amount_cents;

    // Release the hold: the money leaves the wallet for good.
    const wallet = this.requireWallet(order.buyer_id);
    wallet.held_cents = Math.max(0, wallet.held_cents - amount);
    wallet.balance_cents = Math.max(0, wallet.balance_cents - amount);
    wallet.updated_at = timestamp;

    // The ledger is a display log — replace the hold row rather than adding a
    // second money-out row for the same order.
    const holdRow = this.db.walletTransactions.find(
      (tx) => tx.order_id === order.id && tx.kind === "hold",
    );
    const memo = `Released to ${agent.name} — ${order.brief.slice(0, 60)}`;
    if (holdRow) {
      holdRow.kind = "release";
      holdRow.memo = memo;
      holdRow.created_at = timestamp;
    } else {
      this.db.walletTransactions.unshift({
        id: this.id(),
        profile_id: order.buyer_id,
        kind: "release",
        amount_cents: -amount,
        order_id: order.id,
        memo,
        created_at: timestamp,
      });
    }

    order.status = "approved";
    order.progress = 100;
    order.cost_breakdown = costBreakdownFor(amount);
    order.audit_log = [
      ...order.audit_log,
      {
        at: timestamp,
        actor: "buyer",
        event: "order.approved",
        detail: "Hold released — 90% payout, 10% District fee.",
      },
    ];
    order.updated_at = timestamp;

    // Reputation.
    agent.jobs_completed += 1;
    agent.updated_at = timestamp;
    if (agent.store_id) {
      const store = this.db.stores.find((row) => row.id === agent.store_id);
      if (store) {
        store.hires_count += 1;
        store.updated_at = timestamp;
      }
    }
    const job = this.jobById(order.job_id);
    if (job) {
      job.status = "completed";
      job.updated_at = timestamp;
    }

    await this.publishEvent({
      kind: "approved",
      actor_type: "human",
      actor_id: order.buyer_id,
      actor_name: this.profileById(order.buyer_id)?.display_name ?? "A buyer",
      headline: `${agent.name} got paid`,
      body: order.brief.slice(0, 160),
      cta_label: "See the run",
      cta_href: `/orders/${order.id}`,
    });
    return order;
  }

  async disputeOrder(id: UUID, buyerId: UUID, reason: string): Promise<Order> {
    const order = this.db.orders.find((row) => row.id === id);
    if (!order) throw new NotFoundError("Order");
    if (order.buyer_id !== buyerId) throw new ForbiddenError("Only the buyer can dispute this run");
    if (order.status === "approved") throw new ConflictError("This run has already been approved");
    // Terminal states are already settled — disputing again would refund a
    // second time, releasing held credits that belong to other live orders.
    if (
      order.status === "disputed" ||
      order.status === "failed" ||
      order.status === "cancelled"
    ) {
      return order;
    }

    const timestamp = this.nowIso();
    order.status = "disputed";
    order.audit_log = [
      ...order.audit_log,
      { at: timestamp, actor: "buyer", event: "order.disputed", detail: reason },
    ];
    order.updated_at = timestamp;
    this.refundHold(order, `Refunded — disputed run (${reason.slice(0, 60)})`);
    return order;
  }

  /* --------------------------------------------------- guilds and stores */

  private guildWithMembers(guildId: UUID): GuildWithMembers | null {
    const guild = this.db.guilds.find((row) => row.id === guildId);
    if (!guild) return null;
    const rows = this.db.guildMembers
      .filter((member) => member.guild_id === guild.id)
      .sort((a, b) => a.position - b.position);
    const members = rows
      .map((member) => this.agentById(member.agent_id))
      .filter((agent): agent is Agent => Boolean(agent));
    return { ...guild, members, roles: rows.map((member) => member.role) };
  }

  async listGuilds(options: ListOptions = {}): Promise<GuildWithMembers[]> {
    const { limit = 12, offset = 0 } = options;
    return this.db.guilds
      .slice()
      .sort((a, b) => b.rating_avg - a.rating_avg || b.hires_count - a.hires_count)
      .slice(offset, offset + limit)
      .map((guild) => this.guildWithMembers(guild.id))
      .filter((guild): guild is GuildWithMembers => Boolean(guild));
  }

  async getGuildBySlug(slug: Slug): Promise<GuildWithMembers | null> {
    const guild = this.db.guilds.find((row) => row.slug === slug);
    return guild ? this.guildWithMembers(guild.id) : null;
  }

  async listStores(): Promise<StoreWithAgents[]> {
    return this.db.stores.map((store) => ({
      ...store,
      agents: this.db.agents.filter((agent) => agent.store_id === store.id),
      owner: this.profileById(store.owner_id),
    }));
  }

  async getStoreBySlug(slug: Slug): Promise<StoreDetail | null> {
    const store = this.db.stores.find((row) => row.slug === slug);
    if (!store) return null;
    const agents = this.db.agents.filter((agent) => agent.store_id === store.id);
    const agentIds = new Set(agents.map((agent) => agent.id));
    return {
      ...store,
      agents,
      owner: this.profileById(store.owner_id),
      gigs: this.db.gigs.filter((gig) => agentIds.has(gig.agent_id)),
    };
  }

  async listMarketItems(filter: MarketFilter = {}): Promise<MarketItemWithStore[]> {
    const { kind, q, limit = 48, offset = 0 } = filter;
    const needle = q?.trim();
    const matching = this.db.marketItems.filter((item) => !kind || item.kind === kind);
    return (
      needle
        ? filterByTerms(matching, needle, (item) =>
            [item.title, item.description, ...item.tags].join(" "),
          )
        : matching
    )
      .slice()
      .sort((a, b) => b.downloads - a.downloads)
      .slice(offset, offset + limit)
      .map((item) => ({
        ...item,
        store: item.seller_store_id
          ? (this.db.stores.find((store) => store.id === item.seller_store_id) ?? null)
          : null,
      }));
  }

  async getMarketItemBySlug(slug: Slug): Promise<MarketItemWithStore | null> {
    const item = this.db.marketItems.find((row) => row.slug === slug);
    if (!item) return null;
    return {
      ...item,
      store: item.seller_store_id
        ? (this.db.stores.find((store) => store.id === item.seller_store_id) ?? null)
        : null,
    };
  }

  /* -------------------------------------------------------------------- tv */

  private hostsFor(channelId: UUID): Agent[] {
    return this.db.channelHosts
      .filter((host) => host.channel_id === channelId)
      .sort((a, b) => a.position - b.position)
      .map((host) => this.agentById(host.agent_id))
      .filter((agent): agent is Agent => Boolean(agent));
  }

  async listChannels(filter: ChannelFilter = {}): Promise<ChannelWithHosts[]> {
    const { liveOnly, kind, limit = 24, offset = 0 } = filter;
    return this.db.channels
      .filter((channel) => {
        if (liveOnly && !channel.is_live) return false;
        if (kind && channel.kind !== kind) return false;
        return true;
      })
      .sort((a, b) => Number(b.is_live) - Number(a.is_live) || b.viewers - a.viewers)
      .slice(offset, offset + limit)
      .map((channel) => ({ ...channel, hosts: this.hostsFor(channel.id) }));
  }

  async setChannelFollow(slug: Slug, profileId: UUID, following: boolean): Promise<Channel> {
    const channel = this.db.channels.find((row) => row.slug === slug);
    if (!channel) throw new NotFoundError(`Channel ${slug}`);
    const key = `${channel.id}:${profileId}`;
    const had = this.channelFollows.has(key);
    if (following && !had) {
      this.channelFollows.add(key);
      channel.followers += 1;
    } else if (!following && had) {
      this.channelFollows.delete(key);
      channel.followers = Math.max(0, channel.followers - 1);
    }
    channel.updated_at = this.nowIso();
    return channel;
  }

  async listFollowedChannelSlugs(profileId: UUID): Promise<Slug[]> {
    const suffix = `:${profileId}`;
    const ids = new Set(
      [...this.channelFollows]
        .filter((key) => key.endsWith(suffix))
        .map((key) => key.slice(0, -suffix.length)),
    );
    return this.db.channels.filter((channel) => ids.has(channel.id)).map((channel) => channel.slug);
  }

  async getChannelBySlug(slug: Slug): Promise<ChannelDetail | null> {
    const channel = this.db.channels.find((row) => row.slug === slug);
    if (!channel) return null;
    const hosts = this.hostsFor(channel.id);
    const chat = this.db.channelChat
      .filter((message) => message.channel_id === channel.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const competition =
      this.db.competitions.find((row) => row.channel_id === channel.id) ?? null;
    return { ...channel, hosts, chat, competition };
  }

  async listCompetitions(filter: CompetitionFilter = {}): Promise<CompetitionWithEntries[]> {
    const { status, channelId, limit = 24, offset = 0 } = filter;
    return this.db.competitions
      .filter((competition) => {
        if (status && competition.status !== status) return false;
        if (channelId && competition.channel_id !== channelId) return false;
        return true;
      })
      .slice(offset, offset + limit)
      .map((competition) => ({
      ...competition,
      channel: this.db.channels.find((row) => row.id === competition.channel_id) ?? null,
      entries: this.db.competitionEntries
        .filter((entry) => entry.competition_id === competition.id)
        .sort((a, b) => b.progress - a.progress)
        .map((entry) => ({ ...entry, agent: this.requireAgentById(entry.agent_id) })),
      }));
  }

  async postChannelChat(slug: Slug, authorName: string, body: string): Promise<ChatMessage> {
    const channel = this.db.channels.find((row) => row.slug === slug);
    if (!channel) throw new NotFoundError(`Channel ${slug}`);
    if (!body.trim()) throw new ValidationError("Message body is required");
    const message: ChatMessage = {
      id: this.id(),
      channel_id: channel.id,
      author_name: authorName,
      body: body.trim(),
      created_at: this.nowIso(),
    };
    this.db.channelChat.push(message);
    return message;
  }

  /* ---------------------------------------------------------------- lounge */

  async listRooms(): Promise<RoomWithCounts[]> {
    return this.db.rooms
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((room) => {
        const rows = this.db.presence.filter((presence) => presence.room_slug === room.slug);
        return {
          ...room,
          presenceCount: rows.length,
          liveCount: rows.filter((row) =>
            ["live", "working", "collaborating"].includes(row.status),
          ).length,
          openSlots: rows.reduce(
            (total, row) => total + Math.max(0, row.capacity - row.queue_len),
            0,
          ),
        };
      });
  }

  async listPresence(roomSlug?: Slug): Promise<PresenceWithAgent[]> {
    return this.db.presence
      .filter((presence) => (roomSlug ? presence.room_slug === roomSlug : true))
      .map((presence) => {
        const agent = this.agentById(presence.agent_id);
        return agent ? { ...presence, agent } : null;
      })
      .filter((row): row is PresenceWithAgent => Boolean(row));
  }

  async listLoungeMessages(
    roomSlug?: Slug,
    limit = 30,
    since?: string,
  ): Promise<LoungeMessage[]> {
    return this.db.loungeMessages
      .filter((message) => (roomSlug ? message.room_slug === roomSlug : true))
      .filter((message) => (since ? message.created_at > since : true))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-limit);
  }

  async postLoungeMessage(input: PostLoungeMessageInput): Promise<LoungeMessage> {
    const body = input.body.trim();
    if (!body) throw new ValidationError("Message body is required");
    // In supabase mode the `room_slug` foreign key refuses an unknown room at
    // write time; without this the two adapters disagreed and the demo store
    // accumulated messages that render nowhere.
    if (input.roomSlug && !this.db.rooms.some((room) => room.slug === input.roomSlug)) {
      throw new NotFoundError("Room");
    }

    let authorName = "Someone";
    if (input.authorType === "agent") {
      authorName = this.requireAgentById(input.authorId).name;
    } else {
      authorName = this.profileById(input.authorId)?.display_name ?? "A human";
    }

    const message: LoungeMessage = {
      id: this.id(),
      room_slug: input.roomSlug ?? null,
      author_type: input.authorType,
      author_id: input.authorId,
      author_name: authorName,
      body,
      created_at: this.nowIso(),
    };
    this.db.loungeMessages.push(message);
    return message;
  }

  /* ----------------------------------------------------------------- inbox */

  private counterpartFor(agentId: UUID | null, profileId: UUID): Agent | Profile | null {
    if (agentId) return this.agentById(agentId);
    return this.profileById(profileId);
  }

  async listThreads(profileId: UUID): Promise<ThreadListItem[]> {
    return this.db.threads
      .filter((thread) => thread.profile_id === profileId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((thread) => ({
        ...thread,
        lastMessage:
          this.db.messages
            .filter((message) => message.thread_id === thread.id)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .at(-1) ?? null,
        counterpart: this.counterpartFor(thread.agent_id, thread.profile_id),
      }));
  }

  async getThread(id: UUID): Promise<ThreadWithMessages | null> {
    const thread = this.db.threads.find((row) => row.id === id);
    if (!thread) return null;
    return {
      ...thread,
      messages: this.db.messages
        .filter((message) => message.thread_id === thread.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      counterpart: this.counterpartFor(thread.agent_id, thread.profile_id),
    };
  }

  async markThreadRead(threadId: UUID, profileId: UUID): Promise<Thread> {
    const thread = this.db.threads.find((row) => row.id === threadId);
    if (!thread) throw new NotFoundError("Thread");
    if (thread.profile_id !== profileId) throw new ForbiddenError("This is not your conversation");
    thread.unread_count = 0;
    return thread;
  }

  async sendMessage(input: SendMessageInput): Promise<Message> {
    const thread = this.db.threads.find((row) => row.id === input.threadId);
    if (!thread) throw new NotFoundError("Thread");
    const body = input.body.trim();
    if (!body) throw new ValidationError("Message body is required");
    // Only the two participants may post: the profile the thread belongs to,
    // or the thread's agent (posting as itself). `markThreadRead` already
    // enforced this; sending did not, which is the half that mattered.
    if (input.senderType === "human") {
      if (thread.profile_id !== input.senderId) {
        throw new ForbiddenError("This is not your conversation");
      }
    } else if (thread.agent_id !== input.senderId) {
      throw new ForbiddenError("This agent is not part of that conversation");
    }

    const senderName =
      input.senderType === "agent"
        ? this.requireAgentById(input.senderId).name
        : (this.profileById(input.senderId)?.display_name ?? "You");

    const message: Message = {
      id: this.id(),
      thread_id: thread.id,
      sender_type: input.senderType,
      sender_id: input.senderId,
      sender_name: senderName,
      body,
      created_at: this.nowIso(),
    };
    this.db.messages.push(message);
    thread.updated_at = message.created_at;
    if (input.senderType === "human") thread.unread_count = 0;
    else thread.unread_count += 1;
    return message;
  }

  async createThread(input: CreateThreadInput): Promise<ThreadWithMessages> {
    const agent = this.requireAgentByHandle(input.agentHandle);
    const timestamp = this.nowIso();
    const thread = {
      id: this.id(),
      profile_id: input.profileId,
      agent_id: agent.id,
      subject: input.subject,
      unread_count: 0,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.db.threads.unshift(thread);
    const message = await this.sendMessage({
      threadId: thread.id,
      senderType: "human",
      senderId: input.profileId,
      body: input.body,
    });
    return { ...thread, messages: [message], counterpart: agent };
  }

  /* ---------------------------------------------------------------- wallet */

  async getWallet(profileId: UUID): Promise<Wallet | null> {
    const wallet = this.db.wallets.find((row) => row.profile_id === profileId);
    if (!wallet) return null;
    // Present the counter the way `hold_funds` reads it: a stale day is zero,
    // so the Command Center and the Workplace Gateway never show yesterday's
    // spend as though it counted against today's ceiling.
    return { ...wallet, spend_today_cents: this.spendToday(wallet) };
  }

  async listTransactions(profileId: UUID, limit = 20): Promise<WalletTransaction[]> {
    return this.db.walletTransactions
      .filter((tx) => tx.profile_id === profileId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async topUp(profileId: UUID, amountCents: number): Promise<Wallet> {
    if (amountCents <= 0) throw new ValidationError("Top-up must be greater than zero");
    const wallet = this.requireWallet(profileId);
    wallet.balance_cents += amountCents;
    wallet.updated_at = this.nowIso();
    this.db.walletTransactions.unshift({
      id: this.id(),
      profile_id: profileId,
      kind: "topup",
      amount_cents: amountCents,
      order_id: null,
      memo: "Added credits — demo top-up",
      created_at: this.nowIso(),
    });
    return wallet;
  }

  async updateWalletPolicy(profileId: UUID, patch: WalletPolicyPatch): Promise<Wallet> {
    const wallet = this.requireWallet(profileId);
    if (patch.approvalThresholdCents !== undefined) {
      if (patch.approvalThresholdCents < 0) {
        throw new ValidationError("The approval threshold cannot be negative");
      }
      wallet.approval_threshold_cents = Math.round(patch.approvalThresholdCents);
    }
    if (patch.autonomousSpendLimitCents !== undefined) {
      if (patch.autonomousSpendLimitCents < 0) {
        throw new ValidationError("The daily autonomous ceiling cannot be negative");
      }
      wallet.autonomous_spend_limit_cents = Math.round(patch.autonomousSpendLimitCents);
    }
    if (patch.autonomousPaused !== undefined) {
      wallet.autonomous_paused = patch.autonomousPaused;
    }
    wallet.updated_at = this.nowIso();
    return wallet;
  }

  /* -------------------------------------------------------------- profiles */

  async getProfile(id: UUID): Promise<Profile | null> {
    return this.profileById(id);
  }

  async getProfileByHandle(handle: Handle): Promise<Profile | null> {
    return this.db.profiles.find((profile) => profile.handle === handle) ?? null;
  }

  /** Demo mode is always signed in as the demo human, `austin`. */
  async getCurrentProfile(): Promise<Profile | null> {
    return this.getProfileByHandle(DEMO_PROFILE_HANDLE);
  }

  /* -------------------------------------------------------------- api keys */

  async listApiKeys(profileId: UUID): Promise<ApiKey[]> {
    return this.db.apiKeys
      .filter((key) => key.profile_id === profileId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const raw = generateApiKey();
    const record: ApiKey = {
      id: this.id(),
      profile_id: input.profileId,
      label: input.label,
      key_hash: await hashApiKey(raw),
      key_prefix: apiKeyPrefix(raw),
      scopes: input.scopes,
      last_used_at: null,
      created_at: this.nowIso(),
      agent_id: input.agentId ?? null,
    };
    this.db.apiKeys.unshift(record);
    return { key: raw, record };
  }

  async revokeApiKey(id: UUID, profileId: UUID): Promise<void> {
    const index = this.db.apiKeys.findIndex((key) => key.id === id);
    if (index === -1) throw new NotFoundError("API key");
    if (this.db.apiKeys[index].profile_id !== profileId) {
      throw new ForbiddenError("You do not own this API key");
    }
    this.db.apiKeys.splice(index, 1);
  }

  async verifyApiKey(rawKey: string): Promise<ApiKey | null> {
    const raw = rawKey.trim();
    if (!raw.startsWith(API_KEY_PREFIX)) return null;
    for (const record of this.db.apiKeys) {
      if (await apiKeyMatches(raw, record.key_hash)) {
        record.last_used_at = this.nowIso();
        return record;
      }
    }
    return null;
  }
}

/**
 * A `DemoRepository` whose reads hand back **copies**.
 *
 * The adapter serves rows straight out of its in-memory store, so without this
 * a caller would be holding a live reference: read a wallet, order a gig, and
 * the "before" snapshot would have silently changed underneath them (and a
 * component that pushed onto `agent.skills` would corrupt the store). Every
 * method's resolved value is structured-cloned on the way out; `subscribe` is
 * exempt because it returns a function.
 */
export function createDemoRepository(
  options: { now?: () => number; dataset?: DistrictDataset } = {},
): DemoRepository {
  const repository = new DemoRepository(options);

  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function" || property === "subscribe") return value;

      return (...args: unknown[]) => {
        const result = (value as (...callArgs: unknown[]) => unknown).apply(target, args);
        return result instanceof Promise ? result.then(copyOut) : result;
      };
    },
  });
}

function copyOut<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  return structuredClone(value);
}
