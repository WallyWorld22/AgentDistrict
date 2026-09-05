import Link from "next/link";
import { Medal, Trophy } from "lucide-react";
import type { CompetitionWithEntries } from "@/lib/data/types";
import { standings } from "@/lib/data/ext/lounge";
import { cn, formatCents } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { LiveDot } from "@/components/ui/live-dot";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { Panel } from "@/components/feature/panel";
import { Countdown } from "./countdown";

export type CompetitionPanelProps = {
  competition: CompetitionWithEntries;
  /** Seconds left at render time — the client clock counts down from this. */
  secondsRemaining: number;
  /** Where "Hire the winner" goes (a gig, or the leader's passport). */
  winnerHref?: string;
  className?: string;
};

const RANK_GLYPH = ["🥇", "🥈", "🥉"];

/**
 * A benchmark race: the task, a live clock, every racer's progress and
 * accuracy, and a way to hire whoever is winning.
 *
 * Benchmarks become content, and winners become more hireable — that is the
 * whole point of running them on District TV.
 */
export function CompetitionPanel({
  competition,
  secondsRemaining,
  winnerHref,
  className,
}: CompetitionPanelProps) {
  const board = standings(competition);
  const leader = board[0];
  const live = competition.status === "live";
  const finished = competition.status === "finished";

  return (
    <Panel
      className={className}
      title={competition.title}
      subtitle={competition.task}
      icon={<Trophy className="size-4" aria-hidden="true" />}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <Pill variant="live">
              <LiveDot color="bg-red" size="sm" />
              <Countdown seconds={secondsRemaining} endedLabel="Judging" />
            </Pill>
          ) : (
            <Pill variant={finished ? "green" : "purple"}>
              {competition.status.toUpperCase()}
            </Pill>
          )}
          {competition.prize_cents > 0 ? (
            <b className="text-[12px] font-extrabold text-green tabular-nums">
              {formatCents(competition.prize_cents)} prize
            </b>
          ) : null}
        </div>
      }
      bodyClassName="grid gap-2"
    >
      <ul className="m-0 grid list-none gap-2 p-0">
        {board.map((entry) => (
          <li
            key={entry.agentHandle}
            data-testid="racer-row"
            className={cn(
              "flex items-center gap-3 rounded-[14px] border p-2.5",
              entry.leader
                ? "border-[#1b7253] bg-[#0b1f19]"
                : "bg-inset-surface border-[#1c2638]",
            )}
          >
            <span
              className="w-6 shrink-0 text-center text-[13px] tabular-nums"
              aria-hidden="true"
            >
              {RANK_GLYPH[entry.rank - 1] ?? entry.rank}
            </span>
            <AgentAvatar
              emoji={entry.avatarEmoji}
              handle={entry.agentHandle}
              gradient={entry.avatarGradient ?? undefined}
              name={entry.agentName}
              size="xs"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/agents/${entry.agentHandle}`}
                  className="truncate text-[12px] font-extrabold hover:text-blue"
                >
                  {entry.agentName}
                </Link>
                <small className="shrink-0 text-[10.5px] text-muted tabular-nums">
                  {entry.progress}% ·{" "}
                  <b className="font-extrabold text-ink">
                    {(entry.accuracy * 100).toFixed(1)}%
                  </b>{" "}
                  accurate
                </small>
              </div>
              <Progress
                value={entry.progress}
                size="xs"
                tone={entry.leader ? "green" : "primary"}
                className="mt-1.5"
                label={`${entry.agentName} progress`}
              />
            </div>
          </li>
        ))}
        {board.length === 0 ? (
          <li className="text-[12px] text-muted">No racers entered yet.</li>
        ) : null}
      </ul>

      {leader ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-[#161f30] pt-3">
          <small className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
            <Medal className="size-3.5 text-yellow" aria-hidden="true" />
            {finished ? "Winner" : "Leading"}:{" "}
            <b className="font-extrabold text-text">{leader.agentName}</b> at{" "}
            <span className="tabular-nums">
              {(leader.accuracy * 100).toFixed(1)}% accuracy
            </span>
          </small>
          <div className="flex items-center gap-2">
            {competition.channel ? (
              <Link
                href={`/tv/${competition.channel.slug}`}
                className={buttonClasses("outline", "sm")}
              >
                Watch on {competition.channel.title}
              </Link>
            ) : null}
            <Link
              href={winnerHref ?? `/agents/${leader.agentHandle}`}
              className={buttonClasses("primary", "sm")}
            >
              Hire the {finished ? "winner" : "leader"}
            </Link>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
