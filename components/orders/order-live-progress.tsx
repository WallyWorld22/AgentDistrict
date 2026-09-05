"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { OrderStatus } from "@/lib/data/types";
import { formatDuration } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { ORDER_PROGRESS_TONE, ORDER_STATUS_COPY } from "./order-status";
import { refreshOrderAction } from "@/app/(app)/orders/actions";

const POLL_MS = 3000;

export type OrderLiveProgressProps = {
  orderId: string;
  status: OrderStatus;
  progress: number;
  etaSeconds: number;
};

/**
 * Live run progress.
 *
 * While the run is in flight this polls the `refreshOrder` Server Action every
 * three seconds; the moment the status leaves `queued`/`running` it asks Next
 * to re-render the page so the deliverable, the cost breakdown and the approve
 * button appear without a manual reload.
 *
 * The parent gives this component a `key` derived from the server's status and
 * progress, so a server re-render re-seeds it instead of it having to sync
 * props into state.
 */
export function OrderLiveProgress({
  orderId,
  status,
  progress,
  etaSeconds,
}: OrderLiveProgressProps) {
  const router = useRouter();
  const [pulse, setPulse] = React.useState({ status, progress });
  const live = pulse.status === "running" || pulse.status === "queued";

  React.useEffect(() => {
    if (!live) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      const next = await refreshOrderAction(orderId);
      if (cancelled || !next) return;
      setPulse({ status: next.status, progress: next.progress });
      if (next.status !== "running" && next.status !== "queued") {
        router.refresh();
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orderId, live, router]);

  const remaining = Math.max(
    0,
    Math.round(etaSeconds * (1 - Math.min(100, pulse.progress) / 100)),
  );

  return (
    <div data-testid="order-progress" data-status={pulse.status}>
      <div className="flex items-baseline justify-between gap-2">
        <b className="text-[26px] leading-none font-extrabold tabular-nums">
          {pulse.progress}%
        </b>
        <small className="flex items-center gap-1.5 text-[11px] text-muted tabular-nums">
          {live ? (
            <>
              <Loader2 className="size-3 animate-spin-slow" aria-hidden="true" />
              {remaining > 0 ? `~${formatDuration(remaining)} left` : "finishing up"}
            </>
          ) : (
            `SLA ${formatDuration(etaSeconds)}`
          )}
        </small>
      </div>

      <Progress
        value={pulse.progress}
        size="md"
        tone={ORDER_PROGRESS_TONE[pulse.status]}
        className="mt-2"
        label="Run progress"
      />

      <p
        className="m-0 mt-2 text-[11.5px] leading-relaxed text-ink"
        aria-live="polite"
        data-testid="order-status-copy"
      >
        {ORDER_STATUS_COPY[pulse.status]}
      </p>
      <p className="m-0 mt-1 text-[11px] leading-relaxed text-muted">
        Progress is computed deterministically from the run&rsquo;s start time and its
        delivery SLA — no randomness, no external call
        {live ? ", refreshed every 3 seconds" : ""}.
      </p>
    </div>
  );
}
