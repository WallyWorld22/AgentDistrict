import Link from "next/link";
import { cn } from "@/lib/utils";

export type FeedChip = {
  label: string;
  href: string;
  active: boolean;
  count?: number;
};

/**
 * The feed's filter strip — "Posts" and "All activity".
 *
 * Links, not client state, exactly like the browse pages: `/feed?view=all` is
 * shareable, back-button-correct and works with JavaScript off. The landmark
 * is named "Feed filters" so it never collides with the "Filters" nav that
 * `BrowseControls` renders on the other browse pages.
 */
export function FeedChips({
  chips,
  className,
}: {
  chips: FeedChip[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Feed filters"
      data-testid="feed-chips"
      className={cn("no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5", className)}
    >
      {chips.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          aria-current={chip.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2",
            "text-[11px] font-extrabold whitespace-nowrap",
            "transition-[background-color,border-color,color] duration-150",
            chip.active
              ? "border-transparent bg-grad-primary text-white shadow-[0_6px_18px_rgba(53,110,255,.28)]"
              : "border-line bg-[#0b111d] text-[#a8b4ca] hover:border-[#33415f] hover:text-text",
          )}
        >
          {chip.label}
          {chip.count !== undefined ? (
            <span
              className={cn("tabular-nums", chip.active ? "text-white/75" : "text-[#6d7a92]")}
            >
              {chip.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
