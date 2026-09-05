import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ScrollText } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { formatCents, timeAgo } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { PolicyToggles } from "@/components/feature/policy-toggles";

export const metadata: Metadata = {
  title: "Workplace Gateway",
  description: "Policies, approvals and enterprise agent access.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const repo = getRepo();
  const profile = await requireProfile(repo);
  const now = districtNow();

  const [wallet, orders] = await Promise.all([
    repo.getWallet(profile.id),
    repo.listOrders({ buyerId: profile.id, limit: 6 }),
  ]);

  const auditRows = orders
    .flatMap((order) =>
      order.audit_log.map((entry) => ({
        ...entry,
        orderId: order.id,
        agent: order.agent.name,
      })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Workplace Gateway"
        subtitle="Policies, approvals and enterprise agent access."
        icon={<Building2 className="size-4" aria-hidden="true" />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4">
          <Panel
            title="Policies"
            subtitle="Applied to every agent that touches your data."
          >
            <PolicyToggles />
          </Panel>

          <Panel
            title="Audit log"
            subtitle="Every step of every run, written as it happens."
            icon={<ScrollText className="size-4" aria-hidden="true" />}
          >
            <ul className="m-0 grid list-none gap-2 p-0">
              {auditRows.map((entry, index) => (
                <li key={`${entry.orderId}-${index}`}>
                  <Inset>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <b className="font-mono text-[11.5px] font-extrabold text-cyan">
                        {entry.event}
                      </b>
                      <small className="text-[10.5px] text-muted">
                        {entry.actor} · {timeAgo(entry.at, now)}
                      </small>
                    </div>
                    <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-ink">
                      {entry.detail ?? entry.agent}
                    </p>
                    <Link
                      href={`/orders/${entry.orderId}`}
                      className="mt-1 inline-block text-[10.5px] font-extrabold text-blue"
                    >
                      View run →
                    </Link>
                  </Inset>
                </li>
              ))}
              {auditRows.length === 0 ? (
                <li className="text-[12px] text-muted">
                  Nothing has run yet, so there is nothing to audit.
                </li>
              ) : null}
            </ul>
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Spend limits" subtitle="Enforced server-side on every hold.">
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
                label="Spent today"
                value={formatCents(wallet?.spend_today_cents ?? 0)}
              />
              <DataRow label="Held" value={formatCents(wallet?.held_cents ?? 0)} />
            </dl>
            <p className="m-0 mt-3 text-[11px] leading-relaxed text-muted">
              An order above the threshold placed by an API key or an MCP client is
              refused with <code className="font-mono">approval required</code>. Orders
              you place through the site are approved by the act of placing them.
            </p>
            <Link href="/wallet" className={buttonClasses("ghost", "sm", "mt-3 w-full")}>
              Open wallet
            </Link>
          </Panel>

          <Panel title="How the gateway is enforced">
            <p className="m-0 text-[11.5px] leading-relaxed text-ink">
              The policy lives on the wallet row, not in the browser. Both the demo
              adapter and Postgres check it inside the same transaction that places
              the hold, so an agent cannot spend past it by calling the API directly.
            </p>
            <CodeBlock
              className="mt-3"
              label="hold_funds()"
              code={`if amount > approval_threshold_cents and not approved:
  raise "approval required"
if spend_today + amount > autonomous_spend_limit_cents:
  raise "daily autonomous spend limit reached"`}
              copyable={false}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
