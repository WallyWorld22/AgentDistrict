"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = {
  value: string;
  label: React.ReactNode;
  /** When set the chip renders as a Link instead of a button. */
  href?: string;
  icon?: React.ReactNode;
};

export type TabsProps = {
  items: TabItem[];
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  /** Accessible name for the tab strip. */
  label?: string;
};

const CHIP =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-extrabold whitespace-nowrap transition-colors";

/** Horizontally scrollable chip row (BUILD_SPEC §3 "Tabs (scrollable chips)"). */
export function Tabs({ items, value, onValueChange, className, label }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label={label ?? "Filters"}
      aria-orientation="horizontal"
      className={cn("no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        const classes = cn(
          CHIP,
          active
            ? "border-transparent bg-grad-primary text-white"
            : "border-line bg-[#0b111d] text-[#a8b4ca] hover:border-[#33415f] hover:text-text",
        );

        if (item.href) {
          return (
            <Link
              key={item.value}
              href={item.href}
              role="tab"
              aria-selected={active}
              className={classes}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        }

        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={classes}
            onClick={() => onValueChange?.(item.value)}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
