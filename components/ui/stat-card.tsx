import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type StatTone =
  | "default"
  | "green"
  | "blue"
  | "cyan"
  | "purple"
  | "pink"
  | "yellow"
  | "red";

export type StatCardProps = {
  icon?: React.ReactNode;
  value: React.ReactNode;
  label: React.ReactNode;
  /** e.g. "+312" trending delta. */
  delta?: React.ReactNode;
  /** Colour of the delta; defaults to green (up). */
  deltaTone?: "green" | "red" | "muted";
  tone?: StatTone;
  /** Turns the whole card into a link. */
  href?: string;
  className?: string;
};

export const STAT_TONES: Record<StatTone, string> = {
  default: "border-[#263753] bg-[#121e36] text-blue",
  green: "border-[#1b7253] bg-[#0c251d] text-green",
  blue: "border-[#235f90] bg-[#0c1b2e] text-blue",
  cyan: "border-[#1d6b7d] bg-[#07202a] text-cyan",
  purple: "border-[#554090] bg-[#19122e] text-purple",
  pink: "border-[#7c3583] bg-[#25102b] text-pink",
  yellow: "border-[#776023] bg-[#271f08] text-yellow",
  red: "border-[#8a3142] bg-[#2c1017] text-red",
};

const DELTA_TONES = {
  green: "text-green",
  red: "text-red",
  muted: "text-muted",
} as const;

export function StatCard({
  icon,
  value,
  label,
  delta,
  deltaTone = "green",
  tone = "default",
  href,
  className,
}: StatCardProps) {
  const body = (
    <>
      {icon ? (
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-[15px] border text-[20px]",
            STAT_TONES[tone],
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <b className="block truncate text-[18px] leading-tight font-extrabold tabular-nums">
          {value}
        </b>
        <small className="block truncate text-[11px] text-muted">{label}</small>
      </div>
      {delta ? (
        <span
          className={cn(
            "ml-auto shrink-0 text-[12px] font-extrabold tabular-nums",
            DELTA_TONES[deltaTone],
          )}
        >
          {delta}
        </span>
      ) : null}
    </>
  );

  const classes = cn(
    "bg-card-surface flex items-center gap-3 rounded-card border border-line p-3.5",
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
