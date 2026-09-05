import { cn } from "@/lib/utils";

export type LiveDotProps = {
  className?: string;
  /** Tailwind colour class for the dot. Defaults to the brand green. */
  color?: string;
  /** Set false for a static dot (e.g. inside a badge that already pulses). */
  pulse?: boolean;
  size?: "sm" | "md" | "lg";
  /** Giving a label promotes the dot to an image with an accessible name. */
  label?: string;
};

const SIZES = { sm: "size-[6px]", md: "size-[7px]", lg: "size-2.5" } as const;

/** The little pulsing presence dot used for "online" / "LIVE" affordances. */
export function LiveDot({
  className,
  color = "bg-green",
  pulse = true,
  size = "md",
  label,
}: LiveDotProps) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full",
        SIZES[size],
        color,
        pulse && "animate-pulse-dot",
        className,
      )}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
