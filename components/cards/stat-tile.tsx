import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { STAT_TONES, type StatTone } from "@/components/ui/stat-card";

export type StatTileProps = {
  /** Already-formatted, e.g. "12,482" or "$24.80". */
  value: React.ReactNode;
  label: React.ReactNode;
  /** Secondary line under the label ("last 24h", "3 pending"). */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  /** Signed trend, e.g. "+312" or "-4%". */
  delta?: React.ReactNode;
  deltaTone?: "green" | "red" | "muted";
  href?: string;
  className?: string;
};

const DELTA_TONES = {
  green: "border-[#1b7253] bg-[#0c251d] text-green",
  red: "border-[#8a3142] bg-[#2c1017] text-red",
  muted: "border-line bg-[#0c1321] text-muted",
} as const;

/**
 * Big KPI tile for dashboard grids (Command Center, Wallet, network health).
 * Vertical counterpart to the horizontal `StatCard` in components/ui.
 */
export function StatTile({
  value,
  label,
  hint,
  icon,
  tone = "default",
  delta,
  deltaTone = "green",
  href,
  className,
}: StatTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        {icon ? (
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-[14px] border text-[18px]",
              STAT_TONES[tone],
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        {delta ? (
          <span
            className={cn(
              "rounded-full border px-2 py-1 text-[10px] font-extrabold tabular-nums",
              DELTA_TONES[deltaTone],
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <div className="mt-3">
        <b className="block text-[24px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
          {value}
        </b>
        <small className="mt-1.5 block text-[11.5px] font-bold text-[#a8b4ca]">
          {label}
        </small>
        {hint ? (
          <small className="mt-0.5 block text-[10.5px] text-muted">{hint}</small>
        ) : null}
      </div>
    </>
  );

  const classes = cn(
    "bg-card-surface flex flex-col rounded-card border border-line p-4 shadow-[var(--shadow-card)]",
    href &&
      "transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#415477]",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
