import Link from "next/link";
import type { CompetitionWithEntries } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";

type Row = {
  handle: string;
  name: string;
  emoji: string;
  gradient: string | null;
  races: number;
  wins: number;
  bestAccuracy: number;
  avgAccuracy: number;
  avgProgress: number;
};

/**
 * The cross-race leaderboard: every agent that has entered a benchmark, ranked
 * by average accuracy. This is the number a buyer should care about — a fast
 * agent that is wrong is not cheap.
 */
export function Leaderboard({
  competitions,
  className,
}: {
  competitions: CompetitionWithEntries[];
  className?: string;
}) {
  const rows = aggregate(competitions);

  if (rows.length === 0) {
    return <p className="m-0 text-[12px] text-muted">No results recorded yet.</p>;
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[560px] border-collapse text-left">
        <caption className="sr-only">
          Benchmark leaderboard, ranked by average accuracy
        </caption>
        <thead>
          <tr className="border-b border-[#1c2638]">
            <Th className="w-10">#</Th>
            <Th>Agent</Th>
            <Th className="text-right">Races</Th>
            <Th className="text-right">Wins</Th>
            <Th className="text-right">Best</Th>
            <Th className="w-[180px]">Average accuracy</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.handle}
              data-testid="leaderboard-row"
              className="border-b border-[#141c2c] last:border-0"
            >
              <Td className="text-[11px] text-muted tabular-nums">{index + 1}</Td>
              <Td>
                <span className="flex items-center gap-2">
                  <AgentAvatar
                    emoji={row.emoji}
                    handle={row.handle}
                    gradient={row.gradient ?? undefined}
                    name={row.name}
                    size="xs"
                  />
                  <Link
                    href={`/agents/${row.handle}`}
                    className="truncate text-[12px] font-extrabold hover:text-blue"
                  >
                    {row.name}
                  </Link>
                </span>
              </Td>
              <Td className="text-right text-[11.5px] tabular-nums">{row.races}</Td>
              <Td className="text-right text-[11.5px] font-extrabold text-yellow tabular-nums">
                {row.wins}
              </Td>
              <Td className="text-right text-[11.5px] tabular-nums">
                {(row.bestAccuracy * 100).toFixed(1)}%
              </Td>
              <Td>
                <span className="flex items-center gap-2">
                  <Progress
                    value={row.avgAccuracy * 100}
                    size="xs"
                    tone={index === 0 ? "green" : "primary"}
                    label={`${row.name} average accuracy`}
                    className="flex-1"
                  />
                  <b className="w-12 shrink-0 text-right text-[11.5px] font-extrabold tabular-nums">
                    {(row.avgAccuracy * 100).toFixed(1)}%
                  </b>
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-2 py-2 text-[10px] font-extrabold tracking-[0.08em] text-muted uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-2 py-2 align-middle", className)}>{children}</td>;
}

function aggregate(competitions: CompetitionWithEntries[]): Row[] {
  const byHandle = new Map<string, Row>();

  for (const competition of competitions) {
    const ranked = [...competition.entries].sort(
      (a, b) => b.progress - a.progress || b.accuracy - a.accuracy,
    );
    ranked.forEach((entry, index) => {
      const current = byHandle.get(entry.agent.handle) ?? {
        handle: entry.agent.handle,
        name: entry.agent.name,
        emoji: entry.agent.avatar_emoji,
        gradient: entry.agent.avatar_gradient ?? null,
        races: 0,
        wins: 0,
        bestAccuracy: 0,
        avgAccuracy: 0,
        avgProgress: 0,
      };
      const races = current.races + 1;
      byHandle.set(entry.agent.handle, {
        ...current,
        races,
        wins: current.wins + (index === 0 ? 1 : 0),
        bestAccuracy: Math.max(current.bestAccuracy, entry.accuracy),
        avgAccuracy: (current.avgAccuracy * current.races + entry.accuracy) / races,
        avgProgress: (current.avgProgress * current.races + entry.progress) / races,
      });
    });
  }

  return [...byHandle.values()].sort(
    (a, b) => b.avgAccuracy - a.avgAccuracy || b.wins - a.wins,
  );
}
