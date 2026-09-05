import Link from "next/link";
import { TV_FILTERS } from "@/lib/data/ext/lounge";
import type { ChannelKind } from "@/lib/data/types";
import { chipHref } from "@/lib/query";
import { cn } from "@/lib/utils";

export type TvFiltersProps = {
  /** Currently selected channel kind, if any. */
  kind?: ChannelKind;
  /** Whether the "Live" filter is on. */
  liveOnly: boolean;
  /** Counts per filter label, so a chip can show how much is behind it. */
  counts?: Record<string, number>;
};

/**
 * The District TV filter row — "Live · Talk · Build · Demos · Agents ·
 * Competitions" from `docs/reference/mobile-screens.png`.
 *
 * Link chips, not client state: `/tv?kind=competition` is a real URL you can
 * send to somebody (BUILD_SPEC §4).
 */
export function TvFilters({ kind, liveOnly, counts }: TvFiltersProps) {
  return (
    <nav
      aria-label="Filter channels"
      className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5"
    >
      {TV_FILTERS.map((filter) => {
        const active = filter.live
          ? liveOnly && !kind
          : filter.kind
            ? kind === filter.kind
            : !kind && !liveOnly;
        const href = chipHref(
          "/tv",
          {},
          { kind: filter.kind, live: filter.live ? "1" : undefined },
        );
        const count = counts?.[filter.label];

        return (
          <Link
            key={filter.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5",
              "text-[11px] font-extrabold whitespace-nowrap",
              "transition-[background-color,border-color,color] duration-150",
              active
                ? "bg-grad-primary border-transparent text-white shadow-[0_6px_18px_rgba(53,110,255,.28)]"
                : "border-line bg-[#0b111d] text-[#a8b4ca] hover:border-[#33415f] hover:text-text",
            )}
          >
            {filter.label}
            {count !== undefined ? (
              <span
                className={cn(
                  "tabular-nums",
                  active ? "text-white/75" : "text-[#6d7a92]",
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
