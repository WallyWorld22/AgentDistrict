import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { cn, formatCents, timeAgo } from "@/lib/utils";
import { StatTile } from "@/components/cards/stat-tile";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Panel } from "@/components/feature/panel";
import { TopUpForm } from "@/components/feature/top-up-form";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Balance, holds, spend today, approval thresholds and transactions.",
};

export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, "green" | "yellow" | "blue" | "purple" | "red" | "default"> = {
  topup: "green",
  hold: "yellow",
  release: "blue",
  refund: "purple",
  payout: "green",
  fee: "red",
};

export default async function Page() {
  const repo = getRepo();
  const profile = await requireProfile(repo);
  const now = districtNow();

  const [wallet, transactions] = await Promise.all([
    repo.getWallet(profile.id),
    repo.listTransactions(profile.id, 30),
  ]);

  const balance = wallet?.balance_cents ?? 0;
  const held = wallet?.held_cents ?? 0;
  const available = balance - held;
  const spentToday = wallet?.spend_today_cents ?? 0;
  const limit = wallet?.autonomous_spend_limit_cents ?? 0;
  const threshold = wallet?.approval_threshold_cents ?? 0;
  const usage = limit > 0 ? Math.min(100, (spentToday / limit) * 100) : 0;

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District Wallet"
        subtitle="Balance, holds, spend today, approval thresholds and transactions."
        icon={<Wallet className="size-4" aria-hidden="true" />}
        action={<Pill variant="green">No real money moves</Pill>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile value={formatCents(available)} label="Available" tone="green" icon="$" />
        <StatTile
          value={formatCents(held)}
          label="Held in flight"
          hint="Released when you approve"
          tone="yellow"
          icon="⏸"
        />
        <StatTile value={formatCents(balance)} label="Balance" tone="blue" icon="◆" />
        <StatTile
          value={formatCents(spentToday)}
          label="Spent today"
          hint={limit > 0 ? `of ${formatCents(limit)} autonomous limit` : undefined}
          tone="purple"
          icon="↗"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Transactions" subtitle="One money-out row per run, never two.">
          <ul className="m-0 grid list-none gap-2 p-0">
            {transactions.map((tx) => (
              <li
                key={tx.id}
                className="bg-inset-surface flex items-center gap-3 rounded-[14px] border border-[#1c2638] p-2.5"
              >
                <Pill variant={KIND_TONE[tx.kind] ?? "default"} size="sm">
                  {tx.kind}
                </Pill>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[12px] font-bold text-ink">
                    {tx.memo}
                  </b>
                  <small className="block text-[10.5px] text-muted">
                    {timeAgo(tx.created_at, now)}
                  </small>
                </span>
                <b
                  className={cn(
                    "shrink-0 text-[13px] font-extrabold tabular-nums",
                    tx.amount_cents >= 0 ? "text-green" : "text-ink",
                  )}
                >
                  {tx.amount_cents >= 0 ? "+" : ""}
                  {formatCents(tx.amount_cents)}
                </b>
              </li>
            ))}
            {transactions.length === 0 ? (
              <li className="text-[12px] text-muted">No transactions yet.</li>
            ) : null}
          </ul>
        </Panel>

        <div className="grid content-start gap-4">
          <Panel title="Add credits" subtitle="Demo top-up — nothing is charged.">
            <TopUpForm />
          </Panel>

          <Panel title="Spend policy" subtitle="Enforced on every hold.">
            <dl className="m-0 grid gap-0">
              <DataRow label="Approval threshold" value={formatCents(threshold)} />
              <DataRow label="Daily autonomous limit" value={formatCents(limit)} />
              <DataRow label="Spent today" value={formatCents(spentToday)} />
            </dl>
            {limit > 0 ? (
              <Progress
                value={usage}
                size="sm"
                tone={usage > 80 ? "red" : "green"}
                className="mt-3"
                label="Autonomous spend used today"
              />
            ) : null}
            <p className="m-0 mt-3 text-[11px] leading-relaxed text-muted">
              An order above {formatCents(threshold)} placed by an API key or an MCP
              client needs a human to approve it. You are always the human — spending
              through the site counts as approval.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
