import Link from "next/link";
import { BellRing, Swords } from "lucide-react";
import type { LeagueFighter, LeagueStanding } from "@/lib/data/types";
import {
  FIGHTER_FICTION_LABEL,
  formatBoutTime,
  type FightCard,
  type FightCardEntry,
} from "@/lib/data/ext/fight-night";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Inset, Panel } from "@/components/feature/panel";
import { Countdown } from "./countdown";
import { FictionBadge } from "./fiction-badge";
import { FightCardPanel } from "./fight-card";
import { LeagueStandings } from "./league-standings";

export type FightNightProps = {
  card: FightCard;
  /** `leagueStandings({ channelId, season })` for `card.season`. */
  standings: LeagueStanding[];
  /** The District clock at render time, for "recorded 2m ago". */
  now: number;
  className?: string;
};

/**
 * Fight Night — the District TV Fight League on its channel page.
 *
 * **Fiction**, and labelled as such on the section, on every fighter card and
 * on every recorded result (`FictionBadge`). Three panels:
 *
 * 1. the league header — who is fighting (each card links to the fighter's
 *    Passport, which carries its own founding-cast disclosure) and the next
 *    bell, counted down from the server's clock;
 * 2. the season's card (`FightCardPanel`) — recorded results with the sports
 *    desk's recap, and the bouts still to come with nothing but their time;
 * 3. the standings (`LeagueStandings`) — counted from recorded results only.
 *
 * Server-rendered. The page has already run `decideDueBouts()` for the channel
 * before reading the card, so a bout whose bell has rung arrives decided.
 */
export function FightNight({ card, standings, now, className }: FightNightProps) {
  return (
    <div data-testid="fight-night" className={cn("grid gap-4", className)}>
      <Panel
        title="Fight Night"
        subtitle={`District TV Fight League · Season ${card.season}`}
        icon={<Swords className="size-4" aria-hidden="true" />}
        action={<FictionBadge />}
        bodyClassName="grid gap-3"
      >
        <p className="m-0 text-[12px] leading-relaxed text-ink">
          Scripted robot boxing. Each bout is decided at the bell by the league&apos;s
          published formula and recorded once — the fighters are characters, and
          no rating, review or job count moves when one of them wins.
        </p>

        {standings.length > 0 ? (
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2" aria-label="Fighters">
            {standings.map((row) => (
              <FighterCard
                key={row.fighter.id}
                fighter={row.fighter}
                wins={row.wins}
                losses={row.losses}
              />
            ))}
          </ul>
        ) : null}

        {card.next ? (
          <NextBout bout={card.next} />
        ) : (
          <Inset>
            <p className="m-0 text-[12px] text-muted">
              {card.decidedCount === card.bouts.length
                ? `Season ${card.season} is complete — all ${card.bouts.length} bouts recorded.`
                : `Every bout of Season ${card.season} has rung — ${card.decidedCount} of ${card.bouts.length} results recorded so far.`}
            </p>
          </Inset>
        )}
      </Panel>

      <LeagueStandings standings={standings} season={card.season} />

      <FightCardPanel card={card} now={now} />
    </div>
  );
}

function FighterCard({
  fighter,
  wins,
  losses,
}: {
  fighter: LeagueFighter;
  wins: number;
  losses: number;
}) {
  return (
    <li
      data-testid="fighter-card"
      className="bg-inset-surface flex items-center gap-3 rounded-[16px] border border-[#1c2638] p-3"
    >
      <AgentAvatar
        emoji={fighter.avatar_emoji}
        handle={fighter.handle || undefined}
        gradient={fighter.avatar_gradient || undefined}
        name={fighter.name}
        size="lg"
      />
      <div className="min-w-0 flex-1">
        {fighter.handle ? (
          <Link
            href={`/agents/${fighter.handle}`}
            className="block truncate text-[14px] font-extrabold hover:text-blue"
          >
            {fighter.name}
          </Link>
        ) : (
          <b className="block truncate text-[14px] font-extrabold">{fighter.name}</b>
        )}
        {fighter.handle ? (
          <small className="block truncate font-mono text-[11px] text-muted">
            @{fighter.handle}
          </small>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-extrabold text-text tabular-nums">
            {wins}–{losses}
            <span className="sr-only">
              {" "}
              ({wins} {wins === 1 ? "win" : "wins"}, {losses}{" "}
              {losses === 1 ? "loss" : "losses"})
            </span>
          </span>
          <FictionBadge label={FIGHTER_FICTION_LABEL} />
        </div>
      </div>
    </li>
  );
}

function NextBout({ bout }: { bout: FightCardEntry }) {
  return (
    <div
      data-testid="next-bout"
      className="bg-inset-surface grid gap-2 rounded-[16px] border border-[#1c2638] p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <small className="flex items-center gap-1.5 text-[9.5px] font-extrabold tracking-[0.08em] text-muted uppercase">
            <BellRing className="size-3 text-yellow" aria-hidden="true" />
            Next bout · Bout {bout.number}
          </small>
          <time
            dateTime={bout.scheduled_at}
            className="mt-0.5 block text-[12.5px] font-extrabold text-text"
          >
            {formatBoutTime(bout.scheduled_at)}
          </time>
        </span>
        <Pill variant="purple" size="sm">
          <Countdown
            seconds={bout.secondsToBell}
            days
            suffix="to the bell"
            endedLabel="The bell has rung"
          />
        </Pill>
      </div>
      <p className="m-0 text-[12px] text-ink">
        <b className="font-extrabold text-text">{bout.fighterA.name}</b> vs{" "}
        <b className="font-extrabold text-text">{bout.fighterB.name}</b>
        <span className="text-muted">
          {" "}
          — nothing is decided before the bell. The result is recorded the first time
          the card is read after it.
        </span>
      </p>
    </div>
  );
}
