import { CalendarClock, Mic, Trophy } from "lucide-react";
import type { LeagueFighter } from "@/lib/data/types";
import {
  SPORTS_DESK_BYLINE,
  SPORTS_DESK_NOTE,
  formatBoutTime,
  type FightCard,
  type FightCardEntry,
} from "@/lib/data/ext/fight-night";
import { cn, timeAgo } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Panel } from "@/components/feature/panel";
import { Countdown } from "./countdown";
import { FictionBadge } from "./fiction-badge";

/**
 * The season's fight card, in schedule order.
 *
 * - A **decided** bout shows its recorded result — winner, loser, method — with
 *   a fiction pill, then the sports desk's recap (`boutRecap`, a fixed template
 *   over the recorded result; the result line is the ledger's own).
 * - A **due** bout (bell rung, nothing recorded yet) says so and guesses
 *   nothing.
 * - An **upcoming** bout shows its bell time and a countdown, and nothing that
 *   could be read as a prediction.
 */
export function FightCardPanel({
  card,
  now,
  className,
}: {
  card: FightCard;
  now: number;
  className?: string;
}) {
  return (
    <Panel
      className={className}
      title={`Fight card · Season ${card.season}`}
      subtitle={`${card.decidedCount} of ${card.bouts.length} bouts recorded. Every result is fiction.`}
      icon={<CalendarClock className="size-4" aria-hidden="true" />}
    >
      <ol className="m-0 grid list-none gap-2 p-0" data-testid="fight-card">
        {card.bouts.map((bout) => (
          <BoutRow key={bout.id} bout={bout} now={now} />
        ))}
      </ol>
    </Panel>
  );
}

function BoutRow({ bout, now }: { bout: FightCardEntry; now: number }) {
  return (
    <li
      data-testid="bout-row"
      data-phase={bout.phase}
      data-bout={bout.number}
      className={cn(
        "grid gap-2 rounded-[16px] border p-3",
        bout.phase === "decided"
          ? "bg-inset-surface border-[#1c2638]"
          : "border-dashed border-[#26324b] bg-[#0a0f1b]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <small className="block text-[9.5px] font-extrabold tracking-[0.08em] text-muted uppercase">
            Bout {bout.number}
          </small>
          <time dateTime={bout.scheduled_at} className="block text-[11px] text-muted">
            {formatBoutTime(bout.scheduled_at)}
          </time>
        </span>
        <PhasePill bout={bout} />
      </div>

      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink">
        <Corner fighter={bout.fighterA} won={bout.winner?.id === bout.fighterA.id} />
        <span className="text-[10.5px] font-extrabold text-muted uppercase">vs</span>
        <Corner fighter={bout.fighterB} won={bout.winner?.id === bout.fighterB.id} />
      </p>

      {bout.phase === "decided" && bout.result ? (
        <>
          <div
            data-testid="bout-result"
            className="flex flex-wrap items-center gap-2 border-t border-[#161f30] pt-2"
          >
            <Trophy className="size-3.5 shrink-0 text-yellow" aria-hidden="true" />
            {bout.winner && bout.loser ? (
              <span className="text-[12.5px] text-ink">
                <b className="font-extrabold text-text">{bout.winner.name}</b> def.{" "}
                {bout.loser.name}
              </span>
            ) : (
              <span className="text-[12.5px] text-ink">Result recorded</span>
            )}
            <Pill variant="blue" size="sm">
              {bout.result.method}
            </Pill>
            <FictionBadge />
          </div>

          {bout.recap ? (
            <figure data-testid="bout-recap" className="m-0 grid gap-1.5">
              <blockquote className="m-0 border-l-2 border-[#554090] pl-3 text-[12px] leading-relaxed text-pretty text-ink">
                {bout.recap.lines.join(" ")}{" "}
                <b className="font-extrabold text-text">{bout.recap.verdict}</b>
              </blockquote>
              <figcaption className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-muted">
                <Mic className="size-3 shrink-0" aria-hidden="true" />
                <span title={SPORTS_DESK_NOTE}>
                  Commentary — {SPORTS_DESK_BYLINE}
                  <span className="sr-only"> ({SPORTS_DESK_NOTE})</span>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  result recorded{" "}
                  <time dateTime={bout.result.decided_at}>
                    {recordedAgo(bout.result.decided_at, now)}
                  </time>
                </span>
              </figcaption>
            </figure>
          ) : null}
        </>
      ) : null}

      {bout.phase === "due" ? (
        <p className="m-0 text-[11.5px] text-muted">
          The bell has rung. No result is recorded yet — it is decided by the published
          formula the next time this card is read, never guessed here.
        </p>
      ) : null}
    </li>
  );
}

function PhasePill({ bout }: { bout: FightCardEntry }) {
  if (bout.phase === "decided") {
    return (
      <Pill variant="green" size="sm">
        Decided
      </Pill>
    );
  }
  if (bout.phase === "due") {
    return (
      <Pill variant="yellow" size="sm">
        Result pending
      </Pill>
    );
  }
  return (
    <Pill variant="purple" size="sm">
      <Countdown
        seconds={bout.secondsToBell}
        days
        suffix="to the bell"
        endedLabel="The bell has rung"
      />
    </Pill>
  );
}

function Corner({ fighter, won }: { fighter: LeagueFighter; won: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <AgentAvatar
        emoji={fighter.avatar_emoji}
        handle={fighter.handle || undefined}
        gradient={fighter.avatar_gradient || undefined}
        name={fighter.name}
        size="xs"
      />
      <span
        className={cn(
          "truncate",
          won ? "font-extrabold text-text" : "font-semibold text-ink",
        )}
      >
        {fighter.name}
      </span>
    </span>
  );
}

/** "result recorded 3d ago", and "just now" for a bout this very read decided. */
function recordedAgo(decidedAt: string, now: number): string {
  const ago = timeAgo(decidedAt, now);
  return ago === "now" || ago === "in a moment" ? "just now" : ago;
}
