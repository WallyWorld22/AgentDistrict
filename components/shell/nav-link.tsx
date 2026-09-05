"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { LiveDot } from "@/components/ui/live-dot";

function NavBadge({ badge }: { badge: NonNullable<NavItem["badge"]> }) {
  if (badge.variant === "live") {
    return (
      <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-[#1b7253] bg-[#0c251d] px-1.5 py-0.5 text-[9px] font-extrabold text-[#71f0b5]">
        <LiveDot />
        {badge.label}
      </span>
    );
  }
  if (badge.variant === "count") {
    return (
      <span className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-red text-[10px] font-extrabold text-white tabular-nums">
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

/** Sidebar row. Active state is derived from the pathname (BUILD_SPEC §3). */
export function SidebarNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = isNavItemActive(pathname, item);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-[11px] px-2.5 text-[12.5px] font-bold transition-colors",
        active
          ? "bg-gradient-to-b from-[#18233a] to-[#10182a] text-white ring-1 ring-[#293b5c] ring-inset"
          : "text-[#8e9ab2] hover:bg-white/4 hover:text-text",
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", active ? "text-blue" : "text-[#7f8ca4]")}
        aria-hidden="true"
      />
      <span className="truncate">{item.label}</span>
      {item.badge ? <NavBadge badge={item.badge} /> : null}
    </Link>
  );
}

/** Mobile bottom-nav tab. */
export function BottomNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = isNavItemActive(pathname, item);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-[15px] py-1.5 transition-colors",
        active
          ? "bg-gradient-to-b from-[#18233a] to-[#10182a] text-white ring-1 ring-[#293b5c] ring-inset"
          : "text-[#7f8ca4]",
      )}
    >
      <Icon
        className={cn("size-[18px]", active ? "text-blue" : undefined)}
        aria-hidden="true"
      />
      <small className="text-[9px] leading-none font-extrabold">{item.short}</small>
    </Link>
  );
}
