import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { formatCents, formatDuration, timeAgo } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { DeliverableViewer } from "@/components/feature/deliverable-viewer";
import { OrderActions } from "@/components/feature/order-actions";
import { SimulatedRunBadge } from "@/components/feature/simulated-run";

type Params = Promise<{ id: string }>;

export const dynamic = "force-dynamic";

const STATUS_VARIANT = {
  queued: "yellow",
  running: "blue",
  delivered: "purple",
  approved: "green",
  disputed: "red",
  cancelled: "default",
  failed: "red",
} as const;

const PROGRESS_TONE = {
  queued: "yellow",
  running: "primary",
  delivered: "cyan",
  approved: "green",
  disputed: "red",
  cancelled: "red",
  failed: "red",
} as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const order = await getRepo().getOrder(id);
  if (!order) return { title: "Run not found" };
  return { title: `${order.agent.name} run · Task run` };
}

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const repo = getRepo();
  const order = await repo.getOrder(id);
  if (!order) notFound();

  const now = districtNow();
  const profile = await getCurrentProfile(repo);
  const isBuyer = profile?.id === order.buyer_id;

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={`${order.agent.name} · ${order.gig?.title ?? order.job?.title ?? "Task run"}`}
        subtitle={`Ordered ${timeAgo(order.created_at, now)} · ${formatCents(order.amount_cents)}`}
        icon={<Package className="size-4" aria-hidden="true" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SimulatedRunBadge />
            <Pill variant={STATUS_VARIANT[order.status]}>
              {order.status.toUpperCase()}
            </Pill>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <Panel title="Progress">
            <div className="flex items-baseline justify-between gap-2">
              <b className="text-[26px] leading-none font-extrabold tabular-nums">
                {order.progress}%
              </b>
              <small className="text-[11px] text-muted">
                ETA {formatDuration(order.eta_seconds)}
                {order.delivered_at
                  ? ` · delivered ${timeAgo(order.delivered_at, now)}`
                  : ""}
              </small>
            </div>
            <Progress
              value={order.progress}
              size="md"
              tone={PROGRESS_TONE[order.status]}
              className="mt-2"
              label="Run progress"
            />
            <p className="m-0 mt-2 text-[11px] leading-relaxed text-muted">
              Progress is computed deterministically from the run&rsquo;s start time and
              its delivery SLA — no randomness, no external call.
            </p>
          </Panel>

          <Panel title="Brief">
            <p className="m-0 text-[13px] leading-relaxed whitespace-pre-line text-ink">
              {order.brief}
            </p>
          </Panel>

          {order.output ? (
            <Panel title="Deliverable">
              <DeliverableViewer output={order.output} />
            </Panel>
          ) : (
            <Panel title="Deliverable">
              <p className="m-0 text-[12px] text-muted">
                Nothing delivered yet. The structured output appears here the moment
                the run completes.
              </p>
            </Panel>
          )}

          <Panel title="Timeline" subtitle="Every step is written to the audit log.">
            <ol className="m-0 grid list-none gap-2 p-0">
              {order.audit_log.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <Inset>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <b className="font-mono text-[11.5px] font-extrabold text-cyan">
                        {entry.event}
                      </b>
                      <small className="text-[10.5px] text-muted">
                        {entry.actor} · {timeAgo(entry.at, now)}
                      </small>
                    </div>
                    {entry.detail ? (
                      <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-ink">
                        {entry.detail}
                      </p>
                    ) : null}
                  </Inset>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel title="The agent">
            <Link
              href={`/agents/${order.agent.handle}`}
              className="flex items-center gap-3 rounded-[15px] p-1 transition-colors hover:bg-white/4"
            >
              <AgentAvatar
                emoji={order.agent.avatar_emoji}
                handle={order.agent.handle}
                gradient={order.agent.avatar_gradient}
                name={order.agent.name}
                size="md"
                status={order.agent.status}
              />
              <span className="min-w-0">
                <b className="block truncate text-[13px] font-extrabold">
                  {order.agent.name}
                </b>
                <small className="block truncate text-[11px] text-muted">
                  @{order.agent.handle}
                </small>
              </span>
            </Link>
          </Panel>

          <Panel title="Cost">
            <dl className="m-0 grid gap-0">
              <DataRow label="Total" value={formatCents(order.amount_cents)} />
              {order.cost_breakdown ? (
                <>
                  <DataRow
                    label="Agent payout"
                    value={formatCents(order.cost_breakdown.agent_cents)}
                  />
                  <DataRow
                    label="District fee"
                    value={formatCents(order.cost_breakdown.district_fee_cents)}
                  />
                  <DataRow
                    label="Tools"
                    value={formatCents(order.cost_breakdown.tools_cents)}
                  />
                </>
              ) : (
                <DataRow label="Status" value="Held until you approve" />
              )}
              {order.package_tier ? (
                <DataRow label="Package" value={order.package_tier} />
              ) : null}
            </dl>
            <Link
              href="/wallet"
              className={buttonClasses("ghost", "sm", "mt-3 w-full")}
            >
              Open wallet
            </Link>
          </Panel>

          {isBuyer ? (
            <Panel title="Your call">
              <OrderActions
                orderId={order.id}
                status={order.status}
                amountCents={order.amount_cents}
              />
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
