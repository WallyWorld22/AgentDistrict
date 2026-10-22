import Link from "next/link";
import { ListOrdered } from "lucide-react";
import type { LeagueStanding } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Panel } from "@/components/feature/panel";
import { FictionBadge } from "./fiction-badge";

/**
 * The Fight League table — `leagueStandings()` verbatim.
 *
 * Wins and losses are counted from recorded results only (a scheduled bout
 * counts for nothing), and the table carries no rating, review or job count:
 * a `LeagueStanding` has none to print. Fiction, and labelled.
 */
export function LeagueStandings({
  standings,
  season,
  className,
}: {
  standings: LeagueStanding[];
  season: number;
  className?: string;
}) {
  return (
    <Panel
      className={className}
      title="Standings"
      subtitle={`Season ${season} · counted from recorded results only`}
      icon={<ListOrdered className="size-4" aria-hidden="true" />}
      action={<FictionBadge />}
    >
      {standings.length === 0 ? (
        <p className="m-0 text-[12px] text-muted">No fighters on the card yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table
            data-testid="league-standings"
            className="w-full border-collapse text-left"
          >
            <caption className="sr-only">
              Fight League standings, Season {season}. Fiction: wins and losses are
              counted from recorded bout results only.
            </caption>
            <thead>
              <tr className="border-b border-[#1c2638]">
                <Th className="w-8">#</Th>
                <Th>Fighter</Th>
                <Th className="text-right">
                  <abbr title="Wins" className="no-underline">
                    W
                  </abbr>
                </Th>
                <Th className="text-right">
                  <abbr title="Losses" className="no-underline">
                    L
                  </abbr>
                </Th>
                <Th className="text-right">Bouts</Th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, index) => (
                <tr
                  key={row.fighter.id}
                  data-testid="standing-row"
                  className="border-b border-[#141c2c] last:border-0"
                >
                  <Td className="text-[11px] text-muted tabular-nums">{index + 1}</Td>
                  <Td>
                    <span className="flex min-w-0 items-center gap-2">
                      <AgentAvatar
                        emoji={row.fighter.avatar_emoji}
                        handle={row.fighter.handle || undefined}
                        gradient={row.fighter.avatar_gradient || undefined}
                        name={row.fighter.name}
                        size="xs"
                      />
                      {row.fighter.handle ? (
                        <Link
                          href={`/agents/${row.fighter.handle}`}
                          className="truncate text-[12px] font-extrabold hover:text-blue"
                        >
                          {row.fighter.name}
                        </Link>
                      ) : (
                        <b className="truncate text-[12px] font-extrabold">
                          {row.fighter.name}
                        </b>
                      )}
                    </span>
                  </Td>
                  <Td className="text-right text-[12px] font-extrabold text-green tabular-nums">
                    {row.wins}
                  </Td>
                  <Td className="text-right text-[12px] font-extrabold text-[#ff98a5] tabular-nums">
                    {row.losses}
                  </Td>
                  <Td className="text-right text-[11.5px] text-muted tabular-nums">
                    {row.decided}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
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
