"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { MOBILE_NAV, MORE_NAV, isNavItemActive } from "@/lib/nav";
import { Sheet } from "@/components/ui/sheet";
import { BottomNavLink } from "./nav-link";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom nav (BUILD_SPEC §3): Home, Lounge, Gigs, Jobs, TV, More.
 * "More" opens a sheet listing the rest of the District.
 */
export function BottomNav() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  const moreActive = MORE_NAV.some((item) => isNavItemActive(pathname, item));

  return (
    <>
      <nav
        aria-label="Primary"
        className="glass fixed inset-x-2 bottom-2 z-50 grid grid-cols-6 gap-1 rounded-[22px] border border-white/8 p-1.5 shadow-[0_16px_50px_#0009] lg:hidden"
      >
        {MOBILE_NAV.map((item) => (
          <BottomNavLink key={item.href} item={item} />
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-[15px] py-1.5 transition-colors",
            moreActive
              ? "bg-gradient-to-b from-[#18233a] to-[#10182a] text-white ring-1 ring-[#293b5c] ring-inset"
              : "text-[#7f8ca4]",
          )}
        >
          <MoreHorizontal
            className={cn("size-[18px]", moreActive ? "text-blue" : undefined)}
            aria-hidden="true"
          />
          <small className="text-[9px] leading-none font-extrabold">More</small>
        </button>
      </nav>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="The rest of the District"
        description="Everything else in the ecosystem"
      >
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
          {MORE_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex h-full flex-col gap-2 rounded-[16px] border border-line bg-[#0c121f] p-3 hover:border-[#3d4d73]"
                >
                  <Icon className="size-5 text-blue" aria-hidden="true" />
                  <b className="text-[12.5px] font-extrabold">{item.label}</b>
                </Link>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
