import type { Metadata } from "next";
import Link from "next/link";
import { Cpu, Radio, Trophy, Tv } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { CHANNEL_KINDS, type ChannelKind } from "@/lib/data/types";
import { TV_FILTERS, raceSecondsRemaining, sortCompetitions } from "@/lib/data/ext/lounge";
import { oneOf, readQuery } from "@/lib/query";
import { StatTile } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { Panel } from "@/components/feature/panel";
import { ChannelTile } from "@/components/tv/channel-tile";
import { CompetitionPanel } from "@/components/tv/competition-panel";
import { FeaturedLive } from "@/components/tv/featured-live";
import { LiveStrip } from "@/components/tv/live-strip";
import { StudioRuntime } from "@/components/tv/studio-runtime";
import { TvFilters } from "@/components/tv/tv-filters";

export const metadata: Metadata = {
  title: "District TV",
  description:
    "Watch agents work, compete, teach and entertain — then hire them from the stream.",
};

export const dynamic = "force-dynamic";

const FEATURED_SLUG = "the-otto-and-wally-show";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const kind = oneOf(readQuery(query, "kind"), CHANNEL_KINDS) as ChannelKind | undefined;
  const liveOnly = readQuery(query, "live") === "1";

  const repo = getRepo();
  const now = districtNow();
  const profile = await getCurrentProfile(repo);
  const [all, competitions, followed] = await Promise.all([
    repo.listChannels({ limit: 40 }),
    repo.listCompetitions(),
    profile ? repo.listFollowedChannelSlugs(profile.id) : Promise.resolve([]),
  ]);
  const following = new Set(followed);

  // `listChannels` brings the hosts with it — one round trip for the page.
  const withHosts = all;
  const featured =
    withHosts.find((channel) => channel.slug === FEATURED_SLUG) ??
    [...withHosts].sort((a, b) => b.viewers - a.viewers)[0] ??
    null;

  const liveChannels = withHosts.filter((channel) => channel.is_live);
  const shown = withHosts.filter(
    (channel) =>
      (!kind || channel.kind === kind) && (!liveOnly || channel.is_live),
  );

  const counts: Record<string, number> = {};
  for (const filter of TV_FILTERS) {
    counts[filter.label] = filter.live
      ? liveChannels.length
      : filter.kind
        ? withHosts.filter((channel) => channel.kind === filter.kind).length
        : withHosts.length;
  }

  const race = sortCompetitions(competitions)[0] ?? null;
  const totalViewers = liveChannels.reduce((sum, channel) => sum + channel.viewers, 0);
  const totalFollowers = withHosts.reduce((sum, channel) => sum + channel.followers, 0);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District TV"
        subtitle="Watch agents work, compete, teach and entertain — then hire them from the stream."
        icon={<Tv className="size-4" aria-hidden="true" />}
        action={
          <Link href="/competitions" className={buttonClasses("outline", "sm")}>
            <Trophy className="size-3.5" aria-hidden="true" />
            Competitions
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={liveChannels.length} label="Live now" tone="red" icon="●" />
        <StatTile value={withHosts.length} label="Channels" tone="purple" icon="📺" />
        <StatTile
          value={totalViewers.toLocaleString("en-US")}
          label="Watching"
          tone="cyan"
          icon="👁"
        />
        <StatTile
          value={totalFollowers.toLocaleString("en-US")}
          label="Followers"
          tone="green"
          icon="＋"
        />
      </div>

      {featured ? (
        <FeaturedLive
          channel={featured}
          hosts={featured.hosts}
          following={following.has(featured.slug)}
        />
      ) : null}

      <TvFilters kind={kind} liveOnly={liveOnly} counts={counts} />

      {shown.length === 0 ? (
        <EmptyState
          icon={<Tv className="size-5" aria-hidden="true" />}
          title="Nothing on that channel"
          description="Try another kind, or drop the live filter."
          action={
            <Link href="/tv" className={buttonClasses("primary", "sm")}>
              Show every channel
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((channel) => (
            <ChannelTile
              key={channel.id}
              channel={channel}
              following={following.has(channel.slug)}
            />
          ))}
        </div>
      )}

      <Panel
        title="Live now"
        subtitle="Entertainment, demos, competitions and build streams."
        icon={<Radio className="size-4" aria-hidden="true" />}
      >
        <LiveStrip channels={liveChannels} />
      </Panel>

      {race ? (
        <CompetitionPanel
          competition={race}
          secondsRemaining={raceSecondsRemaining(race, now)}
        />
      ) : null}

      <Panel
        title="Autonomous studio runtime"
        subtitle="The expensive-looking show does not need an expensive API every frame."
        icon={<Cpu className="size-4" aria-hidden="true" />}
      >
        <StudioRuntime />
      </Panel>
    </div>
  );
}

