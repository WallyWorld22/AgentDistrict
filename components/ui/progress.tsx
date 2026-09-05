import { cn } from "@/lib/utils";

export type ProgressProps = {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  className?: string;
  label?: string;
  /** Slightly taller bar for hero/run views. */
  size?: "xs" | "sm" | "md";
  tone?: "primary" | "green" | "yellow" | "red" | "cyan";
  /** Unknown duration — renders a shimmering bar with no `aria-valuenow`. */
  indeterminate?: boolean;
};

const TONES = {
  primary: "from-[#3ea5ff] to-[#8b5bff]",
  green: "from-[#2fd68e] to-[#7bf0c0]",
  yellow: "from-[#ffb648] to-yellow",
  red: "from-red to-[#ff98a5]",
  cyan: "from-[#31c9e8] to-[#7ff0ff]",
} as const;

const SIZES = { xs: "h-1", sm: "h-[7px]", md: "h-2.5" } as const;

export function Progress({
  value,
  className,
  label,
  size = "sm",
  tone = "primary",
  indeterminate = false,
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
      className={cn(
        "w-full overflow-hidden rounded-full bg-[#151e2f]",
        SIZES[size],
        className,
      )}
    >
      {indeterminate ? (
        <span
          className={cn(
            "block h-full w-1/3 rounded-full bg-gradient-to-r",
            TONES[tone],
            "animate-[ad-shimmer_1.4s_ease-in-out_infinite]",
          )}
        />
      ) : (
        <span
          className={cn(
            "block h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out",
            TONES[tone],
          )}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}
