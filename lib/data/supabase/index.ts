import type { SupabaseClient } from "@supabase/supabase-js";
import { runtimeFor } from "@/lib/runtime";
import { validateAgentEndpoints } from "../endpoints";
import { computeProgress, costBreakdownFor, projectedStatus } from "@/lib/runtime/progress";
import { FEATURED_GIG_SLUGS } from "@/lib/seed";
import { ROOM_FOR_CATEGORY } from "@/lib/seed/rooms";
import { slugify } from "@/lib/utils";
import {
  ConflictError,
  ForbiddenError,
  InsufficientFundsError,
  NotFoundError,
  UpstreamError,
  ValidationError,
} from "../errors";
import {
  API_KEY_PREFIX,
  apiKeyPrefix,
  generateApiKey,
  generateClaimToken,
  hashApiKey,
  hashClaimToken,
  sha256Hex,
} from "../hash";
import type { Repository, RepositoryMode } from "../repository";
import { compareTrendingGigs, trendingAgentScore } from "../trending";

/**
 * How many rows the trending sort re-ranks in memory. The score is computed,
 * not a column, so PostgREST cannot order by it; this is the window it is
 * applied to (`runs_count` desc is its dominant term, so the tail it drops
 * could not have reached the front of the page).
 */
const TRENDING_POOL = 240;
import { sha1Hex } from "@/lib/seed/uuid";
import {
  asRow,
  asRows,
  toAgent,
  toAgentClaim,
  toApiKey,
  toBid,
  toChannel,
  toChatMessage,
  toCompetition,
  toCompetitionEntry,
  toDistrictAnalytics,
  toEvent,
  toGig,
  toGuild,
  toGuildMember,
  toJob,
  toLoungeMessage,
  toMarketItem,
  toMessage,
  toNetworkCounts,
  toOrder,
  toPresence,
  toProfile,
  toReview,
  toRoom,
  toRoomCounts,
  toStore,
  toThread,
  toWallet,
  toWalletTransaction,
  type Row,
} from "./mappers";
import type {
  AcceptBidInput,
  Agent,
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
  DistrictAnalytics,
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
  UpdateProfileInput,
  Wallet,
  WalletPolicyPatch,
  WalletTransaction,
} from "../types";
import { REGISTERED_AGENT_SCOPES } from "../types";
import { emptySearchCounts, searchHrefFor, summariseHits } from "../search";

/**
 * The Postgres adapter (BUILD_SPEC §2).
 *
 * Same semantics as the demo adapter, backed by the schema in
 * `supabase/migrations/`. Three things to know:
 *
 * 1. **The client is injected.** `lib/data/index.ts` passes a factory that
 *    lazily imports `lib/supabase/server`, so this module never pulls
 *    `next/headers` into a test or a non-request context.
 * 2. **RLS is the authorisation layer.** Reads of marketplace tables work with
 *    the anon key; `orders`, `wallets`, `threads`, `messages` and `api_keys`
 *    are `to authenticated` and scoped to `auth.uid()`, so they come back
 *    *empty* rather than erroring when signed out.
 * 3. **Multi-step mutations are not transactional.** `orderGig`, `acceptBid`
 *    and `approveOrder` issue several statements; a mid-sequence failure can
 *    leave a hold without an order. Wrap them in SQL functions before running
 *    real money through this.
 */
/**
 * How many agents to pull before an in-memory `trendingAgentScore` sort.
 * Comfortably above the seeded roster; the demo adapter sorts the whole set.
 */
const TRENDING_WINDOW = 200;

export type SupabaseRepositoryOptions = {
  /**
   * Act as this profile without a Supabase session.
   *
   * Set only for a **service-role** client, which is how an API-key (or MCP)
   * caller reaches Postgres: it authenticates at the app layer and has no JWT,
   * so `auth.uid()` would be null and every RLS-scoped read came back empty
   * while every write was refused. The money/event RPCs take the same id as
   * `p_actor`, which they honour only for the service role.
   */
  actAs?: UUID;
};

export class SupabaseRepository implements Repository {
  readonly mode: RepositoryMode = "supabase";

  private readonly actAs: UUID | null;

  constructor(
    private readonly clientFactory: () => Promise<SupabaseClient | null>,
    options: SupabaseRepositoryOptions = {},
  ) {
    this.actAs = options.actAs ?? null;
  }

  /** The id the SECURITY DEFINER functions should treat as the caller. */
  private actor(): UUID | null {
    return this.actAs;
  }

  /* ------------------------------------------------------------- internals */

  private async client(): Promise<SupabaseClient> {
    const client = await this.clientFactory();
    if (!client) throw new UpstreamError("Supabase is not configured");
    return client;
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  /** Await a PostgREST builder, throw on error, map the rows. */
  private async many<T>(
    query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
    map: (row: Row) => T,
  ): Promise<T[]> {
    const { data, error } = await query;
    if (error) throw new UpstreamError(error.message);
    return asRows(data).map(map);
  }

  /** Same, for a `.maybeSingle()` builder. */
  private async one<T>(
    query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
    map: (row: Row) => T,
  ): Promise<T | null> {
    const { data, error } = await query;
    if (error) throw new UpstreamError(error.message);
    if (!data) return null;
    return map(asRow(data));
  }

  private async requireAgentByHandle(handle: Handle): Promise<Agent> {
    const agent = await this.getAgentByHandle(handle);
    if (!agent) throw new NotFoundError(`Agent @${handle}`);
    return agent;
  }

  private async agentsByIds(ids: UUID[]): Promise<Map<UUID, Agent>> {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) return new Map();
    const client = await this.client();
    const agents = await this.many(
      client.from("agents").select("*").in("id", unique),
      toAgent,
    );
    return new Map(agents.map((agent) => [agent.id, agent]));
  }

  private async gigById(id: UUID | null): Promise<Gig | null> {
    if (!id) return null;
    const client = await this.client();
    return this.one(client.from("gigs").select("*").eq("id", id).maybeSingle(), toGig);
  }

  private async jobById(id: UUID | null): Promise<Job | null> {
    if (!id) return null;
    const client = await this.client();
    return this.one(client.from("jobs").select("*").eq("id", id).maybeSingle(), toJob);
  }

  private async orderRow(id: UUID): Promise<Order> {
    const client = await this.client();
    const order = await this.one(
      client.from("orders").select("*").eq("id", id).maybeSingle(),
      toOrder,
    );
    if (!order) throw new NotFoundError("Order");
    return order;
  }

  private async decorateOrders(orders: Order[]): Promise<OrderDetail[]> {
    const agents = await this.agentsByIds(orders.map((order) => order.agent_id));
    return Promise.all(
      orders.map(async (order) => ({
        ...order,
        agent: agents.get(order.agent_id) ?? (await this.requireAgentById(order.agent_id)),
        gig: await this.gigById(order.gig_id),
        job: await this.jobById(order.job_id),
        buyer: await this.getProfile(order.buyer_id),
      })),
    );
  }

  private async requireAgentById(id: UUID): Promise<Agent> {
    const client = await this.client();
    const agent = await this.one(
      client.from("agents").select("*").eq("id", id).maybeSingle(),
      toAgent,
    );
    if (!agent) throw new NotFoundError("Agent");
    return agent;
  }

  /**
   * Hold funds through the SECURITY DEFINER `hold_funds()` RPC, which re-checks
   * available balance, the Workplace Gateway approval threshold and the daily
   * autonomous spend limit inside one `for update` transaction. The money
   * columns of `wallets` are revoked from `authenticated` (0005_hardening.sql),
   * so this is the only way credits can move.
   */
  private async holdFunds(
    profileId: UUID,
    amount: number,
    orderId: UUID,
    memo: string,
    options: { approved?: boolean } = {},
  ): Promise<void> {
    const client = await this.client();
    const { error } = await client.rpc("hold_funds", {
      p_order_id: orderId,
      p_amount: amount,
      p_memo: memo,
      p_approved: options.approved ?? false,
      p_actor: this.actor(),
    });
    if (!error) return;

    const message = error.message ?? "";
    if (/insufficient funds/i.test(message)) {
      throw new InsufficientFundsError(message);
    }
    if (/approval required|spend limit/i.test(message)) {
      throw new ConflictError(message);
    }
    if (/wallet not found/i.test(message)) throw new NotFoundError("Wallet");
    throw new UpstreamError(message);
  }

  /** Settle an order's hold: pay it out, or refund it to the buyer. */
  private async settleHold(
    orderId: UUID,
    memo: string,
    options: { refund?: boolean } = {},
  ): Promise<void> {
    const client = await this.client();
    const { error } = await client.rpc("settle_hold", {
      p_order_id: orderId,
      p_memo: memo,
      p_refund: options.refund ?? false,
      p_actor: this.actor(),
    });
    if (error) throw new UpstreamError(error.message);
  }

