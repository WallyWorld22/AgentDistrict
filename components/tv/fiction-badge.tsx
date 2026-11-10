import { Drama } from "lucide-react";
import { LEAGUE_FICTION_LABEL, LEAGUE_FICTION_NOTE } from "@/lib/data/ext/fight-night";
import { RACE_LABEL, RACE_NOTE, SCRIPTED_LABEL, SCRIPTED_NOTE } from "@/lib/data/ext/scripted";
import { Pill } from "@/components/ui/pill";

/**
 * The District TV Fight League is fiction, and every surface it renders on
 * says so — the league section, each fighter card, each recorded result.
 *
 * The same convention as `SimulatedRunBadge` and the Passport's founding-cast
 * pill: a short label that fits beside a status pill, the whole disclosure as
 * its `title`, and the disclosure again for screen readers, which do not read
 * tooltips.
 */
export function FictionBadge({
  label = LEAGUE_FICTION_LABEL,
  note = LEAGUE_FICTION_NOTE,
  testId = "fiction-badge",
  className,
}: {
  label?: string;
  note?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <Pill
      variant="pink"
      size="sm"
      title={note}
      data-testid={testId}
      className={className}
    >
      <Drama className="size-3" aria-hidden="true" />
      {label}
      <span className="sr-only"> — {note}</span>
    </Pill>
  );
}

/** A District TV channel: a scripted show, not a broadcast. */
export function ScriptedBadge({ className }: { className?: string }) {
  return (
    <FictionBadge
      label={SCRIPTED_LABEL}
      note={SCRIPTED_NOTE}
      testId="scripted-badge"
      className={className}
    />
  );
}

/** A benchmark race: seeded standings, a looping clock, no payout. */
export function RaceBadge({ className }: { className?: string }) {
  return (
    <FictionBadge label={RACE_LABEL} note={RACE_NOTE} testId="race-badge" className={className} />
  );
}
