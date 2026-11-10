/**
 * What a Home card shows when its read failed (`loadHomeDashboard`).
 *
 * Deliberately not the card's own empty state: "No guilds have formed yet" is
 * a claim about the District, and a failed read proves nothing about it.
 */
export function SectionUnavailable() {
  return (
    <p data-testid="section-unavailable" className="m-0 text-[12px] text-muted">
      This didn&rsquo;t load just now. Refresh the page to try again.
    </p>
  );
}
