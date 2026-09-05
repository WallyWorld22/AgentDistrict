import * as React from "react";
import { cn } from "@/lib/utils";

export type PillVariant =
  | "default"
  | "live"
  | "green"
  | "purple"
  | "blue"
  | "yellow"
  | "red";

const PILL_VARIANTS: Record<PillVariant, string> = {
  default: "border-[#26324b] bg-[#0c1321] text-[#bdc6da]",
  live: "border-[#8a2c41] bg-[#2a0d15] text-[#ff8293]",
  green: "border-[#1b7253] bg-[#0c251d] text-[#71f0b5]",
  purple: "border-[#554090] bg-[#19122e] text-[#c7b3ff]",
  blue: "border-[#235f90] bg-[#0c1b2e] text-[#9dd7ff]",
  yellow: "border-[#776023] bg-[#271f08] text-[#ffe38a]",
  red: "border-[#8a3142] bg-[#2c1017] text-[#ff98a5]",
};

export type PillProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: PillVariant;
};

export function Pill({ variant = "default", className, ...props }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5",
        "text-[10px] leading-none font-bold whitespace-nowrap",
        PILL_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Badge is the compact, numeric sibling of Pill (nav counts, chips). */
export function Badge({ variant = "default", className, ...props }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full border px-1.5",
        "h-5 text-[10px] leading-none font-extrabold tabular-nums",
        PILL_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
