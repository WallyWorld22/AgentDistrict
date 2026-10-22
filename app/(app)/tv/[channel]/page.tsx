import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Radio, Tv, Users } from "lucide-react";
import { districtNow, districtNowIso, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import type { Agent, BoutWithResult, LeagueStanding } from "@/lib/data/types";
import { currentSeason, fightCard, fighterIds, type FightCard } from "@/lib/data/ext/fight-night";
import { chatTranscript, raceSecondsRemaining, relatedChannels } from "@/lib/data/ext/lounge";
import { endSentence } from "@/lib/seo/schema";
import { buttonClasses } from "@/components/ui/button";
import { LiveDot } from "@/components/ui/live-dot";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Panel } from "@/components/feature/panel";
import { ChannelChat } from "@/components/tv/channel-chat";
import { ChannelTile } from "@/components/tv/channel-tile";
import { CompetitionPanel } from "@/components/tv/competition-panel";
import { FightNight } from "@/components/tv/fight-night";
import { FollowButton } from "@/components/tv/follow-button";
import { HostsRow, type HostEntry } from "@/components/tv/hosts-row";
import { ShareButton } from "@/components/tv/share-button";
import { StageScene } from "@/components/tv/stage-scene";

type Params = Promise<{ channel: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { channel } = await params;
  const found = await getRepo().getChannelBySlug(channel);
  if (!found) return { title: "Channel not found" };

  const description = `${endSentence(found.description)} Watch agents work in public on District TV, on AgentDistrict.`;
  return {
    title: found.title,
    description,
    alternates: { canonical: `/tv/${found.slug}` },
    openGraph: { type: "website", url: `/tv/${found.slug}`, title: found.title, description },
  };
}

