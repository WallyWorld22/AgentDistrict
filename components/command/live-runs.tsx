"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { OrderStatus } from "@/lib/data/types";
import { cn, formatCents } from "@/lib/utils";
import { runTimeLabel } from "@/lib/data/ext/economy";
import { AgentAvatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { refreshRunsAction } from "@/app/(app)/command/actions";

const POLL_MS = 3000;

export type LiveRun = {
  id: string;
  title: string;
  agentName: string;
  agentHandle: string;
  agentEmoji: string;
  agentGradient: string;
  amountCents: number;
  etaSeconds: number;
  status: OrderStatus;
  progress: number;
  /** True when this run was started by the assembly that just happened. */
  fresh?: boolean;
};

const STATUS_VARIANT = {
  queued: "yellow",
  running: "blue",
  delivered: "purple",
  approved: "green",
  disputed: "red",
  cancelled: "default",
  failed: "red",
} as const;

const STATUS_TONE = {
  queued: "yellow",
  running: "primary",
  delivered: "cyan",
  approved: "green",
  disputed: "red",
  cancelled: "primary",
  failed: "red",
} as const;

/**
 * Active runs with live progress.
 *
 * Progress is deterministic — computed from each run's start time and its SLA
 * (BUILD_SPEC §6) — so this polls one Server Action for every run at once
 * instead of one request per row, and asks Next to re-render the page when a
 * run finishes so the approvals queue below picks it up.
 */
export function LiveRuns({ runs }: { runs: LiveRun[] }) {
  const router = useRouter();
  const [pulse, setPulse] = React.useState<Record<string, { status: OrderStatus; progress: number }>>(
    {},
  );

  const live = runs.some((run) => run.status === "queued" || run.status === "running");

  React.useEffect(() => {
    if (!live) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      const next = await refreshRunsAction();
      if (cancelled) return;
      const map: Record<string, { status: OrderStatus; progress: number }> = {};
      let settled = false;
      for (const row of next) {
        map[row.id] = { status: row.status, progress: row.progress };
        if (row.status !== "queued" && row.status !== "running") settled = true;
      }
      setPulse(map);
      if (settled) router.refresh();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live, router]);

  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {runs.map((run) => {
        const state = pulse[run.id] ?? { status: run.status, progress: run.progress };
        const inFlight = state.status === "queued" || state.status === "running";
        // Shared with `/orders`' rows so the two surfaces cannot drift.
        const timeLabel = runTimeLabel(run.etaSeconds, state.progress, inFlight);

        return (
          <li
            key={run.id}
            data-testid="command-run"
            data-status={state.status}
            className={cn(
              "rounded-[16px] border p-3",
              run.fresh
                ? "border-[#4a3a86] bg-[#161230]"
                : "bg-inset-surface border-[#1c2638]",
            )}
          >
            <div className="flex items-center gap-3">
              <AgentAvatar
                emoji={run.agentEmoji}
                handle={run.agentHandle}
                gradient={run.agentGradient}
                name={run.agentName}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/orders/${run.id}`}
                  className="block truncate text-[12.5px] font-extrabold hover:text-blue"
                >
                  {run.title}
                </Link>
                <small className="block truncate text-[10.5px] text-muted tabular-nums">
                  {run.agentName} · {formatCents(run.amountCents)} · {timeLabel}
                </small>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {inFlight ? (
                  <Loader2
                    className="size-3.5 animate-spin-slow text-blue"
                    aria-hidden="true"
                  />
                ) : null}
                <Pill variant={STATUS_VARIANT[state.status]} size="sm">
                  {state.status.toUpperCase()}
                </Pill>
                <b className="w-9 text-right text-[11.5px] font-extrabold tabular-nums">
                  {state.progress}%
                </b>
              </div>
            </div>
            <Progress
              value={state.progress}
              size="xs"
              tone={STATUS_TONE[state.status]}
              className="mt-2"
              label={`${run.title} progress`}
            />
          </li>
        );
      })}
    </ul>
  );
}
