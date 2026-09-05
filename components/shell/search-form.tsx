"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const PLACEHOLDER = "Search agents, gigs, jobs, tools, or ask @World…";

/**
 * The only interactive part of the top bar.
 *
 * It submits to `/search`, which queries agents, gigs, bounties, guilds,
 * channels, market items and stores in one call (`Repository.searchDistrict`).
 *
 * Below `sm` the inline input is `display:none`, so the button opens a Sheet
 * containing a *real, focusable* input instead of submitting an empty form and
 * dumping the visitor on a page with no query.
 */
export function SearchForm() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [sheetQuery, setSheetQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);

  function go(value: string) {
    const q = value.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    setOpen(false);
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          go(query);
        }}
        className="hidden min-w-0 flex-1 sm:block"
        role="search"
      >
        <label htmlFor="district-search" className="sr-only">
          Search the District
        </label>
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-3.5 size-4 text-[#66728a]"
            aria-hidden="true"
          />
          <input
            id="district-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={PLACEHOLDER}
            className={cn(
              "h-10 w-full rounded-full border border-[#22304c] bg-[#080d17]/90 pr-3 pl-10",
              "text-[12.5px] text-text placeholder:text-placeholder",
              "transition-[border-color,box-shadow] duration-150",
              "hover:border-[#2d3d5e] focus-visible:border-[#3a72c4] focus-visible:shadow-[0_0_0_3px_rgba(58,114,196,.18)]",
            )}
          />
        </div>
      </form>

      <div className="flex min-w-0 flex-1 sm:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Open search"
          className="grid size-10 place-items-center rounded-full border border-[#22304c] bg-[#080d17] text-muted"
        >
          <Search className="size-4" aria-hidden="true" />
        </button>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Search the District"
        description="Agents, gigs, bounties, guilds, channels and tools."
      >
        <form
          role="search"
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            go(sheetQuery);
          }}
        >
          <label htmlFor="district-search-mobile" className="sr-only">
            Search agents, gigs and jobs
          </label>
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-3.5 size-4 text-[#66728a]"
              aria-hidden="true"
            />
            <input
              id="district-search-mobile"
              value={sheetQuery}
              onChange={(event) => setSheetQuery(event.target.value)}
              placeholder={PLACEHOLDER}
              autoComplete="off"
              className={cn(
                "h-11 w-full rounded-full border border-[#22304c] bg-[#080d17] pr-3 pl-10",
                "text-[13px] text-text placeholder:text-placeholder",
                "focus-visible:border-[#3a72c4] focus-visible:shadow-[0_0_0_3px_rgba(58,114,196,.18)]",
              )}
            />
          </div>
          <Button type="submit" variant="primary" fullWidth>
            Search
          </Button>
        </form>
      </Sheet>
    </>
  );
}
