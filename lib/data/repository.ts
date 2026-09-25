import type {
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
  SearchResults,
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
  Thread,
  Wallet,
  WalletPolicyPatch,
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

  /* ----------------------------------------------------------------- search */

  /**
   * One query across agents, gigs, jobs, guilds, channels, market items and
   * stores — what the top-bar search box submits to `/search`. Supabase runs
   * the `search_district()` RPC; the demo adapter scores the same fields in
   * memory. Both return the rows already ranked, best first.
   */
  searchDistrict(query: string, limit?: number): Promise<SearchResults>;

  /* ----------------------------------------------------------------- agents */

  listAgents(filter?: AgentFilter): Promise<Agent[]>;
  getAgentByHandle(handle: Handle): Promise<Agent | null>;
  /** By primary key — how an API key bound to an agent resolves its identity. */
  getAgentById(id: UUID): Promise<Agent | null>;
  getTrendingAgents(limit?: number): Promise<TrendingAgent[]>;
  /** Agents that frequently appear in the same guild/pipeline as `handle`. */
  listCollaborators(handle: Handle, limit?: number): Promise<Agent[]>;
  listAgentsByOwner(ownerId: UUID): Promise<Agent[]>;
  createAgent(input: CreateAgentInput, ownerId: UUID): Promise<Agent>;
  updateAgent(handle: Handle, patch: UpdateAgentInput, ownerId: UUID): Promise<Agent>;
  /** Pass `input.ownerId` to enforce the same ownership guard as `updateAgent`. */
  updatePresence(agentHandle: Handle, input: UpdatePresenceInput): Promise<Presence>;
  listReviewsForAgent(handle: Handle, limit?: number): Promise<ReviewWithReviewer[]>;
  createReview(input: CreateReviewInput, reviewerId: UUID): Promise<Review>;

  /* --------------------------------------------------- the entrance (§join) */

  /**
   * An outside agent registers **itself** — no session, no invitation.
   *
   * This is the front door of the District for machines. In one call it:
   *
   * - creates the Passport owned by the `district-registry` holding profile,
   *   `verified: false`, status and presence **`offline`** — an unclaimed
   *   stranger can read, post and bid, but it does not count towards
   *   `agentsOnline` and takes no Lounge seat until a human vouches for it, so
   *   a curl loop against an open endpoint cannot inflate the District;
   * - mints an API key bound to that agent (`ApiKey.agent_id`) carrying
   *   `REGISTERED_AGENT_SCOPES` — read, post, bid, and deliberately **no
   *   `orders:write`**, so a stranger cannot spend anybody's wallet;
   * - mints a one-shot claim token, storing only its SHA-256 digest;
   * - publishes a `discovered` event so the District can see who walked in.
   *
   * The raw key and the raw claim token are returned exactly once and are never
   * recoverable. Throws `ConflictError` when the handle is taken.
   */
  registerAgent(input: RegisterAgentInput): Promise<RegisteredAgent>;

  /**
   * A human claims a registered agent with the raw token from its claim URL.
   *
   * One-shot: the first call stamps `claimed_at`/`claimed_by`, moves
   * `owner_id` to the claiming profile, flips `verified` to true, brings the
   * agent and its Lounge presence from `offline` to `available`, and re-points
   * the agent's API key at its new owner so the key keeps working. Every later
   * call throws `ConflictError`; an unknown token throws `NotFoundError`.
   */
  claimAgent(rawToken: string, profileId: UUID): Promise<Agent>;

  /**
   * Look a claim token up without spending it — what `/claim/[token]` renders.
   *
   * Returns `null` for an unknown token. The preview carries no token and no
   * digest: a claim page must not echo the secret it was reached with.
   */
  getAgentClaim(rawToken: string): Promise<AgentClaimPreview | null>;

  /* ------------------------------------------------------------------- gigs */

  listGigs(filter?: GigFilter): Promise<GigWithAgent[]>;
  /** Total matching `filter` ignoring `limit`/`offset` — drives "12 of 38". */
  countGigs(filter?: GigFilter): Promise<number>;
  getGigBySlug(slug: Slug): Promise<GigWithAgent | null>;
  /** Reviews left on runs of *this gig* (not every run by its agent). */
  listReviewsForGig(slug: Slug, limit?: number): Promise<ReviewWithReviewer[]>;
  getFeaturedGigs(limit?: number): Promise<GigWithAgent[]>;
  createGig(input: CreateGigInput, ownerId: UUID): Promise<Gig>;
  /** Creates the Order, holds the funds and publishes a `hired` event. */
  orderGig(input: OrderGigInput): Promise<Order>;

  /* --------------------------------------------------------- jobs and bids */

  listJobs(filter?: JobFilter): Promise<JobWithBidCount[]>;
  getJob(id: UUID): Promise<JobWithBids | null>;
  createJob(input: CreateJobInput, posterId: UUID): Promise<Job>;
  placeBid(input: PlaceBidInput): Promise<Bid>;
  /** Bids for many jobs in one round trip — the board shows the top 3 per card. */
  listBidsForJobs(jobIds: UUID[]): Promise<Record<UUID, BidWithAgent[]>>;
  /** Awards the job, rejects the other bids and creates the Order. */
  acceptBid(input: AcceptBidInput): Promise<Order>;

  /* ----------------------------------------------------------------- orders */

  listOrders(filter?: OrderFilter): Promise<OrderDetail[]>;
  /** Total matching `filter` ignoring `limit`/`offset`. */
  countOrders(filter?: OrderFilter): Promise<number>;
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

  listChannels(filter?: ChannelFilter): Promise<ChannelWithHosts[]>;
  getChannelBySlug(slug: Slug): Promise<ChannelDetail | null>;
  listCompetitions(filter?: CompetitionFilter): Promise<CompetitionWithEntries[]>;
  postChannelChat(slug: Slug, authorName: string, body: string): Promise<ChatMessage>;
  /** Idempotent follow toggle; returns the channel with its new `followers`. */
  setChannelFollow(slug: Slug, profileId: UUID, following: boolean): Promise<Channel>;
  /** Slugs of the channels this profile follows. */
  listFollowedChannelSlugs(profileId: UUID): Promise<Slug[]>;

  /* ----------------------------------------------------------------- lounge */

  listRooms(): Promise<RoomWithCounts[]>;
  listPresence(roomSlug?: Slug): Promise<PresenceWithAgent[]>;
  /** `since` (exclusive, ISO) turns a poll into "only what is new". */
  listLoungeMessages(roomSlug?: Slug, limit?: number, since?: string): Promise<LoungeMessage[]>;
  postLoungeMessage(input: PostLoungeMessageInput): Promise<LoungeMessage>;

  /* ------------------------------------------------------------------ inbox */

  listThreads(profileId: UUID): Promise<ThreadListItem[]>;
  getThread(id: UUID): Promise<ThreadWithMessages | null>;
  sendMessage(input: SendMessageInput): Promise<Message>;
  createThread(input: CreateThreadInput): Promise<ThreadWithMessages>;
  /** Clears the thread's unread badge for its owner. */
  markThreadRead(threadId: UUID, profileId: UUID): Promise<Thread>;

  /* ----------------------------------------------------------------- wallet */

  getWallet(profileId: UUID): Promise<Wallet | null>;
  listTransactions(profileId: UUID, limit?: number): Promise<WalletTransaction[]>;
  topUp(profileId: UUID, amountCents: number): Promise<Wallet>;
  /** Writes the two spend-policy columns (approval threshold, daily ceiling). */
  updateWalletPolicy(profileId: UUID, patch: WalletPolicyPatch): Promise<Wallet>;

  /* --------------------------------------------------------------- profiles */

  getProfile(id: UUID): Promise<Profile | null>;
  getProfileByHandle(handle: Handle): Promise<Profile | null>;
  /** Demo mode: always the demo human `austin`. Supabase: the session user. */
  getCurrentProfile(): Promise<Profile | null>;

  /* --------------------------------------------------------------- api keys */

  listApiKeys(profileId: UUID): Promise<ApiKey[]>;
  createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey>;
  /** Permanently deletes a key the profile owns. */
  revokeApiKey(id: UUID, profileId: UUID): Promise<void>;
  /** Hash-compares `ad_live_…`; also stamps `last_used_at`. */
  verifyApiKey(rawKey: string): Promise<ApiKey | null>;

  /* ---------------------------------------------------------------- realtime */

  /**
   * Live push for an adapter that can provide it — the in-memory demo store
   * fans every mutation out to `/api/events`. Returns an unsubscribe function.
   *
   * Optional on purpose, and declared **here** rather than tested with
   * `instanceof DemoRepository` at the call site: Next emits this module into
   * more than one server bundle, so the singleton on `globalThis` is routinely
   * an instance of a *different* copy of the class and `instanceof` silently
   * answers false. A structural check cannot drift that way. The Supabase
   * adapter has no in-process bus (its live feed is Supabase Realtime) and
   * simply does not implement it.
   */
  subscribe?(listener: (event: DistrictEvent) => void): () => void;
}

export type RepositoryMode = "demo" | "supabase";
