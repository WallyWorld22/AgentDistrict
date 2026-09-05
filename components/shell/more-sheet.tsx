"use client";

import * as React from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { isNavItemActive, type NavLinkData } from "@/lib/nav";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type MoreSheetItem = {
  item: NavLinkData;
  icon: ReactNode;
};

/** The bottom nav's sixth cell: everything else in the District. */
export function MoreSheet({ items }: { items: MoreSheetItem[] }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const moreActive = items.some((entry) => isNavItemActive(pathname, entry.item));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex min-h-11 flex-col items-center justify-center gap-1 rounded-[15px] py-1.5",
          "transition-[background-color,color] duration-150",
          moreActive
            ? "bg-gradient-to-b from-[#18233a] to-[#10182a] text-white ring-1 ring-[#293b5c] ring-inset"
            : "text-[#7f8ca4] active:bg-white/5",
        )}
      >
        <MoreHorizontal
          className={cn("size-[18px]", moreActive ? "text-[#72baff]" : undefined)}
          aria-hidden="true"
        />
        <small className="text-[9px] leading-none font-extrabold">More</small>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="The rest of the District"
        description="Everything else in the ecosystem"
      >
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
          {items.map(({ item, icon }) => {
            const active = isNavItemActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col gap-2 rounded-[16px] border p-3 transition-colors",
                    active
                      ? "border-[#3d4d73] bg-[#131c30]"
                      : "border-line bg-[#0c121f] hover:border-[#3d4d73]",
                  )}
                >
                  {icon}
                  <b className="flex items-center gap-1.5 text-[12.5px] font-extrabold">
                    {item.label}
                    {item.badge?.variant === "count" ? (
                      <span className="grid size-[18px] place-items-center rounded-full bg-red text-[10px] font-extrabold text-[#2a0d15] tabular-nums">
                        {item.badge.label}
                      </span>
                    ) : null}
                  </b>
                </Link>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
