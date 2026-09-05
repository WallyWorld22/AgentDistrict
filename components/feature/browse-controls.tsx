import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type BrowseChip = {
  label: string;
  href: string;
  active: boolean;
  count?: number;
};

export type BrowseSelect = {
  name: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
};

export type BrowseControlsProps = {
  basePath: string;
  /** Current params, re-emitted as hidden inputs so a search keeps the filters. */
  params: Record<string, string | undefined>;
  chips?: BrowseChip[];
  selects?: BrowseSelect[];
  searchPlaceholder?: string;
  className?: string;
};

/**
 * Search + category chips + sort/filter selects for a browse page.
 *
 * Entirely server-rendered: the form is a plain GET to the same route and every
 * chip is a link, so browsing works with JavaScript off and every filtered view
 * has its own URL. The selects submit the enclosing form on change through a
 * tiny progressive-enhancement script rather than a client component.
 */
export function BrowseControls({
  basePath,
  params,
  chips,
  selects,
  searchPlaceholder = "Search…",
  className,
}: BrowseControlsProps) {
  const searchId = `browse-search-${basePath.replace(/\W+/g, "-")}`;
  const hidden = Object.entries(params).filter(
    ([key, value]) => Boolean(value) && key !== "q" && !selects?.some((s) => s.name === key),
  );

  return (
    <div className={cn("grid gap-3", className)}>
      <form
        action={basePath}
        method="get"
        role="search"
        className="flex flex-wrap items-end gap-2"
      >
        {hidden.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}

        {/*
          `basis-[220px] grow` (rather than `flex-1` alone) keeps the field
          from being squeezed to a couple of characters when three selects and
          the Apply button share the row at 390px: a flex basis is what decides
          the wrap, and it is unaffected by the `min-width` base reset.
        */}
        <div className="relative flex min-w-[200px] grow basis-[220px] items-center">
          <label htmlFor={searchId} className="sr-only">
            {searchPlaceholder}
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 size-4 text-[#66728a]"
            aria-hidden="true"
          />
          <input
            id={searchId}
            name="q"
            defaultValue={params.q ?? ""}
            placeholder={searchPlaceholder}
            className={cn(
              "h-10 w-full rounded-full border border-[#22304c] bg-[#080d17]/90 pr-3 pl-10",
              "text-[12.5px] text-text placeholder:text-placeholder",
              "focus-visible:border-[#3a72c4] focus-visible:shadow-[0_0_0_3px_rgba(58,114,196,.18)]",
            )}
          />
        </div>

        {selects?.map((select) => (
          <div key={select.name} className="flex flex-col gap-1">
            <label
              htmlFor={`${searchId}-${select.name}`}
              className="text-[10px] font-extrabold tracking-[0.05em] text-muted uppercase"
            >
              {select.label}
            </label>
            <select
              id={`${searchId}-${select.name}`}
              name={select.name}
              defaultValue={select.value}
              className={cn(
                "h-10 rounded-[13px] border border-line bg-[#0b111d] px-3 pr-8 text-[12.5px] font-bold text-ink",
                "focus-visible:border-[#3a72c4] focus-visible:shadow-[0_0_0_3px_rgba(58,114,196,.18)]",
              )}
            >
              {select.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        <Button type="submit" variant="outline" size="md">
          Apply
        </Button>
      </form>

      {chips && chips.length > 0 ? (
        // Wraps from `lg` up, where there is room for two rows and a mouse has
        // no horizontal wheel: a `no-scrollbar` row cut "Support" to "Sup" with
        // no cue and no way to reach it. Below `lg` it stays a swipe strip,
        // with a right-edge fade so the overflow is visible.
        <nav
          aria-label="Filters"
          className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)] lg:flex-wrap lg:overflow-visible lg:[mask-image:none]"
        >
          {chips.map((chip) => (
            <Link
              key={chip.href + chip.label}
              href={chip.href}
              aria-current={chip.active ? "page" : undefined}
              className={cn(
                // `min-h-10`: these are the primary filtering control on every
                // browse page, and DESIGN.md §4 puts touch targets at ≥40px.
                "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-extrabold whitespace-nowrap",
                "transition-[background-color,border-color,color] duration-150",
                chip.active
                  ? "border-transparent bg-grad-primary text-white shadow-[0_6px_18px_rgba(53,110,255,.28)]"
                  : "border-line bg-[#0b111d] text-[#a8b4ca] hover:border-[#33415f] hover:text-text",
              )}
            >
              {chip.label}
              {chip.count !== undefined ? (
                <span
                  className={cn(
                    "tabular-nums",
                    chip.active ? "text-white/75" : "text-[#6d7a92]",
                  )}
                >
                  {chip.count}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
