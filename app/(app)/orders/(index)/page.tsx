import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, Package } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { formatCents } from "@/lib/utils";
import {
  ORDER_FILTERS,
  bucketOrders,
  matchesOrderFilter,
  type OrderFilterValue,
} from "@/lib/data/ext/gigs";
import { StatTile } from "@/components/cards/stat-tile";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { Tabs } from "@/components/ui/tabs";
import { Panel } from "@/components/feature/panel";
import { OrderRow } from "@/components/orders/order-row";
import { chipHref, oneOf, readQuery } from "@/lib/query";

export const metadata: Metadata = {
  title: "Orders",
  description:
    "Every gig you bought and every bounty you awarded — live progress, held funds and approvals.",
};

export const dynamic = "force-dynamic";

const FILTER_VALUES = ORDER_FILTERS.map((filter) => filter.value);

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const repo = getRepo();
  const profile = await requireProfile(repo);
  const now = districtNow();

  const query = await searchParams;
  const status = (oneOf(readQuery(query, "status"), FILTER_VALUES) ??
    "all") as OrderFilterValue;

  const [orders, wallet] = await Promise.all([
    repo.listOrders({ buyerId: profile.id, limit: 100 }),
    repo.getWallet(profile.id),
  ]);
  const { awaiting, active, counts } = bucketOrders(orders);
  const visible = orders.filter((order) => matchesOrderFilter(order, status));

  // The wallet is the source of truth for held funds; the ledger is a log.
  const held = wallet?.held_cents ?? 0;
  const released = orders
    .filter((order) => order.status === "approved")
    .reduce((sum, order) => sum + order.amount_cents, 0);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Your orders"
        subtitle="Every gig you bought and every bounty you awarded — live progress, held funds and approvals."
        icon={<Package className="size-4" aria-hidden="true" />}
        action={
          <Link href="/gigs" className={buttonClasses("primary", "sm")}>
            Hire another gig
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={active.length} label="In flight" tone="blue" icon="⚡" />
        <StatTile
          value={awaiting.length}
          label="Needs your approval"
          hint={awaiting.length > 0 ? "Money is still held" : "Nothing pending"}
          tone="yellow"
          icon="⏳"
          href={awaiting.length > 0 ? "/orders?status=delivered" : undefined}
        />
        <StatTile value={formatCents(held)} label="Held" tone="purple" icon="⏸" />
        <StatTile value={formatCents(released)} label="Released" tone="green" icon="✓" />
      </div>

      {awaiting.length > 0 ? (
        <Panel
          title="Needs your approval"
          subtitle="Delivered runs are holding your credits until you approve or dispute them."
          icon={<BellRing className="size-4" aria-hidden="true" />}
        >
          <ul className="m-0 grid list-none gap-2 p-0">
            {awaiting.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} now={now} highlight />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Tabs
        label="Filter runs by status"
        value={status}
        items={ORDER_FILTERS.map((filter) => ({
          value: filter.value,
          label: filter.label,
          count: counts[filter.value],
          href: chipHref("/orders", {}, {
            status: filter.value === "all" ? undefined : filter.value,
          }),
        }))}
      />

      <Panel
        title={
          status === "all"
            ? "All runs"
            : `${ORDER_FILTERS.find((filter) => filter.value === status)?.label} runs`
        }
        subtitle={`${visible.length} ${visible.length === 1 ? "run" : "runs"} · progress advances deterministically from each run's start time.`}
      >
        {visible.length === 0 ? (
          <EmptyState
            icon={<Package className="size-5" aria-hidden="true" />}
            title={status === "all" ? "No runs yet" : "Nothing in this state"}
            description={
              status === "all"
                ? "Buy a gig or award a bounty and the run shows up here with live progress."
                : "Try another status chip — your other runs are still listed under All."
            }
            action={
              <Link href="/gigs" className={buttonClasses("primary", "sm")}>
                Browse gigs
              </Link>
            }
          />
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0" data-testid="orders-list">
            {visible.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} now={now} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
