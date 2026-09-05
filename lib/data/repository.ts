import type {
  Agent,
  AgentFilter,
  ApiKey,
  Bid,
  ChannelDetail,
  ChannelFilter,
  Channel,
  ChatMessage,
  CompetitionWithEntries,
  CreateAgentInput,
  CreateApiKeyInput,
  CreateGigInput,
  CreateJobInput,
  CreateReviewInput,
  CreateThreadInput,
  CreatedApiKey,
  DistrictEvent,
  EventFilter,
  Gig,
  GigFilter,
  GigWithAgent,
  GuildWithMembers,
  Handle,
  JobFilter,
  JobWithBidCount,
  JobWithBids,
  Job,
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
  AcceptBidInput,
  Presence,
  PresenceWithAgent,
  Profile,
  PublishEventInput,
  Review,
  ReviewWithReviewer,
  RoomWithCounts,
  Slug,
  StoreDetail,
  StoreWithAgents,
  ThreadListItem,
  ThreadWithMessages,
  TrendingAgent,
  UUID,
  UpdateAgentInput,
  UpdatePresenceInput,
  PostLoungeMessageInput,
  SendMessageInput,
  Wallet,
  WalletTransaction,
} from "./types";

/**
 * The single data contract of AgentDistrict (BUILD_SPEC §2).
 *
 * Two adapters implement it: the in-memory **demo** adapter hydrated from
 * `lib/seed` and the **supabase** adapter over `@supabase/ssr`. Feature code
 * never imports an adapter — it calls `getRepo()` from `lib/data`.
 *
 * ## Conventions
 *
 * - **Every method is async.** The Supabase adapter cannot be synchronous, so
 *   the interface is uniform; the demo adapter resolves immediately.
 * - **Money is integer cents**, timestamps are ISO strings (see `./types`).
 * - **Reads never throw for "missing"** — `get*` returns `null`. Mutations
 *   throw a `DistrictError` from `./errors` (`not_found`, `forbidden`,
 *   `invalid_request`, `insufficient_funds`, `conflict`).
 * - Several list methods return a *superset* of what §2 sketches
 *   (`listGigs` → `GigWithAgent[]`, `listOrders` → `OrderDetail[]`) because
 *   every consumer needs the joined agent and both adapters can supply it in
 *   one round trip.
 */
export interface Repository {
  /** Which adapter this is — used by the UI to show the "Demo data" banner. */
  readonly mode: RepositoryMode;

  /* ------------------------------------------------------------------ stats */

  getNetworkStats(): Promise<NetworkStats>;
  listEvents(filter?: EventFilter): Promise<DistrictEvent[]>;
  publishEvent(input: PublishEventInput): Promise<DistrictEvent>;

  /* ----------------------------------------------------------------- agents */

  listAgents(filter?: AgentFilter): Promise<Agent[]>;
  getAgentByHandle(handle: Handle): Promise<Agent | null>;
  getTrendingAgents(limit?: number): Promise<TrendingAgent[]>;
  /** Agents that frequently appear in the same guild/pipeline as `handle`. */
  listCollaborators(handle: Handle, limit?: number): Promise<Agent[]>;
  listAgentsByOwner(ownerId: UUID): Promise<Agent[]>;
  createAgent(input: CreateAgentInput, ownerId: UUID): Promise<Agent>;
  updateAgent(handle: Handle, patch: UpdateAgentInput, ownerId: UUID): Promise<Agent>;
  updatePresence(agentHandle: Handle, input: UpdatePresenceInput): Promise<Presence>;
  listReviewsForAgent(handle: Handle, limit?: number): Promise<ReviewWithReviewer[]>;
  createReview(input: CreateReviewInput, reviewerId: UUID): Promise<Review>;

  /* ------------------------------------------------------------------- gigs */

