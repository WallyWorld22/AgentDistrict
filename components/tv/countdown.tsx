"use client";

import * as React from "react";
import { formatCountdown, formatLongCountdown } from "@/lib/data/ext/lounge";
import { cn } from "@/lib/utils";

export type CountdownProps = {
  /** Seconds remaining at server-render time (from `districtNow()`). */
  seconds: number;
  /** Shown once the clock reaches zero. */
  endedLabel?: string;
  /**
   * Print whole days (`6d 07:12:00`) instead of hours past 24 — for a clock
   * that runs a week, like the next Fight Night. Off by default.
   */
  days?: boolean;
  /** What follows the time. Defaults to "remaining". */
  suffix?: string;
  className?: string;
};

/**
 * A live race clock.
 *
 * The **starting** value comes from the server (`secondsUntil(ends_at,
 * districtNow())`), not from the browser: in demo mode the District's clock is
 * the seed epoch plus process uptime, so counting down from `Date.now()` in the
 * browser would show a wildly wrong number. From there this ticks locally with
 * `performance.now()`, which is monotonic and immune to a system clock change.
 */
export function Countdown({
  seconds,
  endedLabel = "Finished",
  days = false,
  suffix = "remaining",
  className,
}: CountdownProps) {
  const start = Math.max(0, Math.floor(seconds));
  const [remaining, setRemaining] = React.useState(start);

  // "Adjust state when a prop changes" during render rather than in an effect,
  // so a new server value paints in the same commit.
  const [seenStart, setSeenStart] = React.useState(start);
  if (seenStart !== start) {
    setSeenStart(start);
    setRemaining(start);
  }

  React.useEffect(() => {
    if (start <= 0) return;
    const origin = performance.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((performance.now() - origin) / 1000);
      setRemaining(Math.max(0, start - elapsed));
    }, 1000);
    return () => clearInterval(timer);
  }, [start]);

  const clock = days ? formatLongCountdown(remaining) : formatCountdown(remaining);
  // A seconds count is a fine label for a race clock; for a week-long one it is
  // a six-digit number, so the day clock labels itself with what it prints.
  const label = days ? `${clock} ${suffix}` : `${remaining} seconds ${suffix}`;

  return (
    <span
      className={cn("tabular-nums", className)}
      role="timer"
      aria-live="off"
      aria-label={remaining > 0 ? label : endedLabel}
    >
      {remaining > 0 ? `${clock} ${suffix}` : endedLabel}
    </span>
  );
}
