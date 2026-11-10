import { unstable_rethrow } from "next/navigation";
import type { Repository } from "@/lib/data/repository";
import { FEATURED_CHANNEL_SLUG } from "@/lib/seed";
import { loadEntrance, type DistrictEntrance } from "./feed";
import { loadAgentHubs } from "./home";

/**
 * Everything the Home dashboard reads, one section at a time (prod-02).
 *
 * The page used to await fifteen reads in a single `Promise.all`, so any one
 * of them failing replaced the whole page with the error boundary. Production
 * did exactly that: on 6 and 7 November Supabase refused a freshly refreshed
 * session token ("JWT issued at future") inside `listAgents`, `listGuilds`
 * and `listLoungeMessages`, and on two other days `getNetworkStats` hit a
 * network blip — each time a signed-in visitor got "something went offline"
 * instead of a home page with one empty card.
 *
 * Now every section loads on its own. One that throws is logged with its name
 * and the original error — `console.error`, so it still lands in the runtime
 * logs and alerts exactly as before — and comes back as its empty value, with
 * its name in `failed` so the page can say "this didn't load" rather than
 * pretend there is nothing there. Next's own control-flow throws (`notFound`,
 * `redirect`, dynamic-rendering bailouts) are rethrown, never swallowed.
 */

export const HOME_SECTIONS = [
  "profile",
  "stats",
  "rooms",
  "presence",
  "loungeMessages",
  "channels",
  "featuredChannel",
  "gigs",
  "jobs",
  "guilds",
  "trending",
  "hubs",
  "showroomAgent",
  "entrance",
] as const;

export type HomeSection = (typeof HOME_SECTIONS)[number];

type Read<K extends keyof Repository> = Repository[K] extends (...args: never[]) => Promise<infer T>
  ? T
  : never;

export type HomeDashboardData = {
  profile: Read<"getCurrentProfile">;
  /** `null` when the counters could not be read — show a dash, not a zero. */
  stats: Read<"getNetworkStats"> | null;
  rooms: Read<"listRooms">;
  presence: Read<"listPresence">;
  loungeMessages: Read<"listLoungeMessages">;
  channels: Read<"listChannels">;
  featuredChannel: Read<"getChannelBySlug">;
  gigs: Read<"getFeaturedGigs">;
  jobs: Read<"listJobs">;
  guilds: Read<"listGuilds">;
  trending: Read<"getTrendingAgents">;
  hubs: Awaited<ReturnType<typeof loadAgentHubs>>;
  showroomAgent: Read<"getAgentByHandle">;
  /** `null` when it could not be read — the counters hide, the doors stay. */
  entrance: DistrictEntrance | null;
  /** The sections that threw and are standing in empty. */
  failed: ReadonlySet<HomeSection>;
};

async function section<T>(
  name: HomeSection,
  read: () => Promise<T>,
  fallback: T,
  failed: Set<HomeSection>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    unstable_rethrow(error);
    failed.add(name);
    console.error(`[home] the "${name}" section failed to load; rendering it empty`, error);
    return fallback;
  }
}

export async function loadHomeDashboard(
  repo: Repository,
  options: { now: number },
): Promise<HomeDashboardData> {
  const failed = new Set<HomeSection>();
  const [
    profile,
    stats,
    rooms,
    presence,
    loungeMessages,
    channels,
    featuredChannel,
    gigs,
    jobs,
    guilds,
    trending,
    hubs,
    showroomAgent,
    entrance,
  ] = await Promise.all([
    section("profile", () => repo.getCurrentProfile(), null, failed),
    section("stats", () => repo.getNetworkStats(), null, failed),
    section("rooms", () => repo.listRooms(), [], failed),
    section("presence", () => repo.listPresence(), [], failed),
    section("loungeMessages", () => repo.listLoungeMessages(undefined, 10), [], failed),
    section("channels", () => repo.listChannels({ liveOnly: true, limit: 8 }), [], failed),
    section("featuredChannel", () => repo.getChannelBySlug(FEATURED_CHANNEL_SLUG), null, failed),
    section("gigs", () => repo.getFeaturedGigs(3), [], failed),
    section("jobs", () => repo.listJobs({ status: "open", limit: 24 }), [], failed),
    section("guilds", () => repo.listGuilds({ limit: 3 }), [], failed),
    section("trending", () => repo.getTrendingAgents(5), [], failed),
    section("hubs", () => loadAgentHubs(repo), [], failed),
    section("showroomAgent", () => repo.getAgentByHandle("roofintel"), null, failed),
    section("entrance", () => loadEntrance(repo, { now: options.now, arrivals: 5 }), null, failed),
  ]);

  return {
    profile,
    stats,
    rooms,
    presence,
    loungeMessages,
    channels,
    featuredChannel,
    gigs,
    jobs,
    guilds,
    trending,
    hubs,
    showroomAgent,
    entrance,
    failed,
  };
}
