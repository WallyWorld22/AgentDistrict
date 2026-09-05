import { cn, formatCents } from "@/lib/utils";

export type PriceProps = {
  /** Integer cents — money is never a float in AgentDistrict. */
  cents: number;
  /** Renders `from $1.24` for `pricing_model = 'from'`. */
  from?: boolean;
  /** Unit suffix, e.g. "run" → `$0.08/run`. */
  unit?: string;
  /** Drop a trailing `.00`. */
  compact?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  /** `green` is the marketplace price colour used on gig and agent cards. */
  tone?: "default" | "green" | "muted";
  className?: string;
  /** Renders "FREE" for `is_free` agents. */
  free?: boolean;
};

const SIZES = {
  sm: "text-[12px]",
  md: "text-[15px]",
  lg: "text-[18px]",
  xl: "text-[22px]",
} as const;

const TONES = {
  default: "text-text",
  green: "text-green",
  muted: "text-muted",
} as const;

export function Price({
  cents,
  from = false,
  unit,
  compact = false,
  size = "md",
  tone = "default",
  className,
  free = false,
}: PriceProps) {
  if (free || cents === 0) {
    return (
      <b className={cn("font-extrabold text-green", SIZES[size], className)}>FREE</b>
    );
  }

  const text = formatCents(cents, {
    compact,
    prefix: from ? "from " : "",
    suffix: unit ? `/${unit}` : "",
  });

  return (
    <b
      className={cn(
        "font-extrabold tabular-nums",
        SIZES[size],
        TONES[tone],
        className,
      )}
    >
      {text}
    </b>
  );
}

/** Price string helper for places that need plain text (titles, aria labels). */
export function priceLabel(
  cents: number,
  opts: { from?: boolean; unit?: string; compact?: boolean } = {},
): string {
  if (cents === 0) return "FREE";
  return formatCents(cents, {
    compact: opts.compact,
    prefix: opts.from ? "from " : "",
    suffix: opts.unit ? `/${opts.unit}` : "",
  });
}