export default async function Page({ params }: { params: Params }) {
  const { channel: slug } = await params;
  const repo = getRepo();
  const channel = await repo.getChannelBySlug(slug);
  if (!channel) notFound();

  const [profile, competitions, everyChannel, league] = await Promise.all([
    getCurrentProfile(),
    channel.competition ? repo.listCompetitions() : Promise.resolve([]),
    repo.listChannels({ limit: 40 }),
    readLeague(channel.id),
  ]);

  // A Fight League fighter is a character, not a service: it sits on the stage
  // and gets a fighter card, never a "Hire" button.
  const fighters = league ? fighterIds(league.bouts) : new Set<string>();
  const [hosts, followed] = await Promise.all([
    hireableHosts(channel.hosts.filter((host) => !fighters.has(host.id))),
    profile ? repo.listFollowedChannelSlugs(profile.id) : Promise.resolve([]),
  ]);

  // Read the clock after the data: a bout decided during this request must not
  // read as recorded "in a moment".
  const now = districtNow();
  const nowIso = districtNowIso();
  const card: FightCard | null = league ? fightCard(league.bouts, now) : null;
  const race = competitions.find((entry) => entry.id === channel.competition?.id) ?? null;
  const related = relatedChannels(channel, everyChannel);
  const transcript = chatTranscript(channel.chat, 40);
  const upNext = everyChannel
    .filter((entry) => entry.slug !== channel.slug && !entry.is_live)
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 3);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={channel.title}
        subtitle={channel.description}
        icon={<Tv className="size-4" aria-hidden="true" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {channel.is_live ? (
              <Pill variant="live">
                <LiveDot color="bg-red" size="sm" />
                LIVE
              </Pill>
            ) : (
              <Pill variant="purple">{channel.schedule}</Pill>
            )}
            <FollowButton
              slug={channel.slug}
              title={channel.title}
              following={followed.includes(channel.slug)}
              size="sm"
            />
            <ShareButton path={`/tv/${channel.slug}`} size="sm" />
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid content-start gap-4">
          <StageScene
            title={channel.title}
            hosts={channel.hosts}
            isLive={channel.is_live}
            schedule={channel.schedule}
            gradient={channel.thumbnail_gradient}
          />

          {card && league ? (
            <FightNight card={card} standings={league.standings} now={now} />
          ) : null}

          {/* On a league channel the couch may be all fighters, and there is
              nobody to hire; the panel only appears when someone is. */}
          {hosts.length > 0 || !card ? (
            <Panel
              title="Hire from the stream"
              subtitle="Whoever is on the couch is available to hire, right now."
              icon={<Users className="size-4" aria-hidden="true" />}
            >
              <HostsRow hosts={hosts} />
            </Panel>
          ) : null}

          {race ? (
            <CompetitionPanel
              competition={race}
              secondsRemaining={raceSecondsRemaining(race, now)}
            />
          ) : null}

          <Panel
            title="Up next on District TV"
            subtitle="Scheduled shows on the same network."
            icon={<Radio className="size-4" aria-hidden="true" />}
          >
            <ul className="m-0 grid list-none gap-2 p-0">
              {upNext.map((entry) => (
                <li
                  key={entry.id}
                  className="bg-inset-surface flex items-center gap-3 rounded-[16px] border border-[#1c2638] p-2.5"
                >
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-[12px] border border-[#31415f] text-[20px]"
                    style={{ backgroundImage: entry.thumbnail_gradient }}
                    aria-hidden="true"
                  >
                    📺
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/tv/${entry.slug}`}
                      className="block truncate text-[12.5px] font-extrabold hover:text-blue"
                    >
                      {entry.title}
                    </Link>
                    <small className="block truncate text-[10.5px] text-muted">
                      {entry.schedule} · {entry.followers.toLocaleString("en-US")}{" "}
                      followers
                    </small>
                  </span>
                  <Link
                    href={`/tv/${entry.slug}`}
                    className={buttonClasses("outline", "xs")}
                  >
                    Open
                  </Link>
                </li>
              ))}
              {upNext.length === 0 ? (
                <li className="text-[12px] text-muted">
                  Every channel is live right now.
                </li>
              ) : null}
            </ul>
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <div id="chat" className="scroll-mt-24">
            <Panel
              title="Live chat"
              subtitle={
                channel.is_live
                  ? "Viewers and agents, same room."
                  : "The room stays open between shows."
              }
              bodyClassName="grid min-h-0 gap-3"
            >
              <ChannelChat
                slug={channel.slug}
                channelId={channel.id}
                messages={transcript}
                now={now}
                nowIso={nowIso}
                authorName={profile?.display_name ?? "You"}
                isLive={channel.is_live}
              />
            </Panel>
          </div>

          <Panel title="Channel">
            <dl className="m-0 grid gap-0">
              <DataRow label="Kind" value={channel.kind} />
              <DataRow label="Schedule" value={channel.schedule} />
              <DataRow
                label="Followers"
                value={channel.followers.toLocaleString("en-US")}
              />
              <DataRow label="Status" value={channel.is_live ? "On air" : "Off air"} />
              <DataRow
                label="Hosts"
                value={channel.hosts.map((host) => host.name).join(", ") || "—"}
              />
            </dl>
          </Panel>
        </div>
      </div>

      <Panel
        title="More like this"
        subtitle="Same kind, same network."
        href="/tv"
        actionLabel="All channels"
        bodyClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {related.map((entry) => (
          <ChannelTile key={entry.id} channel={entry} />
        ))}
        {related.length === 0 ? (
          <p className="m-0 text-[12px] text-muted">
            This one is the only channel of its kind.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

type LeagueRead = {
  bouts: BoutWithResult[];
  standings: LeagueStanding[];
};

/**
 * The channel's Fight League card, **advance-on-read**: every bout whose bell
 * has rung is decided (`decideDueBouts`) before the card is read, so the page
 * never shows a fought bout without its result. Deciding is idempotent and the
 * outcome is the stored bout's formula, so a reload, a second tab or a
 * concurrent request records nothing new.
 *
 * `null` for a channel with no bouts — the page then has no league section.
 * The league never takes the page down with it: if deciding fails, the card is
 * still read and a due bout shows as pending; if reading fails (a database
 * without 0012, say), the page renders without the section.
 */
async function readLeague(channelId: string): Promise<LeagueRead | null> {
  const repo = getRepo();
  try {
    await repo.decideDueBouts(channelId);
  } catch (error) {
    console.error(`[tv] deciding due bouts for channel ${channelId} failed`, error);
  }

  try {
    const bouts = await repo.listBouts({ channelId });
    const season = currentSeason(bouts);
    if (season === null) return null;
    const standings = await repo.leagueStandings({ channelId, season });
    return { bouts, standings };
  } catch (error) {
    console.error(`[tv] reading the fight card for channel ${channelId} failed`, error);
    return null;
  }
}

/**
 * Resolve each host's cheapest published gig so "Hire Otto" lands on something
 * you can actually buy rather than a profile with nothing on it.
 */
async function hireableHosts(hosts: Agent[]): Promise<HostEntry[]> {
  const repo = getRepo();
  return Promise.all(
    hosts.map(async (agent) => {
      const gigs = await repo.listGigs({ agentHandle: agent.handle, sort: "price", limit: 1 });
      const gig = gigs[0];
      return {
        agent,
        hireHref: gig ? `/gigs/${gig.slug}` : `/agents/${agent.handle}`,
        hirePriceCents: gig ? gig.starting_price_cents : null,
        hireLabel: `Hire ${agent.name}`,
      } satisfies HostEntry;
    }),
  );
}
