import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { requireProfileOrLogin } from "@/lib/auth";
import { walletSummary } from "@/lib/data/ext/economy";
import { formatCents } from "@/lib/utils";
import { StatTile } from "@/components/cards/stat-tile";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { AddCreditsButton } from "@/components/wallet/add-credits";
import { SpendPolicyForm } from "@/components/wallet/spend-policy";
import { TransactionsTable } from "@/components/wallet/transactions-table";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Balance, holds, spend today, approval thresholds and transactions.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const repo = getRepo();
  const profile = await requireProfileOrLogin("/wallet", repo);
  const now = districtNow();

  const [wallet, transactions] = await Promise.all([
    repo.getWallet(profile.id),
    repo.listTransactions(profile.id, 30),
  ]);

  const money = walletSummary(wallet);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District Wallet"
        subtitle="Balance, holds, spend today, approval thresholds and every transaction behind them."
        icon={<Wallet className="size-4" aria-hidden="true" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Pill variant="green">Demo only — no real money movement</Pill>
            <AddCreditsButton availableCents={money.available} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          value={formatCents(money.available)}
          label="Available"
          hint="Balance minus what is held"
          tone="green"
          icon="$"
        />
        <StatTile
          value={formatCents(money.held)}
          label="Held in flight"
          hint="Released when you approve a run"
          tone="yellow"
          icon="⏸"
        />
        <StatTile
          value={formatCents(money.spentToday)}
          label="Spent today"
          hint={
            money.dailyLimit > 0
              ? `of ${formatCents(money.dailyLimit)} autonomous ceiling`
              : undefined
          }
          tone="purple"
          icon="↗"
        />
        <StatTile
          value={formatCents(money.threshold)}
          label="Approval threshold"
          hint="Per unattended order"
          tone="blue"
          icon="⚑"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title="Transactions"
          subtitle="One money-out row per run, never two — a hold becomes a release."
        >
          <TransactionsTable transactions={transactions} now={now} />
        </Panel>

        <div className="grid content-start gap-4">
          <Panel title="Balance" subtitle="Where the money is right now.">
            <dl className="m-0 grid gap-0">
              <DataRow label="Balance" value={formatCents(money.balance)} />
              <DataRow label="Held in flight" value={`−${formatCents(money.held)}`} />
              <DataRow
                label="Available"
                value={<span className="text-green">{formatCents(money.available)}</span>}
              />
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <AddCreditsButton availableCents={money.available} variant="outline" />
              <Link href="/command" className={buttonClasses("ghost", "sm")}>
                See what is running
              </Link>
              <Link href="/orders" className={buttonClasses("ghost", "sm")}>
                All runs
              </Link>
            </div>
          </Panel>

          <Panel title="Spend policy" subtitle="Enforced server-side on every hold.">
            <dl className="m-0 grid gap-0">
              <DataRow label="Spent today" value={formatCents(money.spentToday)} />
              <DataRow label="Remaining today" value={formatCents(money.dailyRemaining)} />
            </dl>

            <SpendPolicyForm
              thresholdCents={money.threshold}
              dailyLimitCents={money.dailyLimit}
              className="mt-3 border-t border-[#1c2638] pt-3"
            />

            {money.dailyLimit > 0 ? (
              <Progress
                value={money.dailyUsedPct}
                size="sm"
                tone={money.dailyUsedPct > 80 ? "red" : "green"}
                className="mt-3"
                label="Autonomous spend used today"
              />
            ) : null}

            <Inset className="mt-3">
              <p className="m-0 text-[11px] leading-relaxed text-muted">
                An order above {formatCents(money.threshold)} placed by an API key or an
                MCP client is refused until a human approves it. Orders you place through
                the site are approved by the act of placing them, so the ceiling never
                blocks you here.
              </p>
            </Inset>
            <Link href="/workplace" className={buttonClasses("ghost", "sm", "mt-3 w-full")}>
              Open the Workplace Gateway
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
