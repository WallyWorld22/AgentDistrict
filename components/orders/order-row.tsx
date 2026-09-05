import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { OrderDetail } from "@/lib/data/types";
import { cn, formatCents, timeAgo } from "@/lib/utils";
import { runTimeLabel } from "@/lib/data/ext/economy";
import { AgentAvatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ORDER_PROGRESS_TONE, OrderStatusPill } from "./order-status";

export type OrderRowProps = {
  order: OrderDetail;
  /** Injected `districtNow()` — rows never call `Date.now()` themselves. */
  now: number;
  /** Lifts the row and tints its border (used by "Needs your approval"). */
  highlight?: boolean;
};

/** One run in a list. The whole row is the link to `/orders/[id]`. */
export function OrderRow({ order, now, highlight = false }: OrderRowProps) {
  const title = order.gig?.title ?? order.job?.title ?? order.brief;
  const inFlight = order.status === "queued" || order.status === "running";

  return (
    <Link
      href={`/orders/${order.id}`}
      className={cn(
        "group flex items-center gap-3 rounded-[16px] border p-3 transition-colors duration-150",
        highlight
          ? "border-[#4a3a86] bg-[#161230] hover:border-[#6b55b8]"
          : "bg-inset-surface border-[#1c2638] hover:border-[#33415f]",
      )}
    >
      <AgentAvatar
        emoji={order.agent.avatar_emoji}
        handle={order.agent.handle}
        gradient={order.agent.avatar_gradient}
        name={order.agent.name}
        size="md"
        status={order.agent.status}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="min-w-0 truncate text-[12.5px] font-extrabold group-hover:text-blue">
            {title}
          </b>
          <OrderStatusPill status={order.status} size="sm" />
        </div>
        <small className="mt-0.5 block truncate text-[10.5px] text-muted">
          {order.agent.name} · {formatCents(order.amount_cents)}
          {order.package_tier ? ` · ${order.package_tier}` : ""} ·{" "}
          {order.delivered_at
            ? `delivered ${timeAgo(order.delivered_at, now)}`
            : `ordered ${timeAgo(order.created_at, now)}`}
        </small>
        {inFlight ? (
          <div className="mt-1.5 flex items-center gap-2">
            <Progress
              value={order.progress}
              size="xs"
              tone={ORDER_PROGRESS_TONE[order.status]}
              className="max-w-[220px]"
              label={`${title} progress`}
            />
            <small className="text-[10px] font-extrabold text-muted tabular-nums">
              {/* Time *left*, not the package's whole SLA — the same number and
                  the same helper the Command Center prints, so the two views of
                  one run can never disagree again. */}
              {order.progress}% · {runTimeLabel(order.eta_seconds, order.progress, true)}
            </small>
          </div>
        ) : null}
      </div>

      <ChevronRight
        className="size-4 shrink-0 text-[#5d6a83] group-hover:text-blue"
        aria-hidden="true"
      />
    </Link>
  );
}
