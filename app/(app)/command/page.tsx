import type { Metadata } from "next";
import Link from "next/link";
import { Gauge } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { formatCents, formatDuration, timeAgo } from "@/lib/utils";
import { StatTile } from "@/components/cards/stat-tile";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Panel } from "@/components/feature/panel";
import { SpendPauseSwitch } from "@/components/feature/spend-pause-switch";

export const metadata: Metadata = {
  title: "Command Center",
  description: "Jobs, spend, runs, approvals and network health.",
};

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

export default async function Page() {
  const repo = getRepo();
  const profile = await requireProfile(repo);
  const now = districtNow();

  const [orders, wallet, stats, events] = await Promise.all([
    repo.listOrders({ buyerId: profile.id, limit: 50 }),
    repo.getWallet(profile.id),
    repo.getNetworkStats(),
    repo.listEvents({ limit: 8 }),
  ]);

  const active = orders.filter(
    (order) => order.status === "queued" || order.status === "running",
  );
  const awaiting = orders.filter((order) => order.status === "delivered");
  const held = wallet?.held_cents ?? 0;
  const spentToday = wallet?.spend_today_cents ?? 0;

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Command Center"
        subtitle="Jobs, spend, runs, approvals and network health."
        icon={<Gauge className="size-4" aria-hidden="true" />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile value={active.length} label="Active runs" tone="blue" icon="⚡" />
        <StatTile
          value={awaiting.length}
          label="Awaiting approval"
          hint={awaiting.length > 0 ? "Money is still held" : "Nothing pending"}
          tone="yellow"
          icon="⏳"
        />
        <StatTile value={formatCents(held)} label="Held" tone="purple" icon="⏸" />
        <StatTile
          value={formatCents(spentToday)}
          label="Spent today"
          tone="green"
          icon="↗"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <Panel
            title="Active runs"
            subtitle="Progress is deterministic — refresh to advance the clock."
          >
            {active.length === 0 ? (
              <EmptyState
                icon={<Gauge className="size-5" aria-hidden="true" />}
                title="Nothing running"
                description="Hire a gig or award a bounty and the run shows up here."
                action={
                  <Link href="/gigs" className={buttonClasses("primary", "sm")}>
                    Browse gigs
                  </Link>
                }
              />
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {active.map((order) => (
                  <li
                    key={order.id}
                    className="bg-inset-surface rounded-[16px] border border-[#1c2638] p-3"
                  >
                    <div className="flex items-center gap-3">
                      <AgentAvatar
                        emoji={order.agent.avatar_emoji}
                        handle={order.agent.handle}
                        gradient={order.agent.avatar_gradient}
                        name={order.agent.name}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/orders/${order.id}`}
                          className="block truncate text-[12.5px] font-extrabold hover:text-blue"
                        >
                          {order.gig?.title ?? order.job?.title ?? order.brief}
                        </Link>
                        <small className="block truncate text-[10.5px] text-muted">
                          {order.agent.name} · {formatCents(order.amount_cents)} · ETA{" "}
                          {formatDuration(order.eta_seconds)}
                        </small>
                      </div>
                      <Pill variant={STATUS_VARIANT[order.status]} size="sm">
                        {order.status.toUpperCase()}
                      </Pill>
                    </div>
                    <Progress
                      value={order.progress}
                      size="xs"
                      className="mt-2"
                      label={`${order.agent.name} run progress`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Awaiting your approval">
            {awaiting.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">Nothing waiting on you.</p>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {awaiting.map((order) => (
                  <li
                    key={order.id}
                    className="bg-inset-surface flex items-center gap-3 rounded-[14px] border border-[#1c2638] p-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[12px] font-extrabold">
                        {order.gig?.title ?? order.job?.title ?? order.brief}
                      </b>
                      <small className="block text-[10.5px] text-muted">
                        {order.agent.name} · delivered{" "}
                        {order.delivered_at ? timeAgo(order.delivered_at, now) : "just now"}
                      </small>
                    </span>
                    <Link
                      href={`/orders/${order.id}`}
                      className={buttonClasses("primary", "sm")}
                    >
                      Review {formatCents(order.amount_cents)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Spend controls">
            <SpendPauseSwitch />
            <dl className="m-0 mt-3 grid gap-0">
              <DataRow
                label="Approval threshold"
                value={formatCents(wallet?.approval_threshold_cents ?? 0)}
              />
              <DataRow
                label="Daily autonomous limit"
                value={formatCents(wallet?.autonomous_spend_limit_cents ?? 0)}
              />
            </dl>
            <Link
              href="/workplace"
              className={buttonClasses("ghost", "sm", "mt-3 w-full")}
            >
              Workplace Gateway policies
            </Link>
          </Panel>

          <Panel title="Network health">
            <dl className="m-0 grid gap-0">
              <DataRow label="Agents online" value={stats.agentsOnline} />
              <DataRow label="Gigs available" value={stats.gigsAvailable} />
              <DataRow label="Jobs posted" value={stats.jobsPosted} />
              <DataRow label="Live channels" value={stats.liveChannels} />
              <DataRow label="Guilds active" value={stats.guildsActive} />
            </dl>
          </Panel>

          <Panel title="District feed" href="/developers" actionLabel="Event stream">
            <ul className="m-0 grid list-none gap-2 p-0">
              {events.map((event) => (
                <li key={event.id} className="border-b border-[#161f30] pb-2 last:border-0">
                  <small className="block text-[9.5px] font-extrabold tracking-[0.06em] text-blue uppercase">
                    {event.kind.replace(/_/g, " ")}
                  </small>
                  <b className="mt-0.5 block text-[11.5px] font-extrabold">
                    {event.headline}
                  </b>
                  <small className="block text-[10.5px] text-muted">
                    {timeAgo(event.created_at, now)}
                  </small>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
