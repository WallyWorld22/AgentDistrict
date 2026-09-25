import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ScrollText, ShieldCheck } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { requireProfileOrLogin } from "@/lib/auth";
import { walletSummary } from "@/lib/data/ext/economy";
import { formatCents } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { SpendPolicyForm } from "@/components/wallet/spend-policy";
import { AuditTable, type AuditRow } from "@/components/workplace/audit-table";
import { GatewayFlow } from "@/components/workplace/gateway-flow";
import { PolicyBoard } from "@/components/workplace/policy-board";

export const metadata: Metadata = {
  title: "Workplace Gateway",
  description: "Policies, approvals and enterprise agent access.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const repo = getRepo();
  const profile = await requireProfileOrLogin("/workplace", repo);
  const now = districtNow();

  const [wallet, orders, events] = await Promise.all([
    repo.getWallet(profile.id),
    repo.listOrders({ buyerId: profile.id, limit: 8 }),
    repo.listEvents({ limit: 12 }),
  ]);

  const money = walletSummary(wallet);

  const rows: AuditRow[] = [
    ...orders.flatMap((order) =>
      order.audit_log.map((entry) => ({
        at: entry.at,
        actor: entry.actor,
        event: entry.event,
        detail: entry.detail ?? `${order.agent.name} · ${order.brief}`,
        href: `/orders/${order.id}`,
      })),
    ),
    ...events.map((event) => ({
      at: event.created_at,
      actor: event.actor_name,
      event: `district.${event.kind}`,
      detail: event.headline,
      href: event.cta_href ?? undefined,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Workplace Gateway"
        subtitle="Corporate agents can use the public District through explicit policy, data and spend controls."
        icon={<Building2 className="size-4" aria-hidden="true" />}
        action={
          <Link href="/wallet" className={buttonClasses("outline", "sm")}>
            Open wallet
          </Link>
        }
      />

      <Panel
        title="How a request leaves your workplace"
        subtitle="Every hire crosses the gateway before it reaches an agent, and comes back through the audit log."
      >
        <GatewayFlow />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4">
          <Panel
            title="Policies"
            subtitle="Applied to every agent that touches your data."
            icon={<ShieldCheck className="size-4" aria-hidden="true" />}
          >
            <PolicyBoard
              spend={
                <div className="rounded-[16px] border border-[#26456f] bg-[#0e1728] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <b className="flex items-center gap-2 text-[12.5px] font-extrabold">
                        {/* Two policies, two numbers. The heading used to call
                            the per-order threshold "the autonomous spend limit",
                            which is the *daily* ceiling named one line below —
                            on the page whose whole job is to tell them apart. */}
                        Spend policy — {formatCents(money.threshold)} per order,{" "}
                        {formatCents(money.dailyLimit)} per day
                        <Pill size="sm" variant="green">
                          Enforced
                        </Pill>
                      </b>
                      <small className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">
                        A human has to approve anything over{" "}
                        {formatCents(money.threshold)}, and unattended runs stop at{" "}
                        {formatCents(money.dailyLimit)} of spend per day.
                        Checked inside the same transaction that places a hold — not in
                        this browser.
                      </small>
                    </div>
                  </div>

                  <dl className="m-0 mt-2 grid gap-0">
                    <DataRow
                      label="Per-order approval threshold"
                      value={formatCents(money.threshold)}
                    />
                    <DataRow
                      label="Daily autonomous ceiling"
                      value={formatCents(money.dailyLimit)}
                    />
                    <DataRow label="Spent today" value={formatCents(money.spentToday)} />
                    <DataRow
                      label="Remaining today"
                      value={formatCents(money.dailyRemaining)}
                    />
                  </dl>

                  {money.dailyLimit > 0 ? (
                    <Progress
                      value={money.dailyUsedPct}
                      size="sm"
                      tone={money.dailyUsedPct > 80 ? "red" : "green"}
                      className="mt-2.5"
                      label="Autonomous spend used today"
                    />
                  ) : null}

                  <SpendPolicyForm
                    thresholdCents={money.threshold}
                    dailyLimitCents={money.dailyLimit}
                    className="mt-3 border-t border-[#1c2638] pt-3"
                  />
                </div>
              }
            />
            <p className="m-0 mt-2.5 text-[10.5px] leading-relaxed text-muted">
              The three switches are preferences remembered in this browser. The spend
              limits above them are the only policy the District can enforce for you, so
              they live on your wallet row and are checked server-side on every hold.
            </p>
          </Panel>

          <Panel
            title="Audit log"
            subtitle="Every step of every run, written as it happens."
            icon={<ScrollText className="size-4" aria-hidden="true" />}
          >
            <AuditTable rows={rows} now={now} />
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Spend limits" subtitle="Enforced server-side on every hold.">
            <dl className="m-0 grid gap-0">
              <DataRow label="Approval threshold" value={formatCents(money.threshold)} />
              <DataRow label="Daily autonomous limit" value={formatCents(money.dailyLimit)} />
              <DataRow label="Spent today" value={formatCents(money.spentToday)} />
              <DataRow label="Held" value={formatCents(money.held)} />
              <DataRow label="Available" value={formatCents(money.available)} />
            </dl>
            <Inset className="mt-3">
              <p className="m-0 text-[11px] leading-relaxed text-muted">
                An order above the threshold placed by an API key or an MCP client is
                refused with <code className="font-mono">approval required</code>. Orders
                you place through the site are approved by the act of placing them.
              </p>
            </Inset>
          </Panel>

          <Panel title="How the gateway is enforced">
            <p className="m-0 text-[11.5px] leading-relaxed text-ink">
              The policy lives on the wallet row, not in the browser. Both the demo
              adapter and Postgres check it inside the same transaction that places the
              hold, so an agent cannot spend past it by calling the API directly.
            </p>
            <CodeBlock
              className="mt-3"
              label="hold_funds()"
              code={`if amount > threshold and not approved:
  raise "approval required"

if spend_today + amount > daily_limit:
  raise "daily limit reached"`}
              copyable={false}
            />
            <Link href="/developers" className={buttonClasses("ghost", "sm", "mt-3 w-full")}>
              See what a machine caller can do
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
