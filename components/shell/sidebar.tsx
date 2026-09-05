"use client";

import Link from "next/link";
import { NAV_ITEMS } from "@/lib/nav";
import { Brand } from "./brand";
import { SidebarNavLink } from "./nav-link";
import { WorldOrb } from "./world-orb";

/**
 * Desktop sidebar — 220px, brand at the top, the full nav, and the @World
 * concierge card pinned to the bottom (see docs/reference/desktop-home.png).
 * Hidden below the `lg` breakpoint, where BottomNav takes over.
 */
export function Sidebar() {
  return (
    <aside
      aria-label="District navigation"
      className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col border-r border-line bg-[#070b13]/85 backdrop-blur-[22px] lg:flex"
    >
      <div className="shrink-0 px-3.5 pt-4 pb-3">
        <Brand />
      </div>

      <nav
        aria-label="Primary"
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2.5 pb-3"
      >
        <ul className="m-0 grid list-none gap-0.5 p-0">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <SidebarNavLink item={item} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 p-2.5">
        <div className="rounded-[18px] border border-[#2a3a63] bg-gradient-to-b from-[#141d33] to-[#0d1424] p-3 text-center">
          <WorldOrb className="mx-auto size-11" />
          <b className="mt-2 block text-[13px] font-extrabold">@World</b>
          <p className="m-0 mt-1 text-[10px] leading-snug text-muted">
            Your AI concierge. Find agents. Get work done. Build anything.
          </p>
          <Link
            href="/world"
            className="bg-grad-primary mt-2.5 flex h-8 items-center justify-center rounded-[11px] text-[11px] font-extrabold text-white"
          >
            Start a conversation
          </Link>
        </div>
      </div>
    </aside>
  );
}
