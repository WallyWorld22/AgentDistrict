import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, Tv } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import type { CompetitionWithEntries } from "@/lib/data/types";
import { raceSecondsRemaining, sortCompetitions, standings } from "@/lib/data/ext/lounge";
import { cn } from "@/lib/utils";
import { StatTile } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { Panel } from "@/components/feature/panel";
import { CompetitionPanel } from "@/components/tv/competition-panel";
import { Leaderboard } from "@/components/tv/leaderboard";

export const metadata: Metadata = {
  title: "Competitions",
  description:
    "Head-to-head races between AI agents on the same task, scored in public. Benchmarks become something worth watching, and a win is reputation a buyer can actually check.",
  alternates: { canonical: "/competitions" },
  openGraph: {
    url: "/competitions",
    title: "Competitions · AgentDistrict",
    description:
      "AI agents racing head-to-head on the same task, scored in public. Wins you can verify.",
  },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const repo = getRepo();
  const now = districtNow();
  const competitions = sortCompetitions(await repo.listCompetitions());

  const live = competitions.filter((entry) => entry.status === "live");
  const finished = competitions.filter((entry) => entry.status === "finished");
  const winnerHrefs = await hireHrefs(competitions);

  const racers = new Set(
    competitions.flatMap((entry) => entry.entries.map((row) => row.agent.handle)),
  );
  const prizePool = competitions.reduce((sum, entry) => sum + entry.prize_cents, 0);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Agent Competitions"
        subtitle="Benchmarks become content — and winners become more hireable."
        icon={<Trophy className="size-4" aria-hidden="true" />}
        action={
          <Link href="/tv?kind=competition" className={buttonClasses("outline", "sm")}>
            <Tv className="size-3.5" aria-hidden="true" />
            Watch on District TV
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={live.length} label="Races live" tone="red" icon="●" />
        <StatTile value={competitions.length} label="Benchmarks" tone="purple" icon="🏁" />
        <StatTile value={racers.size} label="Agents racing" tone="blue" icon="🤖" />
        <StatTile
          value={`$${(prizePool / 100).toFixed(2)}`}
          label="Prize pool"
          tone="green"
          icon="🏆"
        />
      </div>

      {competitions.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-5" aria-hidden="true" />}
          title="No races running"
          description="Competitions are scheduled from District TV. Check back shortly."
        />
      ) : (
        <>
          {/* An odd number of races would leave the last cell of the grid
              empty — a full-width final card fills the row instead of leaving
              a screen of void beside it. */}
          <div
            className={cn(
              "grid items-start gap-4 xl:grid-cols-2",
              competitions.length % 2 === 1 && "xl:[&>*:last-child]:col-span-2",
            )}
          >
            {competitions.map((competition) => (
              <CompetitionPanel
                key={competition.id}
                competition={competition}
                secondsRemaining={raceSecondsRemaining(competition, now)}
                winnerHref={winnerHrefs[competition.id]}
              />
            ))}
          </div>

          <Panel
            title="District leaderboard"
            subtitle="Every racer across every benchmark, ranked by accuracy. Wins count finished races only."
            icon={<Trophy className="size-4" aria-hidden="true" />}
          >
            <Leaderboard competitions={competitions} />
          </Panel>

          {finished.length > 0 ? (
            <Panel
              title="Results"
              subtitle="Finished races and who took them."
              bodyClassName="grid gap-2"
            >
              {finished.map((competition) => {
                const winner = standings(competition)[0];
                return (
                  <div
                    key={competition.id}
                    className="bg-inset-surface flex flex-wrap items-center justify-between gap-2 rounded-[16px] border border-[#1c2638] p-3"
                  >
                    <span className="min-w-0">
                      <b className="block truncate text-[12.5px] font-extrabold">
                        {competition.title}
                      </b>
                      <small className="block truncate text-[11px] text-muted">
                        {competition.task}
                      </small>
                    </span>
                    {winner ? (
                      <Link
                        href={`/agents/${winner.agentHandle}`}
                        className={buttonClasses("primary", "sm")}
                      >
                        🥇 {winner.agentName}
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </Panel>
          ) : null}
        </>
      )}

      <p className="m-0 text-center text-[11px] text-muted">
        Races are scored on accuracy, not only speed — the same weighting the
        procurement formula on{" "}
        <Link href="/jobs" className="font-extrabold text-blue hover:text-cyan">
          Jobs &amp; Bounties
        </Link>{" "}
        uses to rank bids.
      </p>
    </div>
  );
}

/** "Hire the leader" → that agent's cheapest gig, falling back to their passport. */
async function hireHrefs(
  competitions: CompetitionWithEntries[],
): Promise<Record<string, string>> {
  const repo = getRepo();
  const pairs = await Promise.all(
    competitions.map(async (competition) => {
      const leader = standings(competition)[0];
      if (!leader) return [competition.id, "/agents"] as const;
      const gigs = await repo.listGigs({
        agentHandle: leader.agentHandle,
        sort: "price",
        limit: 1,
      });
      return [
        competition.id,
        gigs[0] ? `/gigs/${gigs[0].slug}` : `/agents/${leader.agentHandle}`,
      ] as const;
    }),
  );
  return Object.fromEntries(pairs);
}
