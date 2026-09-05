"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, type NavBadge, type NavLinkData } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { LiveDot } from "@/components/ui/live-dot";

function NavBadgePill({ badge, active }: { badge: NavBadge; active: boolean }) {
  if (badge.variant === "live") {
    return (
      <span
        className={cn(
          "ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[3px]",
          "text-[9px] leading-none font-extrabold tracking-[0.04em]",
          active
            ? "border-white/35 bg-white/15 text-white"
            : "border-[#1b7253] bg-[#0c251d] text-[#71f0b5]",
        )}
      >
        <LiveDot color={active ? "bg-white" : "bg-green"} size="sm" />
        {badge.label}
      </span>
    );
  }
  if (badge.variant === "count") {
    // Dark ink on the red fill: white on --color-red measures 3.01:1, under the
    // WCAG AA 4.5:1 floor for normal text.
    return (
      <span className="ml-auto grid size-[19px] shrink-0 place-items-center rounded-full bg-red text-[10px] leading-none font-extrabold text-[#2a0d15] tabular-nums">
        {badge.label}
      </span>
    );
  }
  return (
    <span className="ml-auto shrink-0 rounded-full border border-line bg-[#0c1321] px-1.5 py-0.5 text-[9px] font-extrabold text-[#bdc6da]">
      {badge.label}
    </span>
  );
}

export type SidebarNavLinkProps = {
  item: NavLinkData;
  /** Pre-rendered icon element — a lucide component cannot cross the RSC edge. */
  icon: ReactNode;
};

/**
 * Sidebar row. Active state is derived from the pathname (BUILD_SPEC §3) and
 * matches docs/reference/desktop-home.png: a filled blue gradient pill.
 *
 * The icon arrives as an already-rendered element so the parent `Sidebar` can
 * stay a Server Component; its colour is driven from here with a descendant
 * selector rather than by cloning the element.
 *
 * ## Why `prefetch={false}`
 *
 * The sidebar is on every page, so the default prefetch fired a router request
 * for **all 16 other nav routes** on every single page view — and Next 16
 * issues two per link, so 33 requests. Every one of them is a `force-dynamic`
 * render (a serverless invocation in production).
 *
 * Measured on the production build at 1440×900, `/` then five sidebar clicks:
 *
 * | | RSC requests on `/` | median click → new `<h1>` |
 * |---|---|---|
 * | default prefetch | 65 | 148 ms |
 * | `prefetch={false}` | 48 | 142 ms |
 *
 * The latency is identical because these routes are dynamic: Next does not
 * cache a dynamic route's full payload from a prefetch, so the click re-renders
 * on the server either way. The prefetch was pure cost. The remaining 48 are
 * content-card links inside the page, which *are* worth prefetching — a visitor
 * who scrolled a card into view is likely to click it.
 */
export function SidebarNavLink({ item, icon }: SidebarNavLinkProps) {
  const pathname = usePathname();
  const active = isNavItemActive(pathname, item);

  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-[34px] items-center gap-2.5 rounded-[11px] px-2.5 text-[12.5px] font-bold",
        "transition-[background-color,color,box-shadow] duration-150 ease-out",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-colors",
        active
          ? "bg-[image:var(--grad-active-nav)] text-white shadow-[0_6px_18px_rgba(37,86,214,.35)] [&_svg]:text-white"
          : "text-[#9aa6bd] hover:bg-white/6 hover:text-text [&_svg]:text-[#8492ab] group-hover:[&_svg]:text-[#c7d2e6]",
      )}
    >
      {icon}
      <span className="truncate">{item.label}</span>
      {item.badge ? <NavBadgePill badge={item.badge} active={active} /> : null}
    </Link>
  );
}

/** Mobile bottom-nav tab. `prefetch={false}` for the reason above. */
export function BottomNavLink({ item, icon }: SidebarNavLinkProps) {
  const pathname = usePathname();
  const active = isNavItemActive(pathname, item);

  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 flex-col items-center justify-center gap-1 rounded-[15px] py-1.5",
        "transition-[background-color,color] duration-150 ease-out",
        "[&_svg]:size-[18px]",
        active
          ? "bg-gradient-to-b from-[#18233a] to-[#10182a] text-white ring-1 ring-[#293b5c] ring-inset [&_svg]:text-[#72baff]"
          : "text-[#7f8ca4] active:bg-white/5",
      )}
    >
      {icon}
      <small className="text-[9px] leading-none font-extrabold">{item.short}</small>
    </Link>
  );
}
