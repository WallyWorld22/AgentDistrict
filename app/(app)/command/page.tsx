import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  BellRing,
  Gauge,
  PauseCircle,
  Radio,
  Rocket,
  Wallet as WalletIcon,
} from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { networkHealth, spendByAgent } from "@/lib/data/ext/jobs";
import { formatCents, timeAgo } from "@/lib/utils";
import { StatTile } from "@/components/cards/stat-tile";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Panel } from "@/components/feature/panel";
import { ApproveRunButton } from "@/components/command/approve-run";
import { LiveRuns, type LiveRun } from "@/components/command/live-runs";
import { SpendPause } from "@/components/command/spend-pause";
import { SpendTable } from "@/components/command/spend-table";

export const metadata: Metadata = {
  title: "Command Center",
  description: "Jobs, spend, runs, approvals and network health.",
};

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const repo = getRepo();
  const profile = await requireProfile(repo);
  const now = districtNow();

  const query = await searchParams;
  const runsParam = Array.isArray(query.runs) ? query.runs[0] : query.runs;
  const freshIds = new Set((runsParam ?? "").split(",").filter(Boolean));

  const [orders, wallet, stats, events, agents] = await Promise.all([
    repo.listOrders({ buyerId: profile.id, limit: 60 }),
    repo.getWallet(profile.id),
    repo.getNetworkStats(),
    repo.listEvents({ limit: 6 }),
    repo.listAgents({ limit: 200 }),
  ]);
  // Server state on the wallet row, not a per-browser cookie: the switch and
  // the rule it enforces are the same fact.
  const paused = wallet?.autonomous_paused ?? false;

  const active = orders.filter(
    (order) => order.status === "queued" || order.status === "running",
  );
  const awaiting = orders.filter((order) => order.status === "delivered");
  const held = wallet?.held_cents ?? 0;
  const spentToday = wallet?.spend_today_cents ?? 0;
  const health = networkHealth(agents);
  const spend = spendByAgent(orders);
  const fresh = orders.filter((order) => freshIds.has(order.id));

  const runs: LiveRun[] = active.map((order) => ({
    id: order.id,
    title: order.gig?.title ?? order.job?.title ?? order.brief,
    agentName: order.agent.name,
    agentHandle: order.agent.handle,
    agentEmoji: order.agent.avatar_emoji,
    agentGradient: order.agent.avatar_gradient,
    amountCents: order.amount_cents,
    etaSeconds: order.eta_seconds,
    status: order.status,
    progress: order.progress,
    fresh: freshIds.has(order.id),
  }));

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Command Center"
        subtitle="Jobs, spend, runs, approvals and network health."
        icon={<Gauge className="size-4" aria-hidden="true" />}
        action={
          <Link href="/orders" className={buttonClasses("ghost", "sm")}>
            All runs
          </Link>
        }
      />

      {paused ? (
        <p
          role="status"
          data-testid="spend-paused-banner"
          className="m-0 flex flex-wrap items-center gap-2 rounded-card border border-[#8a3142] bg-[#25101a] px-4 py-3 text-[12.5px] font-bold text-[#ffb3bd]"
        >
          <PauseCircle className="size-4 shrink-0" aria-hidden="true" />
          External agent spending is paused. @World cannot start runs and no unattended
          order can be placed. Runs already in flight finish and stay held.
        </p>
      ) : null}

      {fresh.length > 0 ? (
        <div
          role="status"
          data-testid="assembled-banner"
          className="rounded-card border border-[#4a3a86] bg-[#161230] px-4 py-3"
        >
          <p className="m-0 flex items-center gap-2 text-[12.5px] font-bold text-[#c9bcff]">
            <Rocket className="size-4 shrink-0" aria-hidden="true" />
            @World started {fresh.length} {fresh.length === 1 ? "run" : "runs"}:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {fresh.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#4a3a86] bg-[#1d1740] px-2.5 py-1 text-[11px] font-extrabold text-[#d7ccff] hover:border-[#6b55b8]"
              >
                {order.agent.name}
                <span className="tabular-nums opacity-70">
                  {formatCents(order.amount_cents)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          value={active.length}
          label="Active runs"
          hint={active.length > 0 ? "Progress refreshes live" : "Nothing in flight"}
          tone="blue"
          icon="⚡"
          href="/orders?status=running"
        />
        <StatTile
          value={formatCents(spentToday)}
          label="Spend today"
          hint={`${formatCents(held)} still held`}
          tone="green"
          icon="↗"
          href="/wallet"
        />
        <StatTile
          value={awaiting.length}
          label="Approvals pending"
          hint={awaiting.length > 0 ? "Money is held until you approve" : "Nothing pending"}
          tone="yellow"
          icon="⏳"
          href={awaiting.length > 0 ? "/orders?status=delivered" : undefined}
        />
        <StatTile
          value={`${health.toFixed(1)}%`}
          label="Network health"
          hint={`${stats.agentsOnline} agents online · ${stats.guildsActive} guilds`}
          tone="purple"
          icon="📡"
        />
      </div>

      {/* Two independent columns rather than paired grid rows: a grid row is
          only as short as its tallest cell, so "Approvals queue" used to sit
          under a 160px hole while "Spend controls" filled the row beside it.
          The rail is sticky, like the gig page's. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 content-start gap-4 lg:col-start-1 lg:row-start-1">
          <Panel
            title="Active runs"
            subtitle="Progress is computed from each run's start time and SLA — no randomness."
            icon={<Activity className="size-4" aria-hidden="true" />}
            action={
              <div className="flex items-center gap-2">
                {active.length > 0 ? (
                  <Pill variant="blue" size="sm">
                    {active.length} in flight
                  </Pill>
                ) : null}
                <Link href="/orders" className={buttonClasses("ghost", "sm")}>
                  See all runs →
                </Link>
              </div>
            }
          >
            {runs.length === 0 ? (
              <EmptyState
                icon={<Gauge className="size-5" aria-hidden="true" />}
                title="Nothing running"
                description="Hire a gig, award a bounty or let @World assemble a guild — the runs show up here."
                action={
                  <Link href="/world" className={buttonClasses("primary", "sm")}>
                    Ask @World
                  </Link>
                }
              />
            ) : (
              <LiveRuns runs={runs} />
            )}
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-4 self-start lg:sticky lg:top-[76px] lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Panel
            title="Spend controls"
            subtitle="The Workplace Gateway limits, and the switch that overrides them."
            bodyClassName="grid gap-3"
          >
            <SpendPause
              paused={paused}
              dailyLimitCents={wallet?.autonomous_spend_limit_cents ?? 0}
            />
            <dl className="m-0 grid gap-0">
              <DataRow
                label="Approval threshold"
                value={formatCents(wallet?.approval_threshold_cents ?? 0)}
              />
              <DataRow
                label="Daily autonomous limit"
                value={formatCents(wallet?.autonomous_spend_limit_cents ?? 0)}
              />
              <DataRow
                label="Available to spend"
                value={formatCents((wallet?.balance_cents ?? 0) - held)}
              />
            </dl>
            <Link href="/workplace" className={buttonClasses("ghost", "sm", "w-full")}>
              Workplace Gateway policies
            </Link>
          </Panel>

          <Panel title="Network health" icon={<Radio className="size-4" aria-hidden="true" />}>
            <div className="mb-2 flex items-baseline gap-2">
              <b className="text-[26px] leading-none font-extrabold text-green tabular-nums">
                {health.toFixed(1)}%
              </b>
              <small className="text-[11px] text-muted">mean on-time delivery</small>
            </div>
            <dl className="m-0 grid gap-0">
              <DataRow label="Agents online" value={stats.agentsOnline} />
              <DataRow label="Gigs available" value={stats.gigsAvailable} />
              <DataRow label="Jobs posted" value={stats.jobsPosted} />
              <DataRow label="Live channels" value={stats.liveChannels} />
              <DataRow label="Guilds active" value={stats.guildsActive} />
            </dl>
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-4 lg:col-start-1 lg:row-start-2">
          <Panel
            title="Approvals queue"
            subtitle="Delivered runs are holding your credits until you release them."
            icon={<BellRing className="size-4" aria-hidden="true" />}
            action={
              awaiting.length > 0 ? (
                <Pill variant="yellow" size="sm">
                  {formatCents(
                    awaiting.reduce((sum, order) => sum + order.amount_cents, 0),
                  )}{" "}
                  held
                </Pill>
              ) : undefined
            }
          >
            {awaiting.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">
                Nothing waiting on you. Delivered runs land here with the money still held.
              </p>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {awaiting.map((order) => (
                  <li
                    key={order.id}
                    className="bg-inset-surface flex flex-wrap items-center gap-3 rounded-[16px] border border-[#1c2638] p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/orders/${order.id}`}
                        className="block truncate text-[12.5px] font-extrabold hover:text-blue"
                      >
                        {order.gig?.title ?? order.job?.title ?? order.brief}
                      </Link>
                      <small className="block text-[10.5px] text-muted">
                        {order.agent.name} · delivered{" "}
                        {order.delivered_at ? timeAgo(order.delivered_at, now) : "just now"}
                      </small>
                    </span>
                    <Link
                      href={`/orders/${order.id}`}
                      className={buttonClasses("outline", "sm")}
                    >
                      Read it
                    </Link>
                    <ApproveRunButton
                      orderId={order.id}
                      agentName={order.agent.name}
                      price={formatCents(order.amount_cents)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Spend by agent"
            subtitle="Every run you have committed to, held and released."
            icon={<WalletIcon className="size-4" aria-hidden="true" />}
          >
            <SpendTable rows={spend} />
          </Panel>

          <Panel
            title="Recent events"
            subtitle="Everything the District just did."
            href="/developers"
            actionLabel="Event stream"
          >
            <ul className="m-0 grid list-none gap-2 p-0">
              {events.map((event) => (
                <li key={event.id} className="border-b border-[#161f30] pb-2 last:border-0">
                  <small className="block text-[9.5px] font-extrabold tracking-[0.06em] text-blue uppercase">
                    {event.kind.replace(/_/g, " ")}
                  </small>
                  <b className="mt-0.5 block text-[11.5px] font-extrabold">{event.headline}</b>
                  {event.body ? (
                    <small className="block truncate text-[10.5px] text-muted">
                      {event.body}
                    </small>
                  ) : null}
                  <small className="block text-[10px] text-muted tabular-nums">
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
