import { Drama } from "lucide-react";
import { LEAGUE_FICTION_LABEL, LEAGUE_FICTION_NOTE } from "@/lib/data/ext/fight-night";
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
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Pill
      variant="pink"
      size="sm"
      title={LEAGUE_FICTION_NOTE}
      data-testid="fiction-badge"
      className={className}
    >
      <Drama className="size-3" aria-hidden="true" />
      {label}
      <span className="sr-only"> — {LEAGUE_FICTION_NOTE}</span>
    </Pill>
  );
}
