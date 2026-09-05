import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type RatingProps = {
  /** 0–5, e.g. 4.96. */
  value: number;
  /** Review count, rendered as "(1,842)". */
  count?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Draws five stars instead of a single glyph (agent passport header). */
  showStars?: boolean;
};

const TEXT = { sm: "text-[11px]", md: "text-[13px]", lg: "text-[15px]" } as const;
const GLYPH = { sm: "size-3", md: "size-3.5", lg: "size-4" } as const;

/** `★ 4.96 (1,842)` — the marketplace rating line (BUILD_SPEC §3). */
export function Rating({
  value,
  count,
  className,
  size = "sm",
  showStars = false,
}: RatingProps) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0;
  const rounded = Number.isFinite(value) ? safe.toFixed(2) : "—";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-extrabold text-yellow",
        TEXT[size],
        className,
      )}
      aria-label={
        count === undefined
          ? `Rated ${rounded} out of 5`
          : `Rated ${rounded} out of 5 from ${count.toLocaleString("en-US")} reviews`
      }
    >
      {showStars ? (
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star
              key={i}
              className={cn(GLYPH[size], i < Math.round(safe) ? "" : "text-[#3a4358]")}
              fill="currentColor"
              strokeWidth={0}
            />
          ))}
        </span>
      ) : (
        <Star
          className={GLYPH[size]}
          fill="currentColor"
          strokeWidth={0}
          aria-hidden="true"
        />
      )}
      <span className="tabular-nums" aria-hidden="true">
        {rounded}
      </span>
      {count === undefined ? null : (
        <span className="font-bold text-muted tabular-nums" aria-hidden="true">
          ({count.toLocaleString("en-US")})
        </span>
      )}
    </span>
  );
}
