import { cn } from "@/lib/utils";

export type LiveDotProps = {
  className?: string;
  /** Tailwind colour class for the dot. Defaults to the brand green. */
  color?: string;
  /** Set false for a static dot (e.g. inside a badge that already pulses). */
  pulse?: boolean;
  label?: string;
};

/** The little pulsing presence dot used for "online" / "LIVE" affordances. */
export function LiveDot({
  className,
  color = "bg-green",
  pulse = true,
  label,
}: LiveDotProps) {
  return (
    <span
      className={cn(
        "inline-block size-[7px] shrink-0 rounded-full",
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
