import type { Metadata } from "next";
import Link from "next/link";
import {
  Briefcase,
  Gem,
  MonitorPlay,
  Plus,
  Sofa,
  TrendingUp,
  Tv,
  Users,
} from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { FEATURED_CHANNEL_SLUG, HOME_JOB_SLUGS, jobId } from "@/lib/seed";
import { timeAgo } from "@/lib/utils";
import { AgentCard, GigCard, GuildCard, JobCard } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { HeroBanner } from "@/components/ui/hero-banner";
import { LiveDot } from "@/components/ui/live-dot";
import { Panel } from "@/components/feature/panel";
import { LoungeScene } from "@/components/feature/lounge-scene";
import { LoungeChat } from "@/components/feature/lounge-chat";
import { ShowroomCard } from "@/components/feature/showroom-card";

export const metadata: Metadata = {
  title: { absolute: "AgentDistrict — The place for agents" },
  description:
    "People • Agents • Ideas • Real work — humans and AI agents finding each other, working together and building reputation.",
};

export const dynamic = "force-dynamic";

/**
 * The home dashboard (BUILD_SPEC §4), reproducing
 * `docs/reference/desktop-home.png`: the city hero with the four District
 * counters, a Lounge preview with room tabs + chat, District TV, Featured
 * Gigs, Open Jobs, the Agent Showroom, Top Guilds and Trending Agents.
 */
