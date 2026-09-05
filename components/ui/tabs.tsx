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
  /** Trailing count/badge content. */
  count?: React.ReactNode;
  disabled?: boolean;
};

export type TabsProps = {
  items: TabItem[];
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  /** Accessible name for the tab strip. */
  label?: string;
  size?: "sm" | "md";
};

const CHIP = [
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-extrabold whitespace-nowrap",
  "transition-[background-color,border-color,color,transform] duration-150 ease-out",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
  "aria-disabled:pointer-events-none aria-disabled:opacity-45",
].join(" ");

/**
 * `md` carries `min-h-10` because it is the size the browse filter strips use,
 * and a filter chip is the primary control on `/gigs`, `/agents`, `/market` and
 * `/search`: at 11px with `py-2` the box measured 35px, under the 40px touch
 * minimum in DESIGN.md §4. The rows already wrap, so the extra height costs
 * nothing.
 */
const CHIP_SIZES = {
  sm: "min-h-9 px-2.5 py-1.5 text-[10.5px]",
  md: "min-h-10 px-3 py-2 text-[11px]",
} as const;

/**
 * Horizontally scrollable chip row (BUILD_SPEC §3 "Tabs (scrollable chips)").
 *
 * Keyboard model: the strip is a single tab stop; ←/→ move between chips,
 * Home/End jump to the ends. Link chips navigate on Enter like any anchor.
 */
export function Tabs({
  items,
  value,
  onValueChange,
  className,
  label,
  size = "md",
}: TabsProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const enabled = items.filter((item) => !item.disabled);
  const activeValue =
    value !== undefined && enabled.some((i) => i.value === value)
      ? value
      : enabled[0]?.value;

  function focusAt(index: number) {
    const nodes = listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
    if (!nodes || nodes.length === 0) return;
    const clamped = (index + nodes.length) % nodes.length;
    nodes[clamped]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const nodes = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
    );
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusAt(current + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusAt(current - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(nodes.length - 1);
        break;
      default:
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label ?? "Filters"}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn(
        "no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === activeValue;
        const classes = cn(
          CHIP,
          CHIP_SIZES[size],
          active
            ? "border-transparent bg-grad-primary text-white shadow-[0_6px_18px_rgba(53,110,255,.28)]"
            : "border-line bg-[#0b111d] text-[#a8b4ca] hover:border-[#33415f] hover:text-text",
        );

        const inner = (
          <>
            {item.icon}
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "ml-0.5 tabular-nums",
                  active ? "text-white/75" : "text-[#6d7a92]",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </>
        );

        if (item.href && !item.disabled) {
          return (
            <Link
              key={item.value}
              href={item.href}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={classes}
            >
              {inner}
            </Link>
          );
        }

        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            tabIndex={active ? 0 : -1}
            className={classes}
            onClick={() => onValueChange?.(item.value)}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
