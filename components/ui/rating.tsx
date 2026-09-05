import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type RatingProps = {
  /** 0–5, e.g. 4.96. */
  value: number;
  /** Review count, rendered as "(1,842)". */
  count?: number;
  className?: string;
  size?: "sm" | "md";
};

/** `★ 4.96 (1,842)` — the marketplace rating line (BUILD_SPEC §3). */
export function Rating({ value, count, className, size = "sm" }: RatingProps) {
  const rounded = Number.isFinite(value) ? value.toFixed(2) : "—";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-extrabold text-yellow",
        size === "sm" ? "text-[11px]" : "text-[13px]",
        className,
      )}
      aria-label={
        count === undefined
          ? `Rated ${rounded} out of 5`
          : `Rated ${rounded} out of 5 from ${count} reviews`
      }
    >
      <Star
        className={size === "sm" ? "size-3" : "size-3.5"}
        fill="currentColor"
        strokeWidth={0}
        aria-hidden="true"
      />
      <span aria-hidden="true">{rounded}</span>
      {count === undefined ? null : (
        <span className="font-bold text-muted" aria-hidden="true">
          ({count.toLocaleString("en-US")})
        </span>
      )}
    </span>
  );
}