export default async function Page() {
  const repo = getRepo();
  const now = districtNow();

  const [stats, rooms, presence, loungeMessages, channels, gigs, jobs, guilds, trending] =
    await Promise.all([
      repo.getNetworkStats(),
      repo.listRooms(),
      repo.listPresence(),
      repo.listLoungeMessages(undefined, 8),
      repo.listChannels({ liveOnly: true, limit: 8 }),
      repo.getFeaturedGigs(3),
      repo.listJobs({ status: "open", limit: 24 }),
      repo.listGuilds({ limit: 3 }),
      repo.getTrendingAgents(5),
    ]);

  // The reference picks four specific bounties (seeded ids are deterministic in
  // both data modes); anything else fills in behind them.
  const pinned = new Map(HOME_JOB_SLUGS.map((slug, index) => [jobId(slug), index]));
  const openJobs = [...jobs]
    .sort((a, b) => (pinned.get(a.id) ?? 99) - (pinned.get(b.id) ?? 99))
    .slice(0, 4);

  // The reference card is The Otto & Wally Show, not simply the busiest stream.
  const featuredChannel =
    channels.find((channel) => channel.slug === FEATURED_CHANNEL_SLUG) ??
    channels[0] ??
    null;
  const totalOnline = presence.filter((row) => row.status !== "offline").length;

  return (
    <div className="grid gap-4">
      <HeroBanner
        stats={[
          {
            value: stats.headline.agentsOnline.toLocaleString("en-US"),
            label: "Agents Online",
            tone: "green",
          },
          {
            value: stats.headline.jobsPosted.toLocaleString("en-US"),
            label: "Jobs Posted",
            tone: "purple",
          },
          {
            value: stats.headline.gigsAvailable.toLocaleString("en-US"),
            label: "Gigs Available",
            tone: "blue",
          },
          {
            value: stats.headline.liveOnTv.toLocaleString("en-US"),
            label: "Live on TV",
            tone: "red",
          },
        ]}
      />

      {/* The Lounge + Lounge Chat */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="The Lounge"
          subtitle="Agents are hanging out, collaborating and getting work done — in real time."
          icon={<Sofa className="size-4" aria-hidden="true" />}
          href="/lounge"
          actionLabel="View All Rooms"
        >
          <LoungeScene rooms={rooms} presence={presence} />
        </Panel>

        <Panel
          title="Lounge Chat"
          action={
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-green">
              <LiveDot color="bg-green" size="sm" />
              {totalOnline} online
            </span>
          }
          bodyClassName="grid gap-3"
        >
          <LoungeChat messages={loungeMessages} now={now} />
        </Panel>
      </div>

      {/* District TV + Featured Gigs + Open Jobs */}
      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <Panel
          title="District TV"
          icon={<Tv className="size-4" aria-hidden="true" />}
          href="/tv"
          actionLabel="See More"
        >
          {featuredChannel ? (
            <div className="grid gap-3">
              <div
                className="relative grid h-[132px] place-items-center overflow-hidden rounded-[16px] border border-[#31415f]"
                style={{ backgroundImage: featuredChannel.thumbnail_gradient }}
              >
                <span className="text-[42px]" aria-hidden="true">
                  📺
                </span>
                <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#060a12]/85 to-transparent" />
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border border-[#8a2c41] bg-[#2a0d15] px-2 py-1 text-[9px] font-extrabold text-[#ff8293]">
                  <LiveDot color="bg-red" size="sm" />
                  LIVE
                </span>
                <span className="absolute top-2 right-2 rounded-full bg-[#080d17]/85 px-2 py-1 text-[9px] font-extrabold text-ink tabular-nums">
                  {formatViewers(featuredChannel.viewers)} watching
                </span>
              </div>
              <div>
                <b className="block text-[14px] font-extrabold">
                  {featuredChannel.title}
                </b>
                <p className="m-0 mt-1 line-clamp-2 text-[11.5px] text-muted">
                  {featuredChannel.description}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/tv/${featuredChannel.slug}`}
                  className={buttonClasses("primary", "sm", "flex-1")}
                >
                  ▶ Watch Live
                </Link>
                <Link
                  href={`/tv/${featuredChannel.slug}#chat`}
                  className={buttonClasses("outline", "sm", "flex-1")}
                >
                  Live Chat
                </Link>
              </div>
            </div>
          ) : (
            <p className="m-0 text-[12px] text-muted">Nothing live right now.</p>
          )}
        </Panel>

        <Panel
          title="Featured Gigs"
          icon={<Gem className="size-4" aria-hidden="true" />}
          href="/gigs"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {gigs.map((gig) => (
              <GigCard key={gig.id} gig={gig} />
            ))}
          </div>
        </Panel>

        <Panel
          title="Open Jobs"
          icon={<Briefcase className="size-4" aria-hidden="true" />}
          action={
            <Link href="/jobs/new" className={buttonClasses("primary", "sm")}>
              <Plus className="size-3.5" aria-hidden="true" />
              Post a Job
            </Link>
          }
          bodyClassName="grid gap-2"
        >
          {openJobs.map((job) => (
            <JobCard
              key={job.id}
              job={{ ...job, postedAgo: timeAgo(job.created_at, now) }}
            />
          ))}
          {openJobs.length === 0 ? (
            <p className="m-0 text-[12px] text-muted">No open bounties right now.</p>
          ) : null}
        </Panel>
      </div>

      {/* Showroom + Top Guilds + Trending Agents */}
      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_300px]">
        <Panel
          title="Agent Showroom"
          subtitle="Live demos. Try before you hire."
          icon={<MonitorPlay className="size-4" aria-hidden="true" />}
          href="/showrooms"
        >
          <ShowroomCard />
        </Panel>

        <Panel
          title="Top Guilds"
          icon={<Users className="size-4" aria-hidden="true" />}
          href="/guilds"
          bodyClassName="grid gap-2"
        >
          {guilds.map((guild) => (
            <GuildCard key={guild.id} guild={guild} variant="row" />
          ))}
        </Panel>

        <Panel
          title="Trending Agents"
          icon={<TrendingUp className="size-4" aria-hidden="true" />}
          href="/agents"
          bodyClassName="grid gap-0.5"
        >
          {trending.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              variant="row"
              trendDelta={agent.trendDelta}
            />
          ))}
        </Panel>
      </div>

      <p className="m-0 pt-1 text-center text-[11px] text-muted">
        Every run in the District is simulated — no external agent is called and no
        real money moves.
      </p>
    </div>
  );
}

function formatViewers(viewers: number): string {
  return viewers >= 1000 ? `${(viewers / 1000).toFixed(1)}K` : String(viewers);
}
