import { AlertTriangle, Check, Circle, Loader2 } from "lucide-react";
import type { OrderStatus } from "@/lib/data/types";
import { orderTimeline } from "@/lib/data/ext/gigs";
import { cn } from "@/lib/utils";

const DOT = {
  done: "border-[#1b7253] bg-[#0c251d] text-green",
  current: "border-[#2f5fb8] bg-[#101a30] text-blue",
  failed: "border-[#8a3142] bg-[#2c1017] text-red",
  pending: "border-line bg-[#0b111d] text-[#5d6a83]",
} as const;

const LABEL = {
  done: "text-ink",
  current: "text-text",
  failed: "text-[#ff98a5]",
  pending: "text-muted",
} as const;

/**
 * Queued → Running → Delivered → Approved/Disputed (BUILD_SPEC §4).
 *
 * A horizontal stepper on wide screens, a vertical list on a phone; state is
 * carried by a glyph as well as by colour.
 */
export function OrderTimeline({ status }: { status: OrderStatus }) {
  const stops = orderTimeline(status);
  // The spinner belongs to a run that is genuinely still moving; a settled
  // stop ("Delivered", "Approved") gets a check even when it is the last one.
  const inFlight = status === "queued" || status === "running";

  return (
    <ol className="m-0 grid list-none gap-0 p-0 sm:grid-cols-4">
      {stops.map((stop, index) => (
        <li key={stop.key} className="relative flex items-start gap-2.5 pb-4 sm:block sm:pb-0">
          {index < stops.length - 1 ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute bg-[#1f2a3f]",
                "top-7 bottom-0 left-[13px] w-px",
                "sm:top-[13px] sm:right-0 sm:bottom-auto sm:left-[30px] sm:h-px sm:w-auto",
                stop.state === "done" && "bg-[#1b7253]",
              )}
            />
          ) : null}

          <span
            className={cn(
              "relative z-10 grid size-7 shrink-0 place-items-center rounded-full border",
              DOT[stop.state],
            )}
            aria-hidden="true"
          >
            {stop.state === "done" ? (
              <Check className="size-3.5" />
            ) : stop.state === "failed" ? (
              <AlertTriangle className="size-3.5" />
            ) : stop.state === "current" ? (
              inFlight ? (
                <Loader2 className="size-3.5 animate-spin-slow" />
              ) : (
                <Check className="size-3.5" />
              )
            ) : (
              <Circle className="size-2.5" />
            )}
          </span>

          <span className="sm:mt-2 sm:block">
            <b className={cn("block text-[12px] font-extrabold", LABEL[stop.state])}>
              {stop.label}
            </b>
            <small className="block text-[10px] font-extrabold tracking-[0.05em] text-muted uppercase">
              {stop.state === "current"
                ? "now"
                : stop.state === "done"
                  ? "done"
                  : stop.state === "failed"
                    ? "ended"
                    : "next"}
            </small>
          </span>
        </li>
      ))}
    </ol>
  );
}
