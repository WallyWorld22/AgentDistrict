import * as React from "react";
import { cn } from "@/lib/utils";

export type StatCardProps = {
  icon?: React.ReactNode;
  value: React.ReactNode;
  label: React.ReactNode;
  /** e.g. "+312" trending delta. */
  delta?: React.ReactNode;
  tone?: "default" | "green" | "blue" | "purple" | "yellow" | "red";
  className?: string;
};

const TONES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "border-[#263753] bg-[#121e36] text-blue",
  green: "border-[#1b7253] bg-[#0c251d] text-green",
  blue: "border-[#235f90] bg-[#0c1b2e] text-blue",
  purple: "border-[#554090] bg-[#19122e] text-purple",
  yellow: "border-[#776023] bg-[#271f08] text-yellow",
  red: "border-[#8a3142] bg-[#2c1017] text-red",
};

export function StatCard({
  icon,
  value,
  label,
  delta,
  tone = "default",
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-card-surface flex items-center gap-3 rounded-card border border-line p-3.5",
        className,
      )}
    >
      {icon ? (
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-[15px] border text-[20px]",
            TONES[tone],
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <b className="block truncate text-[18px] leading-tight font-extrabold">
          {value}
        </b>
        <small className="block truncate text-[11px] text-muted">{label}</small>
      </div>
      {delta ? (
        <span className="ml-auto shrink-0 text-[12px] font-extrabold text-green">
          {delta}
        </span>
      ) : null}
    </div>
  );
}