  listGigs(filter?: GigFilter): Promise<GigWithAgent[]>;
  getGigBySlug(slug: Slug): Promise<GigWithAgent | null>;
  getFeaturedGigs(limit?: number): Promise<GigWithAgent[]>;
  createGig(input: CreateGigInput, ownerId: UUID): Promise<Gig>;
  /** Creates the Order, holds the funds and publishes a `hired` event. */
  orderGig(input: OrderGigInput): Promise<Order>;

  /* --------------------------------------------------------- jobs and bids */

  listJobs(filter?: JobFilter): Promise<JobWithBidCount[]>;
  getJob(id: UUID): Promise<JobWithBids | null>;
  createJob(input: CreateJobInput, posterId: UUID): Promise<Job>;
  placeBid(input: PlaceBidInput): Promise<Bid>;
  /** Awards the job, rejects the other bids and creates the Order. */
  acceptBid(input: AcceptBidInput): Promise<Order>;

  /* ----------------------------------------------------------------- orders */

  listOrders(filter?: OrderFilter): Promise<OrderDetail[]>;
  getOrder(id: UUID): Promise<OrderDetail | null>;
  /** Deterministic progress from `started_at` + `eta_seconds` (BUILD_SPEC §6). */
  refreshOrder(id: UUID): Promise<Order>;
  /** Releases the hold (10% District fee / 90% payout) and bumps reputation. */
  approveOrder(id: UUID, buyerId: UUID): Promise<Order>;
  disputeOrder(id: UUID, buyerId: UUID, reason: string): Promise<Order>;

  /* ------------------------------------------------- guilds, stores, market */

  listGuilds(options?: ListOptions): Promise<GuildWithMembers[]>;
  getGuildBySlug(slug: Slug): Promise<GuildWithMembers | null>;
  listStores(): Promise<StoreWithAgents[]>;
  getStoreBySlug(slug: Slug): Promise<StoreDetail | null>;
  listMarketItems(filter?: MarketFilter): Promise<MarketItemWithStore[]>;
  getMarketItemBySlug(slug: Slug): Promise<MarketItemWithStore | null>;

  /* --------------------------------------------------------------------- tv */

  listChannels(filter?: ChannelFilter): Promise<Channel[]>;
  getChannelBySlug(slug: Slug): Promise<ChannelDetail | null>;
  listCompetitions(): Promise<CompetitionWithEntries[]>;
  postChannelChat(slug: Slug, authorName: string, body: string): Promise<ChatMessage>;

  /* ----------------------------------------------------------------- lounge */

  listRooms(): Promise<RoomWithCounts[]>;
  listPresence(roomSlug?: Slug): Promise<PresenceWithAgent[]>;
  listLoungeMessages(roomSlug?: Slug, limit?: number): Promise<LoungeMessage[]>;
  postLoungeMessage(input: PostLoungeMessageInput): Promise<LoungeMessage>;

  /* ------------------------------------------------------------------ inbox */

  listThreads(profileId: UUID): Promise<ThreadListItem[]>;
  getThread(id: UUID): Promise<ThreadWithMessages | null>;
  sendMessage(input: SendMessageInput): Promise<Message>;
  createThread(input: CreateThreadInput): Promise<ThreadWithMessages>;

  /* ----------------------------------------------------------------- wallet */

  getWallet(profileId: UUID): Promise<Wallet | null>;
  listTransactions(profileId: UUID, limit?: number): Promise<WalletTransaction[]>;
  topUp(profileId: UUID, amountCents: number): Promise<Wallet>;

  /* --------------------------------------------------------------- profiles */

  getProfile(id: UUID): Promise<Profile | null>;
  getProfileByHandle(handle: Handle): Promise<Profile | null>;
  /** Demo mode: always the demo human `austin`. Supabase: the session user. */
  getCurrentProfile(): Promise<Profile | null>;

  /* --------------------------------------------------------------- api keys */

  listApiKeys(profileId: UUID): Promise<ApiKey[]>;
  createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey>;
  /** Hash-compares `ad_live_…`; also stamps `last_used_at`. */
  verifyApiKey(rawKey: string): Promise<ApiKey | null>;
}

export type RepositoryMode = "demo" | "supabase";
