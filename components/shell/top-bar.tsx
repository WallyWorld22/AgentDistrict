"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, ChevronDown, Plus, Search, Users } from "lucide-react";
import * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import { Brand } from "./brand";

/**
 * Top bar (BUILD_SPEC §3): search, credits pill, notifications, profile.
 * On mobile the brand replaces the sidebar's; on desktop only the search and
 * account controls show, matching docs/reference/desktop-home.png.
 */
export function TopBar() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/agents?q=${encodeURIComponent(q)}` : "/agents");
  }

  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-14 w-full max-w-[1250px] items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4">
        <Brand className="lg:hidden" showTagline={false} />

        <form onSubmit={onSubmit} className="min-w-0 flex-1" role="search">
          <label htmlFor="district-search" className="sr-only">
            Search the District
          </label>
          <div className="relative hidden items-center sm:flex">
            <Search
              className="pointer-events-none absolute left-3 size-4 text-[#66728a]"
              aria-hidden="true"
            />
            <input
              id="district-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents, gigs, jobs, tools, or ask @World…"
              className="h-9 w-full rounded-full border border-[#24304a] bg-[#080d17] pr-3 pl-9 text-[12.5px] text-text placeholder:text-[#66728a]"
            />
          </div>
          <button
            type="submit"
            aria-label="Search the District"
            className="grid size-9 place-items-center rounded-full border border-[#24304a] bg-[#080d17] text-[#8e9ab2] sm:hidden"
          >
            <Search className="size-4" aria-hidden="true" />
          </button>
        </form>

        <Link
          href="/guilds"
          aria-label="Guilds"
          className="hidden size-9 shrink-0 place-items-center rounded-[12px] text-[#8e9ab2] hover:text-text xl:grid"
        >
          <Users className="size-4" aria-hidden="true" />
        </Link>

        <Link
          href="/wallet"
          className="hidden h-9 shrink-0 items-center gap-2 rounded-[12px] border border-line bg-[#0f1522] px-2.5 sm:flex"
        >
          <span className="flex flex-col leading-none">
            <small className="text-[8.5px] text-muted">Credits</small>
            <b className="mt-0.5 text-[12px] text-green">$12.43</b>
          </span>
          <span
            className="grid size-6 place-items-center rounded-[8px] border border-[#26334c] bg-[#131c2e] text-[#a8b4ca]"
            aria-hidden="true"
          >
            <Plus className="size-3" />
          </span>
        </Link>

        <Link
          href="/inbox"
          aria-label="Notifications — 3 unread"
          className="relative grid size-9 shrink-0 place-items-center rounded-[12px] border border-line bg-[#0f1522] text-[#8e9ab2] hover:text-text"
        >
          <Bell className="size-4" aria-hidden="true" />
          <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-blue text-[9px] font-extrabold text-white">
            3
          </span>
        </Link>

        <Link
          href="/profile"
          className="flex shrink-0 items-center gap-2 rounded-[12px] py-1 pr-1 pl-0.5 hover:bg-white/5"
        >
          <Avatar size="sm" round>
            AW
          </Avatar>
          <span className="hidden flex-col leading-none md:flex">
            <b className="text-[12px]">Austin</b>
            <small className="mt-0.5 text-[10px] text-blue">Builder Mode</small>
          </span>
          <ChevronDown
            className="hidden size-3.5 text-[#66728a] md:block"
            aria-hidden="true"
          />
        </Link>
      </div>
    </header>
  );
}
