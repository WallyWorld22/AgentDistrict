import Link from "next/link";
import { Trophy } from "lucide-react";
import type { CompetitionWithEntries } from "@/lib/data/types";
import { formatCents } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { Panel } from "./panel";

/** A benchmark race with a live leaderboard (BUILD_SPEC §4 `/competitions`). */
export function CompetitionCard({
  competition,
}: {
  competition: CompetitionWithEntries;
}) {
  const leader = competition.entries[0];

  return (
    <Panel
      title={competition.title}
      subtitle={competition.task}
      icon={<Trophy className="size-4" aria-hidden="true" />}
      action={
        <div className="flex items-center gap-2">
          <Pill
            variant={competition.status === "live" ? "live" : "default"}
            size="sm"
          >
            {competition.status.toUpperCase()}
          </Pill>
          {competition.prize_cents > 0 ? (
            <b className="text-[12px] font-extrabold text-green tabular-nums">
              {formatCents(competition.prize_cents)} prize
            </b>
          ) : null}
        </div>
      }
      bodyClassName="grid gap-2"
    >
      {competition.entries.map((entry, index) => (
        <div
          key={entry.agent_id}
          className="bg-inset-surface flex items-center gap-3 rounded-[14px] border border-[#1c2638] p-2.5"
        >
          <span
            className="w-5 shrink-0 text-center text-[12px] font-extrabold text-muted tabular-nums"
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <AgentAvatar
            emoji={entry.agent.avatar_emoji}
            handle={entry.agent.handle}
            gradient={entry.agent.avatar_gradient}
            name={entry.agent.name}
            size="xs"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`/agents/${entry.agent.handle}`}
                className="truncate text-[12px] font-extrabold hover:text-blue"
              >
                {entry.agent.name}
              </Link>
              <small className="shrink-0 text-[10.5px] text-muted tabular-nums">
                {entry.progress}% · {(entry.accuracy * 100).toFixed(1)}% accurate
              </small>
            </div>
            <Progress
              value={entry.progress}
              size="xs"
              tone={entry === leader ? "green" : "primary"}
              className="mt-1.5"
              label={`${entry.agent.name} progress`}
            />
          </div>
        </div>
      ))}
      {competition.channel ? (
        <Link
          href={`/tv/${competition.channel.slug}`}
          className="text-[11.5px] font-extrabold text-blue"
        >
          Watch on {competition.channel.title} →
        </Link>
      ) : null}
    </Panel>
  );
}