  /**
   * The only writer of an order's money/state columns — they are revoked from
   * `authenticated` in 0005_hardening.sql, so a PostgREST `update()` on them
   * would silently match zero rows.
   */
  private async advanceOrderRow(
    orderId: UUID,
    patch: {
      status?: Order["status"];
      progress?: number;
      output?: Order["output"];
      cost?: Order["cost_breakdown"];
      deliveredAt?: string | null;
      audit?: Order["audit_log"];
    },
  ): Promise<Order | null> {
    const client = await this.client();
    const { data, error } = await client.rpc("advance_order", {
      p_order_id: orderId,
      p_status: patch.status ?? null,
      p_progress: patch.progress ?? null,
      p_output: patch.output ?? null,
      p_cost: patch.cost ?? null,
      p_delivered_at: patch.deliveredAt ?? null,
      p_audit: patch.audit ?? null,
      p_actor: this.actor(),
    });
    if (error) throw new UpstreamError(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return row ? toOrder(asRow(row)) : null;
  }

  /* ----------------------------------------------------------------- stats */

  async getNetworkStats(): Promise<NetworkStats> {
    const client = await this.client();
    const { data, error } = await client.rpc("network_stats");
    if (error) throw new UpstreamError(error.message);
    const real = toNetworkCounts(data);
    return real;
  }

  /**
   * One SECURITY DEFINER call (0010), because the honest version of this query
   * is eight aggregates over tables the browser cannot read: `orders` and
   * `agent_claims` are private under RLS, so a client-side roll-up would report
   * the operator's *own* rows and call it the District.
   *
   * The function raises for a non-admin caller, which surfaces here as an
   * `UpstreamError`. `/analytics` never gets that far — it checks
   * `profile.is_admin` and answers `notFound()` — so this path only runs for
   * operators.
   */
  async getDistrictAnalytics(): Promise<DistrictAnalytics> {
    const client = await this.client();
    const { data, error } = await client.rpc("district_analytics");
    if (error) throw new UpstreamError(error.message);
    return toDistrictAnalytics(data);
  }

  async listEvents(filter: EventFilter = {}): Promise<DistrictEvent[]> {
    const { limit = 20, offset = 0, kind, kinds } = filter;
    const client = await this.client();
    let query = client
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (kind) query = query.eq("kind", kind);
    if (kinds && kinds.length > 0) query = query.in("kind", kinds);
    return this.many(query, toEvent);
  }

  /**
   * Events go through the SECURITY DEFINER `publish_event()` RPC.
   *
   * A marketplace lifecycle event names the *agent* as actor but is written by
   * the buyer, who does not own that agent — a direct insert is refused by
   * `events_insert_authenticated`, which used to turn every hire, award and
   * delivery into a 500 *after* the order and the wallet hold had been written.
   */
  async publishEvent(input: PublishEventInput): Promise<DistrictEvent> {
    const client = await this.client();
    const { data, error } = await client.rpc("publish_event", {
      p_kind: input.kind,
      p_actor_type: input.actor_type,
      p_actor_id: input.actor_id ?? null,
      p_actor_name: input.actor_name,
      p_headline: input.headline,
      p_body: input.body,
      p_cta_label: input.cta_label ?? null,
      p_cta_href: input.cta_href ?? null,
      p_actor: this.actor(),
    });
    if (error) throw new UpstreamError(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new UpstreamError("Event was not written");
    return toEvent(asRow(row));
  }

  /**
   * Publish an event without ever failing the caller. The District feed is
   * decoration — a feed write must not be able to roll back a hire.
   */
  private async publishEventBestEffort(input: PublishEventInput): Promise<void> {
    try {
      await this.publishEvent(input);
    } catch {
      /* the feed is not worth failing a money mutation over */
    }
  }

  /* ---------------------------------------------------------------- search */

  /**
   * One `search_district()` call across agents, gigs, jobs, guilds, channels,
   * market items and stores. The RPC is `stable` and granted to `anon`, so the
   * results page works for a signed-out visitor and for a machine caller.
   */
  async searchDistrict(query: string, limit = 24): Promise<SearchResults> {
    const needle = query.trim();
    if (!needle) return { query: "", hits: [], counts: emptySearchCounts(), total: 0 };

    const client = await this.client();
    const { data, error } = await client.rpc("search_district", {
      p_query: needle,
      p_limit: Math.max(1, Math.min(limit, 100)),
    });
    if (error) throw new UpstreamError(error.message);

    const hits: SearchHit[] = asRows(data).map((row) => {
      const kind = String(row.kind ?? "agent") as SearchKind;
      const slug = String(row.slug ?? "");
      return {
        kind,
        id: String(row.id ?? ""),
        slug,
        title: String(row.title ?? ""),
        subtitle: String(row.subtitle ?? ""),
        href: searchHrefFor(kind, slug),
        rank: Number(row.rank ?? 0),
      };
    });
    return summariseHits(needle, hits);
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
    const client = await this.client();

    // Full-text search runs through the GIN-indexed SQL function; the other
    // predicates are then applied in memory over that (already small) set.
    if (q && q.trim()) {
      const { data, error } = await client.rpc("search_agents", {
        p_query: q.trim(),
        p_limit: Math.max(limit * 3, 48),
      });
      if (error) throw new UpstreamError(error.message);
      const rows = asRows(data).map(toAgent);
      return sortAgents(
        rows.filter((agent) =>
          matchesAgentFilter(agent, { category, room, status, maxPriceCents, skills, freeOnly }),
        ),
        sort,
      ).slice(offset, offset + limit);
    }

    let query = client.from("agents").select("*");
    if (category) query = query.eq("category", category);
    if (room) query = query.eq("room_slug", room);
    if (status) query = query.eq("status", status);
    if (freeOnly) query = query.eq("is_free", true);
    if (maxPriceCents !== undefined) query = query.lte("starting_price_cents", maxPriceCents);
    if (skills && skills.length > 0) query = query.overlaps("skills", skills);
    if (storeSlug) {
      const store = await this.one(
        client.from("stores").select("id").eq("slug", storeSlug).maybeSingle(),
        (row) => String(row.id ?? ""),
      );
      query = query.eq("store_id", store ?? "");
    }

    // The trending score is a per-handle table in `lib/data/trending`, not a
    // column, so no SQL ordering matches it. Paginating in SQL and then
    // re-sorting in memory would sort *after* the page was chosen and return a
    // different set from the demo adapter; instead fetch a window and slice it.
    if (sort === "trending") {
      const rows = await this.many(query.limit(TRENDING_WINDOW), toAgent);
      return sortAgents(rows, sort).slice(offset, offset + limit);
    }

    switch (sort) {
      case "rating":
        query = query.order("rating_avg", { ascending: false });
        break;
      case "price":
        query = query.order("starting_price_cents", { ascending: true });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    return this.many(query.range(offset, offset + limit - 1), toAgent);
  }

  async getAgentByHandle(handle: Handle): Promise<Agent | null> {
    const client = await this.client();
    return this.one(
      client.from("agents").select("*").eq("handle", handle).maybeSingle(),
      toAgent,
    );
  }

  async getAgentById(id: UUID): Promise<Agent | null> {
    const client = await this.client();
    return this.one(client.from("agents").select("*").eq("id", id).maybeSingle(), toAgent);
  }

  async getTrendingAgents(limit = 5): Promise<TrendingAgent[]> {
    const client = await this.client();
    const agents = await this.many(
      client.from("agents").select("*").neq("status", "offline").limit(200),
      toAgent,
    );
    // `trendingAgentScore` is an ordering key only — nothing is attached to the
    // row, so what comes back is a plain `Agent` in both modes.
    return agents
      .sort((a, b) => trendingAgentScore(b) - trendingAgentScore(a))
      .slice(0, limit);
  }

  async listCollaborators(handle: Handle, limit = 4): Promise<Agent[]> {
    const agent = await this.requireAgentByHandle(handle);
    const client = await this.client();
    const memberships = await this.many(
      client.from("guild_members").select("*").eq("agent_id", agent.id),
      toGuildMember,
    );
    const guildIds = memberships.map((member) => member.guild_id);
    if (guildIds.length === 0) {
      return this.many(
        client
          .from("agents")
          .select("*")
          .eq("category", agent.category)
          .neq("id", agent.id)
          .order("rating_avg", { ascending: false })
          .limit(limit),
        toAgent,
      );
    }
    const peers = await this.many(
      client.from("guild_members").select("*").in("guild_id", guildIds),
      toGuildMember,
    );
    const peerIds = peers.map((peer) => peer.agent_id).filter((id) => id !== agent.id);
    const byId = await this.agentsByIds(peerIds);
    return [...byId.values()].slice(0, limit);
  }

  async listAgentsByOwner(ownerId: UUID): Promise<Agent[]> {
    const client = await this.client();
    return this.many(client.from("agents").select("*").eq("owner_id", ownerId), toAgent);
  }

  async createAgent(input: CreateAgentInput, ownerId: UUID): Promise<Agent> {
    const handle = slugify(input.handle);
    if (!handle) throw new ValidationError("A handle is required");
    const client = await this.client();

    const existing = await this.getAgentByHandle(handle);
    if (existing) throw new ConflictError(`@${handle} is already registered in the District`);

    const agent = await this.one(
      client
        .from("agents")
        .insert({
          handle,
          name: input.name,
          tagline: input.tagline,
          description: input.description ?? input.tagline,
          avatar_emoji: input.avatar_emoji ?? "🤖",
          avatar_gradient:
            input.avatar_gradient ?? "linear-gradient(135deg,#297dff,#7559ff)",
          owner_id: ownerId,
          store_id: input.store_id ?? null,
          category: input.category,
          skills: input.skills,
          regions: input.regions ?? ["US"],
          status: "available",
          room_slug: input.room_slug ?? ROOM_FOR_CATEGORY[input.category],
          pricing_model: input.pricing_model,
          starting_price_cents: input.starting_price_cents,
          endpoints: validateAgentEndpoints(input.endpoints),
          mcp_tools: input.mcp_tools ?? [],
          is_free: input.is_free ?? input.starting_price_cents === 0,
        })
        .select("*")
        .maybeSingle(),
      toAgent,
    );
    if (!agent) throw new UpstreamError("Agent was not created");

    await client.from("presence").upsert({
      agent_id: agent.id,
      room_slug: agent.room_slug ?? ROOM_FOR_CATEGORY[agent.category],
      status: "available",
      capacity: 3,
      queue_len: 0,
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
    const agent = await this.requireAgentByHandle(handle);
    if (agent.owner_id !== ownerId) throw new ForbiddenError("You do not own this agent");
    const client = await this.client();

    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.tagline !== undefined) update.tagline = patch.tagline;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.avatar_emoji !== undefined) update.avatar_emoji = patch.avatar_emoji;
    if (patch.avatar_gradient !== undefined) update.avatar_gradient = patch.avatar_gradient;
    if (patch.category !== undefined) update.category = patch.category;
    if (patch.skills !== undefined) update.skills = patch.skills;
    if (patch.regions !== undefined) update.regions = patch.regions;
    if (patch.pricing_model !== undefined) update.pricing_model = patch.pricing_model;
    if (patch.starting_price_cents !== undefined) {
      update.starting_price_cents = patch.starting_price_cents;
    }
    if (patch.room_slug !== undefined) update.room_slug = patch.room_slug;
    if (patch.store_id !== undefined) update.store_id = patch.store_id;
    if (patch.endpoints !== undefined) {
      update.endpoints = validateAgentEndpoints(patch.endpoints);
    }
    if (patch.mcp_tools !== undefined) update.mcp_tools = patch.mcp_tools;
    if (patch.is_free !== undefined) update.is_free = patch.is_free;
    if (patch.status !== undefined) update.status = patch.status;

    const updated = await this.one(
      client.from("agents").update(update).eq("id", agent.id).select("*").maybeSingle(),
      toAgent,
    );
    if (!updated) throw new UpstreamError("Agent was not updated");
    return updated;
  }

  async updatePresence(agentHandle: Handle, input: UpdatePresenceInput): Promise<Presence> {
    const agent = await this.requireAgentByHandle(agentHandle);
    // Same guard `updateAgent` applies. RLS also enforces it on the row, but a
    // clear ForbiddenError beats PostgREST's silent zero-row update.
    if (agent.owner_id !== input.ownerId) {
      throw new ForbiddenError("You do not own this agent");
    }
    const client = await this.client();
    const presence = await this.one(
      client
        .from("presence")
        .upsert({
          agent_id: agent.id,
          room_slug: input.roomSlug ?? agent.room_slug ?? ROOM_FOR_CATEGORY[agent.category],
          status: input.status,
          capacity: input.capacity ?? 3,
          queue_len: input.queueLen ?? 0,
          updated_at: this.nowIso(),
        })
        .select("*")
        .maybeSingle(),
      toPresence,
    );
    if (!presence) throw new UpstreamError("Presence was not written");

    await client
      .from("agents")
      .update({
        status: input.status,
        ...(input.roomSlug !== undefined ? { room_slug: input.roomSlug } : {}),
      })
      .eq("id", agent.id);
    return presence;
  }

  async listReviewsForAgent(handle: Handle, limit = 12): Promise<ReviewWithReviewer[]> {
    const agent = await this.requireAgentByHandle(handle);
    const client = await this.client();
    const reviews = await this.many(
      client
        .from("reviews")
        .select("*")
        .eq("agent_id", agent.id)
        .order("created_at", { ascending: false })
        .limit(limit),
      toReview,
    );
    const reviewerIds = [...new Set(reviews.map((review) => review.reviewer_id))];
    const profiles = reviewerIds.length
      ? await this.many(client.from("profiles").select("*").in("id", reviewerIds), toProfile)
      : [];
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return reviews.map((review) => ({
      ...review,
      reviewer: byId.get(review.reviewer_id) ?? null,
    }));
  }

  async createReview(input: CreateReviewInput, reviewerId: UUID): Promise<Review> {
    // `Number.isInteger` first: both `NaN < 1` and `NaN > 5` are false, so a
    // range check alone lets an un-parsed rating through.
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new ValidationError("Rating must be a whole number between 1 and 5");
    }
    const order = await this.orderRow(input.orderId);
    if (order.buyer_id !== reviewerId) throw new ForbiddenError("Only the buyer can review a run");
    // Reputation only moves once money has, and never in your own favour: a
    // creator reviewing their own agent would buy the ranking signal outright.
    if (order.status !== "approved") {
      throw new ConflictError("Only an approved run can be reviewed");
    }
    const reviewed = await this.requireAgentById(order.agent_id);
    if (reviewed.owner_id === reviewerId) {
      throw new ForbiddenError("You cannot review your own agent");
    }

    const client = await this.client();
    const existing = await this.one(
      client.from("reviews").select("id").eq("order_id", order.id).maybeSingle(),
      (row) => String(row.id ?? ""),
    );
    if (existing) throw new ConflictError("This order already has a review");
    // Free runs cost nothing to mint — one review per reviewer per agent from
    // one. `reviews_insert_reviewer` (0008) enforces the same rule in SQL.
    if (order.amount_cents === 0) {
      const prior = await this.one(
        client
          .from("reviews")
          .select("id")
          .eq("agent_id", order.agent_id)
          .eq("reviewer_id", reviewerId)
          .limit(1)
          .maybeSingle(),
        (row) => String(row.id ?? ""),
      );
      if (prior) throw new ConflictError("You have already reviewed this agent from a free run");
    }

    const rating = Math.round(input.rating);
    const review = await this.one(
      client
        .from("reviews")
        .insert({
          order_id: order.id,
          agent_id: order.agent_id,
          reviewer_id: reviewerId,
          rating,
          body: input.body,
        })
        .select("*")
        .maybeSingle(),
      toReview,
    );
    if (!review) throw new UpstreamError("Review was not written");

    // Incremental, never a recount: `rating_count` is a lifetime figure and the
    // reviews table only holds a recent sample. It runs through a SECURITY
    // DEFINER RPC because the reviewer is by construction *not* the agent's
    // owner — a direct update matched zero rows and silently did nothing.
    const { error } = await client.rpc("apply_review_rating", {
      p_agent_id: order.agent_id,
      p_rating: rating,
      p_gig_id: order.gig_id,
      p_actor: this.actor(),
    });
    if (error) throw new UpstreamError(error.message);

    return review;
  }

  /* -------------------------------------------------------- the entrance */

  /**
   * Registration is one `register_agent()` call, not six statements.
   *
   * Every write it performs is refused for the caller that makes it: the
   * request carries **no credential at all** (that is the point of an open
   * front door), so `auth.uid()` is null, the agent would be inserted with an
   * owner the caller is not, and `api_keys` / `agent_claims` are private under
   * RLS. The SECURITY DEFINER function in 0009 is the one narrow hole, and it
   * is also the only way the five rows land in a single transaction — a half
   * registration would leave a Passport nobody holds the key to.
   *
   * Both entrances (`POST /api/v1/agents/register` and the MCP tool) reach this
   * through `getRepo()`, i.e. the cookie-bound **anon-key** client, never the
   * service role — which is why `anon` keeps EXECUTE on the function and why
   * the function body, not this caller, is the trust boundary.
   */
  async registerAgent(input: RegisterAgentInput): Promise<RegisteredAgent> {
    const handle = slugify(input.handle);
    if (!handle) throw new ValidationError("A handle is required");

    const rawApiKey = generateApiKey();
    const claimToken = generateClaimToken();
    const client = await this.client();

    const { data, error } = await client.rpc("register_agent", {
      p_handle: handle,
      p_name: input.name,
      p_tagline: input.tagline,
      p_description: input.description ?? input.tagline,
      p_avatar_emoji: input.avatar_emoji ?? "🤖",
      p_avatar_gradient: input.avatar_gradient ?? "linear-gradient(135deg,#297dff,#7559ff)",
      p_category: input.category,
      p_skills: input.skills,
      p_regions: input.regions ?? ["US"],
      p_room_slug: ROOM_FOR_CATEGORY[input.category],
      p_pricing_model: input.pricing_model ?? "per_run",
      p_starting_price_cents: input.starting_price_cents ?? 0,
      p_endpoints: validateAgentEndpoints(input.endpoints),
      p_mcp_tools: input.mcp_tools ?? [],
      p_key_hash: await hashApiKey(rawApiKey),
      p_key_prefix: apiKeyPrefix(rawApiKey),
      p_scopes: [...REGISTERED_AGENT_SCOPES],
      p_token_hash: await hashClaimToken(claimToken),
      // No `p_registry_handle`: the holding profile is not the caller's to
      // pick. Since 0011 the function pins it to `district-registry` and
      // refuses any other value, because the function is callable straight
      // through PostgREST with the public anon key, not only from here.
    });
    if (error) {
      const message = error.message ?? "";
      if (/already registered|handle_key|duplicate key/i.test(message)) {
        throw new ConflictError(`@${handle} is already registered in the District`);
      }
      if (/registry profile/i.test(message)) {
        throw new NotFoundError("The District registry profile");
      }
      throw new UpstreamError(message);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new UpstreamError("Agent was not registered");
    return { agent: toAgent(asRow(row)), rawApiKey, claimToken };
  }

  async claimAgent(rawToken: string, profileId: UUID): Promise<Agent> {
    const client = await this.client();
    const { data, error } = await client.rpc("claim_agent", {
      p_token_hash: await hashClaimToken(rawToken),
      p_profile_id: profileId,
      p_actor: this.actor(),
    });
    if (error) {
      const message = error.message ?? "";
      if (/already been claimed/i.test(message)) throw new ConflictError(message);
      if (/claim link|not found/i.test(message)) throw new NotFoundError("That claim link");
      if (/another profile|authenticated caller/i.test(message)) {
        throw new ForbiddenError("Sign in as the profile that should own this agent");
      }
      throw new UpstreamError(message);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new NotFoundError("That claim link");
    return toAgent(asRow(row));
  }

  async getAgentClaim(rawToken: string): Promise<AgentClaimPreview | null> {
    const client = await this.client();
    const { data, error } = await client.rpc("find_agent_claim", {
      p_token_hash: await hashClaimToken(rawToken),
    });
    if (error) throw new UpstreamError(error.message);
    const rows = asRows(data);
    if (rows.length === 0) return null;

    const claim = toAgentClaim(rows[0]);
    const agent = await this.getAgentById(claim.agent_id);
    if (!agent) return null;
    return {
      agent,
      claimed: claim.claimed_at !== null,
      claimed_at: claim.claimed_at,
      claimed_by: claim.claimed_by ? await this.getProfile(claim.claimed_by) : null,
    };
  }

  /* ------------------------------------------------------------------ gigs */

  private async withAgents(gigs: Gig[]): Promise<GigWithAgent[]> {
    const agents = await this.agentsByIds(gigs.map((gig) => gig.agent_id));
    return gigs
      .map((gig) => {
        const agent = agents.get(gig.agent_id);
        return agent ? { ...gig, agent } : null;
      })
      .filter((gig): gig is GigWithAgent => Boolean(gig));
  }

  async listGigs(filter: GigFilter = {}): Promise<GigWithAgent[]> {
    const {
      q,
      category,
      agentHandle,
      maxPriceCents,
      tags,
      sort = "trending",
      limit = 48,
      offset = 0,
    } = filter;
    const client = await this.client();

    // A list read never throws for a missing handle (see the Repository
    // contract) — an unknown `?agent=` renders an empty state, not a 500.
    let agentId: UUID | null = null;
    if (agentHandle) {
      const agent = await this.getAgentByHandle(agentHandle);
      if (!agent) return [];
      agentId = agent.id;
    }

    if (q && q.trim()) {
      const { data, error } = await client.rpc("search_gigs", {
        p_query: q.trim(),
        p_limit: Math.max(limit * 3, 48),
      });
      if (error) throw new UpstreamError(error.message);
      const rows = asRows(data)
        .map(toGig)
        .filter((gig) => matchesGigFilter(gig, { category, agentId, maxPriceCents, tags }));
      return this.withAgents(sortGigs(rows, sort).slice(offset, offset + limit));
    }

    let query = client.from("gigs").select("*").eq("status", "active");
    if (category) query = query.eq("category", category);
    if (maxPriceCents !== undefined) query = query.lte("starting_price_cents", maxPriceCents);
    if (tags && tags.length > 0) query = query.overlaps("tags", tags);
    if (agentId) query = query.eq("agent_id", agentId);

    switch (sort) {
      case "rating":
        query = query.order("rating_avg", { ascending: false });
        break;
      case "price":
        query = query.order("starting_price_cents", { ascending: true });
        break;
      case "newest":
        query = query.order("created_at", { ascending: false });
        break;
      case "fastest":
        query = query.order("delivery_seconds", { ascending: true });
        break;
      default:
        query = query.order("runs_count", { ascending: false });
    }

    // `trending` is a computed score (`compareTrendingGigs`), which PostgREST
    // cannot express in `.order()`. Pull a wider window ordered by the score's
    // dominant term and rank it here, exactly as the search branch above does,
    // so the two adapters return the same page.
    if (sort === "trending" || sort === undefined) {
      const pool = await this.many(
        query.range(0, Math.min(TRENDING_POOL, offset + limit * 3) - 1),
        toGig,
      );
      return this.withAgents(sortGigs(pool, "trending").slice(offset, offset + limit));
    }

    const gigs = await this.many(query.range(offset, offset + limit - 1), toGig);
    return this.withAgents(gigs);
  }

  /**
   * `count: "exact", head: true` asks Postgres for the count only — no rows
   * cross the wire. The `q` branch has to count through the search RPC, which
   * returns whole rows, so it is capped at 200 like the UI's own page window.
   */
  async countGigs(filter: GigFilter = {}): Promise<number> {
    const { q, category, agentHandle, maxPriceCents, tags } = filter;
    const client = await this.client();

    let agentId: UUID | null = null;
    if (agentHandle) {
      const agent = await this.getAgentByHandle(agentHandle);
      if (!agent) return 0;
      agentId = agent.id;
    }

    if (q && q.trim()) {
      const { data, error } = await client.rpc("search_gigs", {
        p_query: q.trim(),
        p_limit: 200,
      });
      if (error) throw new UpstreamError(error.message);
      return asRows(data)
        .map(toGig)
        .filter((gig) => matchesGigFilter(gig, { category, agentId, maxPriceCents, tags })).length;
    }

    let query = client
      .from("gigs")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    if (category) query = query.eq("category", category);
    if (maxPriceCents !== undefined) query = query.lte("starting_price_cents", maxPriceCents);
    if (tags && tags.length > 0) query = query.overlaps("tags", tags);
    if (agentId) query = query.eq("agent_id", agentId);
    const { count, error } = await query;
    if (error) throw new UpstreamError(error.message);
    return count ?? 0;
  }

  async listReviewsForGig(slug: Slug, limit = 12): Promise<ReviewWithReviewer[]> {
    const client = await this.client();
    const gig = await this.one(
      client.from("gigs").select("id").eq("slug", slug).maybeSingle(),
      (row) => String(row.id ?? ""),
    );
    if (!gig) return [];

    // Reviews reach a gig through the order they were left on.
    const orderIds = await this.many(
      client.from("orders").select("id").eq("gig_id", gig),
      (row) => String(row.id ?? ""),
    );
    if (orderIds.length === 0) return [];

    const reviews = await this.many(
      client
        .from("reviews")
        .select("*")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false })
        .limit(limit),
      toReview,
    );
    const reviewerIds = [...new Set(reviews.map((review) => review.reviewer_id))];
    const profiles = reviewerIds.length
      ? await this.many(client.from("profiles").select("*").in("id", reviewerIds), toProfile)
      : [];
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return reviews.map((review) => ({ ...review, reviewer: byId.get(review.reviewer_id) ?? null }));
  }

  async getGigBySlug(slug: Slug): Promise<GigWithAgent | null> {
    const client = await this.client();
    const gig = await this.one(
      client.from("gigs").select("*").eq("slug", slug).maybeSingle(),
      toGig,
    );
    if (!gig) return null;
    const [decorated] = await this.withAgents([gig]);
    return decorated ?? null;
  }

  /**
   * The home page's "Featured Gigs" is an editorial pin, not a leaderboard:
   * `FEATURED_GIG_SLUGS` reproduces docs/reference/desktop-home.png in order,
   * and only then is the row topped up by `runs_count`. Ordering by runs alone
   * surfaces the free utility gigs, which is the least representative set
   * possible — and made this adapter disagree with the demo one.
   */
  async getFeaturedGigs(limit = 3): Promise<GigWithAgent[]> {
    const client = await this.client();
    const pinned = await this.many(
      client.from("gigs").select("*").eq("status", "active").in("slug", FEATURED_GIG_SLUGS),
      toGig,
    );
    const ordered = FEATURED_GIG_SLUGS.map((slug) =>
      pinned.find((gig) => gig.slug === slug),
    ).filter((gig): gig is Gig => Boolean(gig));

    if (ordered.length >= limit) return this.withAgents(ordered.slice(0, limit));

    const fillers = await this.many(
      client
        .from("gigs")
        .select("*")
        .eq("status", "active")
        .order("runs_count", { ascending: false })
        .limit(limit + ordered.length),
      toGig,
    );
    const seen = new Set(ordered.map((gig) => gig.id));
    for (const gig of fillers) {
      if (ordered.length >= limit) break;
      if (seen.has(gig.id)) continue;
      seen.add(gig.id);
      ordered.push(gig);
    }
    return this.withAgents(ordered.slice(0, limit));
  }

  async createGig(input: CreateGigInput, ownerId: UUID): Promise<Gig> {
    const agent = await this.requireAgentByHandle(input.agentHandle);
    if (agent.owner_id !== ownerId) throw new ForbiddenError("You do not own this agent");
    if (input.packages.length === 0) throw new ValidationError("A gig needs at least one package");
    const client = await this.client();

    const base = slugify(input.slug ?? input.title) || `gig-${Date.now()}`;
    let slug = base;
    let suffix = 2;
    while (await this.getGigBySlug(slug)) slug = `${base}-${suffix++}`;

    const gig = await this.one(
      client
        .from("gigs")
        .insert({
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
          status: "active",
        })
        .select("*")
        .maybeSingle(),
      toGig,
    );
    if (!gig) throw new UpstreamError("Gig was not created");

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
    const gig = await this.getGigBySlug(input.gigSlug);
    if (!gig) throw new NotFoundError(`Gig ${input.gigSlug}`);
    if (gig.status !== "active") {
      throw new ConflictError("This gig is paused and is not taking new orders.");
    }
    const pkg = gig.packages.find((candidate) => candidate.tier === input.tier);
    if (!pkg) throw new ValidationError(`Gig ${gig.slug} has no ${input.tier} package`);
    const brief = input.brief.trim();
    if (!brief) throw new ValidationError("A brief is required");

    const client = await this.client();
    const timestamp = this.nowIso();
    const order = await this.one(
      client
        .from("orders")
        .insert({
          buyer_id: input.buyerId,
          agent_id: gig.agent_id,
          gig_id: gig.id,
          package_tier: pkg.tier,
          brief,
          amount_cents: pkg.price_cents,
          status: "queued",
          progress: 0,
          eta_seconds: pkg.delivery_seconds,
          started_at: timestamp,
          audit_log: [
            {
              at: timestamp,
              actor: "buyer",
              event: "order.created",
              detail: "Brief accepted, funds held.",
            },
            {
              at: timestamp,
              actor: `@${gig.agent.handle}`,
              event: "run.started",
              detail: "Simulated run — no external calls were made.",
            },
          ],
        })
        .select("*")
        .maybeSingle(),
      toOrder,
    );
    if (!order) throw new UpstreamError("Order was not created");

    // `wallet_transactions.order_id` is a foreign key, so the order row has to
    // exist before the hold can reference it. If the hold is refused (no
    // credits, over the approval threshold) the order is compensated away
    // rather than left running unpaid.
    try {
      await this.holdFunds(
        input.buyerId,
        order.amount_cents,
        order.id,
        `Hold — ${gig.agent.name} · ${pkg.name}`,
        { approved: input.approved },
      );
    } catch (error) {
      await client.from("orders").delete().eq("id", order.id);
      throw error;
    }
    // 0008: the bump is bound to the order that earned it, so it can neither
    // be aimed at a stranger's gig nor replayed.
    await client.rpc("increment_gig_runs", { p_gig_id: gig.id, p_order_id: order.id });

    await this.publishEventBestEffort({
      kind: "hired",
      actor_type: "agent",
      actor_id: gig.agent_id,
      actor_name: gig.agent.name,
      headline: `${gig.agent.name} was hired`,
      body: `${gig.title} · ${pkg.name}`,
      cta_label: "Watch the run",
      cta_href: `/orders/${order.id}`,
    });
    return order;
  }

  /* ------------------------------------------------------------------ jobs */

  async listJobs(filter: JobFilter = {}): Promise<JobWithBidCount[]> {
    const { q, category, status, posterId, sort = "newest", limit = 48, offset = 0 } = filter;
    const client = await this.client();

    let jobs: Job[];
    const needle = q?.trim() ?? "";
    const searched = needle.length > 0;
    if (searched) {
      const { data, error } = await client.rpc("search_jobs", {
        p_query: needle,
        p_limit: Math.max(limit * 3, 48),
      });
      if (error) throw new UpstreamError(error.message);
      jobs = asRows(data)
        .map(toJob)
        .filter((job) => {
          if (category && job.category !== category) return false;
          if (status && job.status !== status) return false;
          if (posterId && job.poster_id !== posterId) return false;
          return true;
        });
    } else {
      let query = client.from("jobs").select("*");
      if (category) query = query.eq("category", category);
      if (status) query = query.eq("status", status);
      if (posterId) query = query.eq("poster_id", posterId);
      switch (sort) {
        case "budget":
          query = query.order("budget_cents", { ascending: false });
          break;
        case "deadline":
          query = query.order("deadline_seconds", { ascending: true });
          break;
        default:
          query = query.order("created_at", { ascending: false });
      }
      jobs = await this.many(query.range(offset, offset + limit - 1), toJob);
    }

    const ids = jobs.map((job) => job.id);
    const bids = ids.length
      ? await this.many(client.from("bids").select("*").in("job_id", ids), toBid)
      : [];
    const counts = new Map<string, number>();
    for (const bid of bids) {
      if (bid.status === "withdrawn") continue;
      counts.set(bid.job_id, (counts.get(bid.job_id) ?? 0) + 1);
    }

    const decorated = jobs.map((job) => ({ ...job, bidCount: counts.get(job.id) ?? 0 }));
    if (sort === "bids") decorated.sort((a, b) => b.bidCount - a.bidCount);
    // The SQL branch has already applied `.range(offset, …)`; only the search
    // branch and the in-memory `bids` sort still need slicing, and dropping the
    // offset there made every page of a job search return page 1.
    const start = searched || sort === "bids" ? offset : 0;
    return decorated.slice(start, start + limit);
  }

  async getJob(id: UUID): Promise<JobWithBids | null> {
    const client = await this.client();
    const job = await this.one(
      client.from("jobs").select("*").eq("id", id).maybeSingle(),
      toJob,
    );
    if (!job) return null;

    const bidRows = await this.many(
      client.from("bids").select("*").eq("job_id", job.id).order("amount_cents"),
      toBid,
    );
    const agents = await this.agentsByIds(bidRows.map((bid) => bid.agent_id));
    const guildIds = bidRows
      .map((bid) => bid.guild_id)
      .filter((guildId): guildId is string => Boolean(guildId));
    const guilds = guildIds.length
      ? await this.many(client.from("guilds").select("*").in("id", guildIds), toGuild)
      : [];
    const guildById = new Map(guilds.map((guild) => [guild.id, guild]));

    const bids: BidWithAgent[] = bidRows
      .map((bid) => {
        const agent = agents.get(bid.agent_id);
        if (!agent) return null;
        return {
          ...bid,
          agent,
          guild: bid.guild_id ? (guildById.get(bid.guild_id) ?? null) : null,
        };
      })
      .filter((bid): bid is BidWithAgent => Boolean(bid));

    return { ...job, bids, poster: await this.getProfile(job.poster_id) };
  }

  async createJob(input: CreateJobInput, posterId: UUID): Promise<Job> {
    if (input.budget_cents <= 0) throw new ValidationError("Budget must be greater than zero");
    const client = await this.client();
    const job = await this.one(
      client
        .from("jobs")
        .insert({
          title: input.title,
          description: input.description,
          category: input.category,
          budget_cents: input.budget_cents,
          deadline_seconds: input.deadline_seconds,
          required_output: input.required_output,
          data_policy: input.data_policy,
          poster_id: posterId,
          status: "open",
        })
        .select("*")
        .maybeSingle(),
      toJob,
    );
    if (!job) throw new UpstreamError("Job was not created");

    const poster = await this.getProfile(posterId);
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

  async listBidsForJobs(jobIds: UUID[]): Promise<Record<UUID, BidWithAgent[]>> {
    const out: Record<UUID, BidWithAgent[]> = {};
    for (const id of jobIds) out[id] = [];
    if (jobIds.length === 0) return out;

    const client = await this.client();
    const bids = await this.many(
      client
        .from("bids")
        .select("*")
        .in("job_id", jobIds)
        .order("amount_cents", { ascending: true }),
      toBid,
    );
    if (bids.length === 0) return out;

    const agents = await this.agentsByIds(bids.map((bid) => bid.agent_id));
    const guildIds = [...new Set(bids.map((bid) => bid.guild_id).filter((id): id is UUID => Boolean(id)))];
    const guilds = guildIds.length
      ? await this.many(client.from("guilds").select("*").in("id", guildIds), toGuild)
      : [];
    const guildById = new Map(guilds.map((guild) => [guild.id, guild]));

    for (const bid of bids) {
      const agent = agents.get(bid.agent_id);
      if (!agent) continue;
      (out[bid.job_id] ??= []).push({
        ...bid,
        agent,
        guild: bid.guild_id ? (guildById.get(bid.guild_id) ?? null) : null,
      });
    }
    for (const id of jobIds) {
      out[id].sort((a, b) => a.amount_cents - b.amount_cents || a.eta_seconds - b.eta_seconds);
    }
    return out;
  }

  async placeBid(input: PlaceBidInput): Promise<Bid> {
    const client = await this.client();
    const job = await this.one(
      client.from("jobs").select("*").eq("id", input.jobId).maybeSingle(),
      toJob,
    );
    if (!job) throw new NotFoundError("Job");
    if (job.status !== "open") throw new ConflictError("This job is no longer open for bids");
    if (input.amountCents <= 0) throw new ValidationError("Bid amount must be greater than zero");
    const agent = await this.requireAgentByHandle(input.agentHandle);
    // See the demo adapter: bidding on your own bounty is free reputation.
    // `bids_insert_agent_owner` (0008) refuses it in the database too.
    if (job.poster_id === agent.owner_id) {
      throw new ForbiddenError("You cannot bid on your own bounty");
    }

    const guildId = input.guildSlug
      ? await this.one(
          client.from("guilds").select("id").eq("slug", input.guildSlug).maybeSingle(),
          (row) => String(row.id ?? ""),
        )
      : null;

    const bid = await this.one(
      client
        .from("bids")
        .insert({
          job_id: job.id,
          agent_id: agent.id,
          guild_id: guildId,
          amount_cents: input.amountCents,
          eta_seconds: input.etaSeconds,
          note: input.note,
          status: "pending",
        })
        .select("*")
        .maybeSingle(),
      toBid,
    );
    if (!bid) throw new UpstreamError("Bid was not created");

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

  async acceptBid(input: AcceptBidInput): Promise<Order> {
    const client = await this.client();
    const job = await this.one(
      client.from("jobs").select("*").eq("id", input.jobId).maybeSingle(),
      toJob,
    );
    if (!job) throw new NotFoundError("Job");
    if (job.poster_id !== input.buyerId) {
      throw new ForbiddenError("Only the job poster can award this job");
    }
    if (job.status !== "open") throw new ConflictError("This job has already been awarded");

    const bid = await this.one(
      client
        .from("bids")
        .select("*")
        .eq("id", input.bidId)
        .eq("job_id", job.id)
        .maybeSingle(),
      toBid,
    );
    if (!bid) throw new NotFoundError("Bid");
    const agent = await this.requireAgentById(bid.agent_id);
    // Mirror of the `placeBid` guard, for a bid that predates it.
    if (job.poster_id === agent.owner_id) {
      throw new ForbiddenError("You cannot award your own bounty to your own agent");
    }

    const timestamp = this.nowIso();
    const order = await this.one(
      client
        .from("orders")
        .insert({
          buyer_id: input.buyerId,
          agent_id: agent.id,
          job_id: job.id,
          bid_id: bid.id,
          brief: job.description,
          amount_cents: bid.amount_cents,
          status: "queued",
          progress: 0,
          eta_seconds: bid.eta_seconds,
          started_at: timestamp,
          audit_log: [
            {
              at: timestamp,
              actor: "buyer",
              event: "order.created",
              detail: `Bid accepted for ${job.title}. Funds held.`,
            },
          ],
        })
        .select("*")
        .maybeSingle(),
      toOrder,
    );
    if (!order) throw new UpstreamError("Order was not created");

    // Same compensating delete as `orderGig`: an unfunded order must never
    // survive a refused hold, and the bid/job updates below must not run for
    // one.
    try {
      await this.holdFunds(
        input.buyerId,
        order.amount_cents,
        order.id,
        `Hold — ${agent.name} · ${job.title}`,
        { approved: input.approved },
      );
    } catch (error) {
      await client.from("orders").delete().eq("id", order.id);
      throw error;
    }

    await client.from("bids").update({ status: "accepted" }).eq("id", bid.id);
    await client
      .from("bids")
      .update({ status: "rejected" })
      .eq("job_id", job.id)
      .eq("status", "pending")
      .neq("id", bid.id);
    await client
      .from("jobs")
      .update({ awarded_bid_id: bid.id, status: "in_progress" })
      .eq("id", job.id);

    await this.publishEventBestEffort({
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

  async listOrders(filter: OrderFilter = {}): Promise<OrderDetail[]> {
    const { buyerId, agentHandle, status, jobId, limit = 50, offset = 0 } = filter;
    const client = await this.client();

    let query = client.from("orders").select("*").order("created_at", { ascending: false });
    if (buyerId) query = query.eq("buyer_id", buyerId);
    if (status) query = query.eq("status", status);
    if (jobId) query = query.eq("job_id", jobId);
    if (agentHandle) {
      // A list read returns an empty page for an unknown handle rather than
      // throwing — see the Repository contract in `lib/data/repository.ts`.
      const agent = await this.getAgentByHandle(agentHandle);
      if (!agent) return [];
      query = query.eq("agent_id", agent.id);
    }

    const orders = await this.many(query.range(offset, offset + limit - 1), toOrder);
    const advanced = await Promise.all(orders.map((order) => this.advance(order)));
    return this.decorateOrders(advanced);
  }

  async countOrders(filter: OrderFilter = {}): Promise<number> {
    const { buyerId, agentHandle, status, jobId } = filter;
    const client = await this.client();

    let query = client.from("orders").select("id", { count: "exact", head: true });
    if (buyerId) query = query.eq("buyer_id", buyerId);
    if (status) query = query.eq("status", status);
    if (jobId) query = query.eq("job_id", jobId);
    if (agentHandle) {
      const agent = await this.getAgentByHandle(agentHandle);
      if (!agent) return 0;
      query = query.eq("agent_id", agent.id);
    }
    const { count, error } = await query;
    if (error) throw new UpstreamError(error.message);
    return count ?? 0;
  }

  async getOrder(id: UUID): Promise<OrderDetail | null> {
    const client = await this.client();
    const order = await this.one(
      client.from("orders").select("*").eq("id", id).maybeSingle(),
      toOrder,
    );
    if (!order) return null;
    const [detail] = await this.decorateOrders([await this.advance(order)]);
    return detail ?? null;
  }

  async refreshOrder(id: UUID): Promise<Order> {
    return this.advance(await this.orderRow(id));
  }

  /** Deterministic §6 progress, persisted back to Postgres when it changes. */
  private async advance(order: Order): Promise<Order> {
    if (order.status !== "queued" && order.status !== "running") return order;

    const now = Date.now();
    const progress = computeProgress(order, now);
    const next = projectedStatus(order, progress);

    if (next === "delivered") {
      const agent = await this.requireAgentById(order.agent_id);
      const result = await runtimeFor(agent).execute(order, agent, {
        gig: await this.gigById(order.gig_id),
        job: await this.jobById(order.job_id),
        now,
      });
      const deliveredAt = result.audit.at(-1)?.at ?? new Date(now).toISOString();
      const auditLog = [...order.audit_log, ...result.audit];
      const failed = result.status === "failed";

      const updated = await this.advanceOrderRow(order.id, {
        status: failed ? "failed" : "delivered",
        progress: 100,
        output: result.output,
        deliveredAt,
        audit: result.audit,
      });

      // A failed run never delivers anything, so its hold is returned rather
      // than left locking the buyer's credits forever.
      if (failed) {
        await this.settleHold(
          order.id,
          `Refunded — ${agent.name} could not complete this run`,
          { refund: true },
        );
      }

      await this.publishEventBestEffort({
        kind: "delivered",
        actor_type: "agent",
        actor_id: agent.id,
        actor_name: agent.name,
        headline: `${agent.name} delivered a run`,
        body: order.brief.slice(0, 160),
        cta_label: "Review deliverable",
        cta_href: `/orders/${order.id}`,
      });

      return (
        updated ?? {
          ...order,
          status: failed ? "failed" : "delivered",
          progress: 100,
          output: result.output,
          delivered_at: deliveredAt,
          audit_log: auditLog,
        }
      );
    }

    if (order.progress === progress && order.status === next) return order;

    const updated = await this.advanceOrderRow(order.id, { progress, status: next });
    return updated ?? { ...order, progress, status: next };
  }

  async approveOrder(id: UUID, buyerId: UUID): Promise<Order> {
    const client = await this.client();
    let order = await this.orderRow(id);
    if (order.buyer_id !== buyerId) throw new ForbiddenError("Only the buyer can approve this run");
    if (order.status === "approved") return order;

    order = await this.advance(order);
    if (order.status !== "delivered") {
      throw new ConflictError("This run has not been delivered yet");
    }

    const timestamp = this.nowIso();
    const agent = await this.requireAgentById(order.agent_id);
    const amount = order.amount_cents;

    // One money-out row per order: `settle_hold` rewrites the `hold` row into a
    // `release` rather than adding a second row, so the wallet page cannot
    // double-count. It also moves held → spent atomically.
    await this.settleHold(
      order.id,
      `Released to ${agent.name} — ${order.brief.slice(0, 60)}`,
    );

    const entry = {
      at: timestamp,
      actor: "buyer",
      event: "order.approved",
      detail: "Hold released — 90% payout, 10% District fee.",
    };
    const auditLog = [...order.audit_log, entry];
    const approved = await this.advanceOrderRow(order.id, {
      status: "approved",
      progress: 100,
      cost: costBreakdownFor(amount),
      audit: [entry],
    });

    await client.rpc("increment_agent_jobs", { p_agent_id: agent.id, p_order_id: order.id });
    if (agent.store_id) {
      const store = await this.one(
        client.from("stores").select("hires_count").eq("id", agent.store_id).maybeSingle(),
        (row) => Number(row.hires_count ?? 0),
      );
      await client
        .from("stores")
        .update({ hires_count: (store ?? 0) + 1 })
        .eq("id", agent.store_id);
    }
    if (order.job_id) {
      await client.from("jobs").update({ status: "completed" }).eq("id", order.job_id);
    }

    const buyer = await this.getProfile(order.buyer_id);
    await this.publishEventBestEffort({
      kind: "approved",
      actor_type: "human",
      actor_id: order.buyer_id,
      actor_name: buyer?.display_name ?? "A buyer",
      headline: `${agent.name} got paid`,
      body: order.brief.slice(0, 160),
      cta_label: "See the run",
      cta_href: `/orders/${order.id}`,
    });

    return (
      approved ?? {
        ...order,
        status: "approved",
        progress: 100,
        cost_breakdown: costBreakdownFor(amount),
        audit_log: auditLog,
      }
    );
  }

  async disputeOrder(id: UUID, buyerId: UUID, reason: string): Promise<Order> {
    const order = await this.orderRow(id);
    if (order.buyer_id !== buyerId) throw new ForbiddenError("Only the buyer can dispute this run");
    if (order.status === "approved") throw new ConflictError("This run has already been approved");
    // Terminal states are already settled — a second dispute would refund the
    // same hold twice, releasing credits that belong to other live orders.
    if (
      order.status === "disputed" ||
      order.status === "failed" ||
      order.status === "cancelled"
    ) {
      return order;
    }

    const entry = {
      at: this.nowIso(),
      actor: "buyer",
      event: "order.disputed",
      detail: reason,
    };
    const auditLog = [...order.audit_log, entry];
    const updated = await this.advanceOrderRow(order.id, {
      status: "disputed",
      audit: [entry],
    });

    // A dispute must return the hold. Leaving it in place locked the buyer's
    // credits permanently, and the `refund` transaction kind was never emitted.
    await this.settleHold(order.id, `Refunded — disputed run (${reason.slice(0, 60)})`, {
      refund: true,
    });

    return updated ?? { ...order, status: "disputed", audit_log: auditLog };
  }

  /* --------------------------------------------------- guilds and stores */

  async listGuilds(options: ListOptions = {}): Promise<GuildWithMembers[]> {
    const { limit = 12, offset = 0 } = options;
    const client = await this.client();
    const guilds = await this.many(
      client
        .from("guilds")
        .select("*")
        .order("rating_avg", { ascending: false })
        .range(offset, offset + limit - 1),
      toGuild,
    );
    if (guilds.length === 0) return [];

    const members = await this.many(
      client
        .from("guild_members")
        .select("*")
        .in(
          "guild_id",
          guilds.map((guild) => guild.id),
        )
        .order("position"),
      toGuildMember,
    );
    const agents = await this.agentsByIds(members.map((member) => member.agent_id));

    return guilds.map((guild) => {
      const rows = members.filter((member) => member.guild_id === guild.id);
      return {
        ...guild,
        members: rows
          .map((member) => agents.get(member.agent_id))
          .filter((agent): agent is Agent => Boolean(agent)),
        roles: rows.map((member) => member.role),
      };
    });
  }

  async getGuildBySlug(slug: Slug): Promise<GuildWithMembers | null> {
    const client = await this.client();
    const guild = await this.one(
      client.from("guilds").select("*").eq("slug", slug).maybeSingle(),
      toGuild,
    );
    if (!guild) return null;
    const members = await this.many(
      client.from("guild_members").select("*").eq("guild_id", guild.id).order("position"),
      toGuildMember,
    );
    const agents = await this.agentsByIds(members.map((member) => member.agent_id));
    return {
      ...guild,
      members: members
        .map((member) => agents.get(member.agent_id))
        .filter((agent): agent is Agent => Boolean(agent)),
      roles: members.map((member) => member.role),
    };
  }

  async listStores(): Promise<StoreWithAgents[]> {
    const client = await this.client();
    const stores = await this.many(client.from("stores").select("*"), toStore);
    const agents = await this.many(client.from("agents").select("*"), toAgent);
    const owners = await this.many(client.from("profiles").select("*"), toProfile);
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
    return stores.map((store) => ({
      ...store,
      agents: agents.filter((agent) => agent.store_id === store.id),
      owner: ownerById.get(store.owner_id) ?? null,
    }));
  }

  async getStoreBySlug(slug: Slug): Promise<StoreDetail | null> {
    const client = await this.client();
    const store = await this.one(
      client.from("stores").select("*").eq("slug", slug).maybeSingle(),
      toStore,
    );
    if (!store) return null;
    const agents = await this.many(
      client.from("agents").select("*").eq("store_id", store.id),
      toAgent,
    );
    const gigs = agents.length
      ? await this.many(
          client
            .from("gigs")
            .select("*")
            .in(
              "agent_id",
              agents.map((agent) => agent.id),
            ),
          toGig,
        )
      : [];
    return { ...store, agents, gigs, owner: await this.getProfile(store.owner_id) };
  }

  async listMarketItems(filter: MarketFilter = {}): Promise<MarketItemWithStore[]> {
    const { kind, q, limit = 48, offset = 0 } = filter;
    const client = await this.client();
    let query = client
      .from("market_items")
      .select("*")
      .order("downloads", { ascending: false })
      .range(offset, offset + limit - 1);
    if (kind) query = query.eq("kind", kind);
    if (q && q.trim()) {
      // Title *and* description *and* tags, matching the demo adapter.
      // PostgREST's `or()` takes a *filter string*, so the term is stripped of
      // the characters that would break out of it (`,` `(` `)` `.` `"`) as well
      // as the `ilike` wildcards — a search box must not be able to author a
      // filter expression.
      const needle = likeEscape(q.trim().replace(/[,()."\\]/g, " ")).trim();
      if (needle) {
        query = query.or(
          `title.ilike.%${needle}%,description.ilike.%${needle}%,tags.cs.{${needle}}`,
        );
      }
    }

    const items = await this.many(query, toMarketItem);
    const storeIds = items
      .map((item) => item.seller_store_id)
      .filter((id): id is string => Boolean(id));
    const stores = storeIds.length
      ? await this.many(client.from("stores").select("*").in("id", storeIds), toStore)
      : [];
    const byId = new Map(stores.map((store) => [store.id, store]));
    return items.map((item) => ({
      ...item,
      store: item.seller_store_id ? (byId.get(item.seller_store_id) ?? null) : null,
    }));
  }

  async getMarketItemBySlug(slug: Slug): Promise<MarketItemWithStore | null> {
    const client = await this.client();
    const item = await this.one(
      client.from("market_items").select("*").eq("slug", slug).maybeSingle(),
      toMarketItem,
    );
    if (!item) return null;
    const store = item.seller_store_id
      ? await this.one(
          client.from("stores").select("*").eq("id", item.seller_store_id).maybeSingle(),
          toStore,
        )
      : null;
    return { ...item, store };
  }

  /* -------------------------------------------------------------------- tv */

  async listChannels(filter: ChannelFilter = {}): Promise<ChannelWithHosts[]> {
    const { liveOnly, kind, limit = 24, offset = 0 } = filter;
    const client = await this.client();
    let query = client
      .from("channels")
      .select("*")
      // Matches the demo adapter: live first, then followers (never `viewers`).
      .order("is_live", { ascending: false })
      .order("followers", { ascending: false })
      .range(offset, offset + limit - 1);
    if (liveOnly) query = query.eq("is_live", true);
    if (kind) query = query.eq("kind", kind);
    const channels = await this.many(query, toChannel);
    if (channels.length === 0) return [];

    // Hosts for the whole page in ONE round trip — every TV surface draws them.
    const hostRows = await this.many(
      client
        .from("channel_hosts")
        .select("*")
        .in(
          "channel_id",
          channels.map((channel) => channel.id),
        )
        .order("position"),
      (row) => ({
        channel_id: String(row.channel_id ?? ""),
        agent_id: String(row.agent_id ?? ""),
      }),
    );
    const agents = await this.agentsByIds(hostRows.map((row) => row.agent_id));
    return channels.map((channel) => ({
      ...channel,
      hosts: hostRows
        .filter((row) => row.channel_id === channel.id)
        .map((row) => agents.get(row.agent_id))
        .filter((agent): agent is Agent => Boolean(agent)),
    }));
  }

  /**
   * Follow / unfollow through the `set_channel_follow()` RPC (migration 0006).
   * `channels.followers` is a denormalised counter the channel owner alone can
   * write, so the toggle has to be `security definer`; the RPC keeps the join
   * row and the counter in one statement and returns the new count.
   */
  async setChannelFollow(slug: Slug, profileId: UUID, following: boolean): Promise<Channel> {
    void profileId; // taken from auth.uid() inside the RPC
    const client = await this.client();
    const { error } = await client.rpc("set_channel_follow", {
      p_slug: slug,
      p_follow: following,
    });
    if (error) {
      if (/channel not found/i.test(error.message ?? "")) throw new NotFoundError(`Channel ${slug}`);
      throw new UpstreamError(error.message);
    }
    const channel = await this.one(
      client.from("channels").select("*").eq("slug", slug).maybeSingle(),
      toChannel,
    );
    if (!channel) throw new NotFoundError(`Channel ${slug}`);
    return channel;
  }

  async listFollowedChannelSlugs(profileId: UUID): Promise<Slug[]> {
    const client = await this.client();
    const rows = await this.many(
      client.from("channel_followers").select("channel_id").eq("profile_id", profileId),
      (row) => String(row.channel_id ?? ""),
    );
    if (rows.length === 0) return [];
    return this.many(
      client.from("channels").select("slug").in("id", rows),
      (row) => String(row.slug ?? ""),
    );
  }

  async getChannelBySlug(slug: Slug): Promise<ChannelDetail | null> {
    const client = await this.client();
    const channel = await this.one(
      client.from("channels").select("*").eq("slug", slug).maybeSingle(),
      toChannel,
    );
    if (!channel) return null;

    const hosts = await this.many(
      client.from("channel_hosts").select("*").eq("channel_id", channel.id).order("position"),
      (row) => row,
    );
    const hostIds = hosts.map((row) => String(row.agent_id ?? ""));
    const agents = await this.agentsByIds(hostIds);
    const chat = await this.many(
      client
        .from("channel_chat")
        .select("*")
        .eq("channel_id", channel.id)
        .order("created_at", { ascending: true })
        .limit(60),
      toChatMessage,
    );
    // A channel can run more than one race, and `.maybeSingle()` on the bare
    // filter is a 406 the moment it does (PGRST116). Order, then take one: the
    // pick `ChannelDetail.competition` defines, the same as the demo adapter's.
    const competition = await this.one(
      client
        .from("competitions")
        .select("*")
        .eq("channel_id", channel.id)
        .order("ends_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle(),
      toCompetition,
    );

    return {
      ...channel,
      hosts: hostIds
        .map((id) => agents.get(id))
        .filter((agent): agent is Agent => Boolean(agent)),
      chat,
      competition,
    };
  }

  async listCompetitions(filter: CompetitionFilter = {}): Promise<CompetitionWithEntries[]> {
    const { status, channelId, limit = 24, offset = 0 } = filter;
    const client = await this.client();
    let competitionQuery = client.from("competitions").select("*");
    if (status) competitionQuery = competitionQuery.eq("status", status);
    if (channelId) competitionQuery = competitionQuery.eq("channel_id", channelId);
    const competitions = await this.many(
      competitionQuery.range(offset, offset + limit - 1),
      toCompetition,
    );
    if (competitions.length === 0) return [];
    const entries = await this.many(
      client
        .from("competition_entries")
        .select("*")
        .in(
          "competition_id",
          competitions.map((competition) => competition.id),
        ),
      toCompetitionEntry,
    );
    const agents = await this.agentsByIds(entries.map((entry) => entry.agent_id));
    const channels = await this.many(client.from("channels").select("*"), toChannel);
    const channelById = new Map(channels.map((channel) => [channel.id, channel]));

    return competitions.map((competition) => ({
      ...competition,
      channel: channelById.get(competition.channel_id) ?? null,
      entries: entries
        .filter((entry) => entry.competition_id === competition.id)
        .sort((a, b) => b.progress - a.progress)
        .map((entry) => {
          const agent = agents.get(entry.agent_id);
          return agent ? { ...entry, agent } : null;
        })
        .filter((entry): entry is CompetitionWithEntries["entries"][number] => Boolean(entry)),
    }));
  }

  async postChannelChat(slug: Slug, authorName: string, body: string): Promise<ChatMessage> {
    if (!body.trim()) throw new ValidationError("Message body is required");
    const client = await this.client();
    const channel = await this.one(
      client.from("channels").select("id").eq("slug", slug).maybeSingle(),
      (row) => String(row.id ?? ""),
    );
    if (!channel) throw new NotFoundError(`Channel ${slug}`);
    const message = await this.one(
      client
        .from("channel_chat")
        .insert({ channel_id: channel, author_name: authorName, body: body.trim() })
        .select("*")
        .maybeSingle(),
      toChatMessage,
    );
    if (!message) throw new UpstreamError("Chat message was not written");
    return message;
  }

  /* ---------------------------------------------------------------- lounge */

  async listRooms(): Promise<RoomWithCounts[]> {
    const client = await this.client();
    const rooms = await this.many(client.from("rooms").select("*").order("position"), toRoom);
    const { data, error } = await client.rpc("room_presence_counts");
    if (error) throw new UpstreamError(error.message);
    const counts = new Map(
      asRows(data)
        .map(toRoomCounts)
        .map((row) => [row.room_slug, row]),
    );
    return rooms.map((room) => {
      const row = counts.get(room.slug);
      return {
        ...room,
        presenceCount: row?.presence_count ?? 0,
        liveCount: row?.live_count ?? 0,
        openSlots: row?.open_slots ?? 0,
      };
    });
  }

  async listPresence(roomSlug?: Slug): Promise<PresenceWithAgent[]> {
    const client = await this.client();
    let query = client.from("presence").select("*");
    if (roomSlug) query = query.eq("room_slug", roomSlug);
    const rows = await this.many(query, toPresence);
    const agents = await this.agentsByIds(rows.map((row) => row.agent_id));
    return rows
      .map((row) => {
        const agent = agents.get(row.agent_id);
        return agent ? { ...row, agent } : null;
      })
      .filter((row): row is PresenceWithAgent => Boolean(row));
  }

  async listLoungeMessages(
    roomSlug?: Slug,
    limit = 30,
    since?: string,
  ): Promise<LoungeMessage[]> {
    const client = await this.client();
    let query = client
      .from("lounge_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (roomSlug) query = query.eq("room_slug", roomSlug);
    if (since) query = query.gt("created_at", since);
    const rows = await this.many(query, toLoungeMessage);
    return rows.reverse();
  }

  async postLoungeMessage(input: PostLoungeMessageInput): Promise<LoungeMessage> {
    const body = input.body.trim();
    if (!body) throw new ValidationError("Message body is required");
    const client = await this.client();

    const authorName =
      input.authorType === "agent"
        ? (await this.requireAgentById(input.authorId)).name
        : ((await this.getProfile(input.authorId))?.display_name ?? "A human");

    const message = await this.one(
      client
        .from("lounge_messages")
        .insert({
          room_slug: input.roomSlug ?? null,
          author_type: input.authorType,
          author_id: input.authorId,
          author_name: authorName,
          body,
        })
        .select("*")
        .maybeSingle(),
      toLoungeMessage,
    );
    if (!message) throw new UpstreamError("Lounge message was not written");
    return message;
  }

  /* ----------------------------------------------------------------- inbox */

  async listThreads(profileId: UUID): Promise<ThreadListItem[]> {
    const client = await this.client();
    const threads = await this.many(
      client
        .from("threads")
        .select("*")
        .eq("profile_id", profileId)
        .order("updated_at", { ascending: false }),
      toThread,
    );
    if (threads.length === 0) return [];

    const messages = await this.many(
      client
        .from("messages")
        .select("*")
        .in(
          "thread_id",
          threads.map((thread) => thread.id),
        )
        .order("created_at", { ascending: true }),
      toMessage,
    );
    const agents = await this.agentsByIds(
      threads
        .map((thread) => thread.agent_id)
        .filter((id): id is string => Boolean(id)),
    );
    // Agent-less threads (District support, guild runs) show the profile.
    const owner = await this.getProfile(profileId);

    return threads.map((thread) => ({
      ...thread,
      lastMessage: messages.filter((message) => message.thread_id === thread.id).at(-1) ?? null,
      counterpart: thread.agent_id ? (agents.get(thread.agent_id) ?? null) : owner,
    }));
  }

  async getThread(id: UUID): Promise<ThreadWithMessages | null> {
    const client = await this.client();
    const thread = await this.one(
      client.from("threads").select("*").eq("id", id).maybeSingle(),
      toThread,
    );
    if (!thread) return null;
    const messages = await this.many(
      client
        .from("messages")
        .select("*")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true }),
      toMessage,
    );
    const counterpart = thread.agent_id
      ? await this.requireAgentById(thread.agent_id).catch(() => null)
      : await this.getProfile(thread.profile_id);
    return { ...thread, messages, counterpart };
  }

  async markThreadRead(threadId: UUID, profileId: UUID): Promise<Thread> {
    const client = await this.client();
    const thread = await this.one(
      client
        .from("threads")
        .update({ unread_count: 0 })
        .eq("id", threadId)
        .eq("profile_id", profileId)
        .select("*")
        .maybeSingle(),
      toThread,
    );
    // RLS makes someone else's thread simply not match, so a null row here
    // means "missing or not yours" — report it the same way the demo does.
    if (!thread) {
      const exists = await this.one(
        client.from("threads").select("id").eq("id", threadId).maybeSingle(),
        (row) => String(row.id ?? ""),
      );
      if (!exists) throw new NotFoundError("Thread");
      throw new ForbiddenError("This is not your conversation");
    }
    return thread;
  }

  async sendMessage(input: SendMessageInput): Promise<Message> {
    const body = input.body.trim();
    if (!body) throw new ValidationError("Message body is required");
    const client = await this.client();

    // Only the two participants may post. RLS enforces it too, but a clear
    // ForbiddenError beats a policy violation surfacing as an upstream error.
    const thread = await this.one(
      client.from("threads").select("*").eq("id", input.threadId).maybeSingle(),
      toThread,
    );
    if (!thread) throw new NotFoundError("Thread");
    if (input.senderType === "human") {
      if (thread.profile_id !== input.senderId) {
        throw new ForbiddenError("This is not your conversation");
      }
    } else if (thread.agent_id !== input.senderId) {
      throw new ForbiddenError("This agent is not part of that conversation");
    }

    const senderName =
      input.senderType === "agent"
        ? (await this.requireAgentById(input.senderId)).name
        : ((await this.getProfile(input.senderId))?.display_name ?? "You");

    const message = await this.one(
      client
        .from("messages")
        .insert({
          thread_id: input.threadId,
          sender_type: input.senderType,
          sender_id: input.senderId,
          sender_name: senderName,
          body,
        })
        .select("*")
        .maybeSingle(),
      toMessage,
    );
    if (!message) throw new UpstreamError("Message was not written");

    // The Inbox badge reads `threads.unread_count`; without this it is frozen
    // in supabase mode while the demo adapter moves it.
    await client
      .from("threads")
      .update({
        updated_at: message.created_at,
        unread_count: input.senderType === "human" ? 0 : thread.unread_count + 1,
      })
      .eq("id", input.threadId);
    return message;
  }

  async createThread(input: CreateThreadInput): Promise<ThreadWithMessages> {
    const agent = await this.requireAgentByHandle(input.agentHandle);
    const client = await this.client();
    const thread = await this.one(
      client
        .from("threads")
        .insert({
          profile_id: input.profileId,
          agent_id: agent.id,
          subject: input.subject,
          unread_count: 0,
        })
        .select("*")
        .maybeSingle(),
      toThread,
    );
    if (!thread) throw new UpstreamError("Thread was not created");

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
    const client = await this.client();
    const wallet = await this.one(
      client.from("wallets").select("*").eq("profile_id", profileId).maybeSingle(),
      toWallet,
    );
    if (!wallet) return null;
    // Present the counter the way `hold_funds` reads it: a stale
    // `spend_today_date` is zero, never yesterday's total charged against
    // today's ceiling.
    const today = this.nowIso().slice(0, 10);
    return wallet.spend_today_date >= today
      ? wallet
      : { ...wallet, spend_today_cents: 0, spend_today_date: today };
  }

  async listTransactions(profileId: UUID, limit = 20): Promise<WalletTransaction[]> {
    const client = await this.client();
    return this.many(
      client
        .from("wallet_transactions")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(limit),
      toWalletTransaction,
    );
  }

  async topUp(profileId: UUID, amountCents: number): Promise<Wallet> {
    if (amountCents <= 0) throw new ValidationError("Top-up must be greater than zero");
    const client = await this.client();
    const { data, error } = await client.rpc("top_up_wallet", {
      p_amount: amountCents,
      p_memo: "Added credits",
      p_actor: this.actor(),
    });
    if (error) {
      if (/wallet not found/i.test(error.message ?? "")) throw new NotFoundError("Wallet");
      throw new UpstreamError(error.message);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) return toWallet(asRow(row));
    const wallet = await this.getWallet(profileId);
    if (!wallet) throw new NotFoundError("Wallet");
    return wallet;
  }

  /**
   * The three policy columns — `approval_threshold_cents`,
   * `autonomous_spend_limit_cents` and `autonomous_paused` — are the only part
   * of a wallet a human may write. 0007 revokes table-level UPDATE on `wallets`
   * and grants back exactly those (0005's column revokes were a no-op on a real
   * project), so this is a plain owner-scoped update rather than an RPC.
   */
  async updateWalletPolicy(profileId: UUID, patch: WalletPolicyPatch): Promise<Wallet> {
    const update: Record<string, number | boolean> = {};
    if (patch.approvalThresholdCents !== undefined) {
      if (patch.approvalThresholdCents < 0) {
        throw new ValidationError("The approval threshold cannot be negative");
      }
      update.approval_threshold_cents = Math.round(patch.approvalThresholdCents);
    }
    if (patch.autonomousSpendLimitCents !== undefined) {
      if (patch.autonomousSpendLimitCents < 0) {
        throw new ValidationError("The daily autonomous ceiling cannot be negative");
      }
      update.autonomous_spend_limit_cents = Math.round(patch.autonomousSpendLimitCents);
    }
    if (patch.autonomousPaused !== undefined) {
      update.autonomous_paused = patch.autonomousPaused;
    }
    if (Object.keys(update).length === 0) {
      const current = await this.getWallet(profileId);
      if (!current) throw new NotFoundError("Wallet");
      return current;
    }

    const client = await this.client();
    const wallet = await this.one(
      client
        .from("wallets")
        .update({ ...update, updated_at: this.nowIso() })
        .eq("profile_id", profileId)
        .select("*")
        .maybeSingle(),
      toWallet,
    );
    if (!wallet) throw new NotFoundError("Wallet");
    return wallet;
  }

  /* -------------------------------------------------------------- profiles */

  async getProfile(id: UUID): Promise<Profile | null> {
    const client = await this.client();
    return this.one(client.from("profiles").select("*").eq("id", id).maybeSingle(), toProfile);
  }

  async getProfileByHandle(handle: Handle): Promise<Profile | null> {
    const client = await this.client();
    return this.one(
      client.from("profiles").select("*").eq("handle", handle).maybeSingle(),
      toProfile,
    );
  }

  /**
   * Three columns, straight through PostgREST — no RPC needed.
   *
   * `profiles_update_self` (0002) scopes the row to `auth.uid()` and 0010's
   * column grant scopes the fields, so a widened patch object here cannot
   * become a widened write: Postgres refuses the statement. The `.eq("id", …)`
   * is belt and braces for the service-role path, where RLS is bypassed.
   */
  async updateProfile(profileId: UUID, patch: UpdateProfileInput): Promise<Profile> {
    const update: Record<string, unknown> = { updated_at: this.nowIso() };
    if (patch.display_name !== undefined) update.display_name = patch.display_name.trim();
    if (patch.bio !== undefined) {
      const bio = patch.bio === null ? null : patch.bio.trim();
      update.bio = bio && bio.length > 0 ? bio : null;
    }
    if (patch.avatar_url !== undefined) {
      const avatar = patch.avatar_url === null ? null : patch.avatar_url.trim();
      update.avatar_url = avatar && avatar.length > 0 ? avatar : null;
    }

    const client = await this.client();
    const updated = await this.one(
      client.from("profiles").update(update).eq("id", profileId).select("*").maybeSingle(),
      toProfile,
    );
    // Zero rows is what RLS answers with when the row is not yours.
    if (!updated) throw new ForbiddenError("You can only edit your own profile");
    return updated;
  }

  async getCurrentProfile(): Promise<Profile | null> {
    // A service-role repository has no session by design — the caller proved
    // who they are with an API key at the app layer.
    if (this.actAs) return this.getProfile(this.actAs);
    const client = await this.client();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return null;
    return this.getProfile(user.id);
  }

  /* -------------------------------------------------------------- api keys */

  async listApiKeys(profileId: UUID): Promise<ApiKey[]> {
    const client = await this.client();
    return this.many(
      client
        .from("api_keys")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false }),
      toApiKey,
    );
  }

  async createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const client = await this.client();
    const raw = generateApiKey();
    const record = await this.one(
      client
        .from("api_keys")
        .insert({
          profile_id: input.profileId,
          label: input.label,
          key_hash: await hashApiKey(raw),
          key_prefix: apiKeyPrefix(raw),
          scopes: input.scopes,
          agent_id: input.agentId ?? null,
        })
        .select("*")
        .maybeSingle(),
      toApiKey,
    );
    if (!record) throw new UpstreamError("API key was not created");
    return { key: raw, record };
  }

  async revokeApiKey(id: UUID, profileId: UUID): Promise<void> {
    const client = await this.client();
    const deleted = await this.one(
      client
        .from("api_keys")
        .delete()
        .eq("id", id)
        .eq("profile_id", profileId)
        .select("id")
        .maybeSingle(),
      (row) => String(row.id ?? ""),
    );
    if (!deleted) throw new NotFoundError("API key");
  }

  async verifyApiKey(rawKey: string): Promise<ApiKey | null> {
    const raw = rawKey.trim();
    if (!raw.startsWith(API_KEY_PREFIX)) return null;
    const client = await this.client();

    // `api_keys` is owner-scoped under RLS, so lookup goes through the
    // `security definer` helper from migration 0004. Both digest algorithms are
    // offered: `sha1$` for seeded keys, `sha256$` for keys minted at runtime.
    const hashes = [`sha1$${sha1Hex(raw)}`, `sha256$${await sha256Hex(raw)}`];
    const { data, error } = await client.rpc("verify_api_key", { p_key_hashes: hashes });
    if (error) throw new UpstreamError(error.message);
    const rows = asRows(data);
    return rows.length > 0 ? toApiKey(rows[0]) : null;
  }
}

/* -------------------------------------------------------------------------- */
/* Local helpers (shared shape with the demo adapter's sorting)               */
/* -------------------------------------------------------------------------- */

function matchesAgentFilter(
  agent: Agent,
  filter: Pick<AgentFilter, "category" | "room" | "status" | "maxPriceCents" | "skills" | "freeOnly">,
): boolean {
  if (filter.category && agent.category !== filter.category) return false;
  if (filter.room && agent.room_slug !== filter.room) return false;
  if (filter.status && agent.status !== filter.status) return false;
  if (filter.freeOnly && !agent.is_free) return false;
  if (filter.maxPriceCents !== undefined && agent.starting_price_cents > filter.maxPriceCents) {
    return false;
  }
  if (filter.skills && filter.skills.length > 0) {
    const owned = agent.skills.map((skill) => skill.toLowerCase());
    const wanted = filter.skills.map((skill) => skill.toLowerCase());
    if (!wanted.some((skill) => owned.some((have) => have.includes(skill)))) return false;
  }
  return true;
}

/**
 * Escape `%`, `_` and `\` in a user-supplied search term. PostgREST's `ilike`
 * takes the pattern verbatim, so an unescaped `%` matches every row and defeats
 * the index. Mirrors `public.like_escape()` in 0003_functions.sql.
 */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** One predicate set, applied to both the search branch and the SQL branch. */
function matchesGigFilter(
  gig: Gig,
  filter: Pick<GigFilter, "category" | "maxPriceCents" | "tags"> & { agentId?: UUID | null },
): boolean {
  if (filter.category && gig.category !== filter.category) return false;
  if (filter.agentId && gig.agent_id !== filter.agentId) return false;
  if (filter.maxPriceCents !== undefined && gig.starting_price_cents > filter.maxPriceCents) {
    return false;
  }
  if (filter.tags && filter.tags.length > 0) {
    const owned = gig.tags.map((tag) => tag.toLowerCase());
    if (!filter.tags.some((tag) => owned.includes(tag.toLowerCase()))) return false;
  }
  return true;
}

function sortAgents(agents: Agent[], sort: NonNullable<AgentFilter["sort"]>): Agent[] {
  return agents.slice().sort((a, b) => {
    switch (sort) {
      case "rating":
        return b.rating_avg - a.rating_avg || b.rating_count - a.rating_count;
      case "price":
        return a.starting_price_cents - b.starting_price_cents;
      case "newest":
        return b.created_at.localeCompare(a.created_at);
      default:
        return trendingAgentScore(b) - trendingAgentScore(a) || b.rating_avg - a.rating_avg;
    }
  });
}

function sortGigs(gigs: Gig[], sort: NonNullable<GigFilter["sort"]>): Gig[] {
  return gigs.slice().sort((a, b) => {
    switch (sort) {
      case "rating":
        return b.rating_avg - a.rating_avg || b.rating_count - a.rating_count;
      case "price":
        return a.starting_price_cents - b.starting_price_cents;
      case "newest":
        return b.created_at.localeCompare(a.created_at);
      case "fastest":
        return a.delivery_seconds - b.delivery_seconds;
      default:
        return compareTrendingGigs(a, b);
    }
  });
}

export function createSupabaseRepository(
  clientFactory: () => Promise<SupabaseClient | null>,
): SupabaseRepository {
  return new SupabaseRepository(clientFactory);
}
