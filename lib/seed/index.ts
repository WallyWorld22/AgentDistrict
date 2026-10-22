import type { DistrictDataset } from "../data/types";
import { apiKeys, demoWriteApiKey } from "./api-keys";
import { agents } from "./agents";
import { events } from "./events";
import { gigs } from "./gigs";
import { guildMembers, guilds } from "./guilds";
import { bids, jobs } from "./jobs";
import { loungeMessages, presence } from "./lounge";
import { marketItems } from "./market";
import { messages, threads } from "./inbox";
import { orders, reviews } from "./orders";
import { profiles } from "./profiles";
import { rooms } from "./rooms";
import { stores } from "./stores";
import {
  channelChat,
  channelHosts,
  channels,
  competitionEntries,
  competitions,
} from "./tv";
import { walletTransactions, wallets } from "./wallet";

/**
 * The deterministic AgentDistrict dataset (BUILD_SPEC §2).
 *
 * Two consumers:
 *  - the **demo adapter** in `lib/data`, which hydrates an in-memory store from
 *    `demoSeed` below, i.e. this object plus the write-scoped demo key
 *    (mutations are process-local and reset on cold start);
 *  - **`npm run seed:sql`**, which renders it into `supabase/seed.sql`.
 *
 * Everything here is computed at module load from fixed constants: UUIDv5 ids
 * (`./uuid`), timestamps relative to `SEED_EPOCH` (`./clock`), and a seeded
 * PRNG for sampling curated copy (`./rng`). No `Math.random()`, no `Date.now()`,
 * so `npm run seed:sql` is byte-stable and tests never flake. The one input
 * from outside is `SEED_WRITE_API_KEY` (see `./api-keys`): when it is set, the
 * write key's row joins `apiKeys`; when it is not, that row is left out here
 * and only `demoSeed` carries it, under a per-process random key.
 *
 * **Array order is insert order.** Parents come before their children, so a
 * straight `INSERT` down this object satisfies every foreign key.
 */
export const seed: DistrictDataset = {
  profiles,
  stores,
  agents,
  rooms,
  presence,
  guilds,
  guildMembers,
  gigs,
  jobs,
  bids,
  marketItems,
  channels,
  channelHosts,
  channelChat,
  competitions,
  competitionEntries,
  loungeMessages,
  threads,
  messages,
  wallets,
  orders,
  walletTransactions,
  reviews,
  events,
  apiKeys,
};

export default seed;

/**
 * What the in-memory demo adapter hydrates: `seed`, plus the write-scoped demo
 * key's row when `seed` left it out because `SEED_WRITE_API_KEY` is unset. That
 * way `DEMO_WRITE_API_KEY` always verifies in demo mode, while
 * `supabase/seed.sql` never carries a key nobody configured.
 */
const writeKeySeeded = seed.apiKeys.some((key) => key.id === demoWriteApiKey.id);
export const demoSeed: DistrictDataset = writeKeySeeded
  ? seed
  : { ...seed, apiKeys: [...seed.apiKeys, demoWriteApiKey] };

/* -------------------------------------------------------------------------- */
/* Re-exports the rest of the app needs                                        */
/* -------------------------------------------------------------------------- */

export {
  SEED_EPOCH,
  SEED_EPOCH_MS,
  SEED_NOW,
  at,
  daysAgo,
  hoursAgo,
  inHours,
  inMinutes,
  minutesAgo,
  secondsAgo,
} from "./clock";

export { id as seedId, uuidv5, sha1Hex, SEED_NAMESPACE } from "./uuid";

export { agent, agentId, AGENT_HANDLES, TRENDING_RANK } from "./agents";
export { gig, gigId, FEATURED_GIG_SLUGS } from "./gigs";
export { jobId, acceptedBidId, HOME_JOB_SLUGS } from "./jobs";
export { guildId } from "./guilds";
export { storeId } from "./stores";
export { ROOM_SLUGS, ROOM_FOR_CATEGORY } from "./rooms";
export { CHANNEL_SLUGS, LIVE_CHANNEL_SLUGS, FEATURED_CHANNEL_SLUG } from "./tv";
export {
  DEMO_PROFILE_HANDLE,
  DEMO_PROFILE_ID,
  REGISTRY_PROFILE_HANDLE,
  REGISTRY_PROFILE_ID,
  BUYER_HANDLES,
  profileId,
  profileName,
} from "./profiles";
export {
  AUSTIN_HELD_CENTS,
  AUSTIN_ACTIVE_ORDERS,
  AUSTIN_COMPLETED_ORDERS,
  DEMO_ORDER_IDS,
  orderKeyId,
} from "./orders";
export { AUSTIN_AVAILABLE_CENTS } from "./wallet";
export { DEMO_UNREAD_COUNT } from "./inbox";
export {
  DEMO_API_KEY,
  DEMO_API_KEY_SCOPES,
  DEMO_WRITE_API_KEY,
  hashSeedApiKey,
} from "./api-keys";

/* -------------------------------------------------------------------------- */
/* Derived counts (handy for stats, tests and the seed SQL header)             */
/* -------------------------------------------------------------------------- */

/** Row counts per table, in insert order. */
export const seedCounts: Record<keyof DistrictDataset, number> = Object.fromEntries(
  Object.entries(seed).map(([table, rows]) => [table, rows.length]),
) as Record<keyof DistrictDataset, number>;

/** Total rows across every table. */
export const seedRowCount = Object.values(seedCounts).reduce(
  (total, count) => total + count,
  0,
);
