import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileText, ListChecks, Package, Star } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { formatCents, formatDuration, timeAgo } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Rating } from "@/components/ui/rating";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { DeliverableViewer } from "@/components/feature/deliverable-viewer";
import { SimulatedRunBadge } from "@/components/feature/simulated-run";
import { DeliverableDownload } from "@/components/orders/deliverable-download";
import { OrderDecision } from "@/components/orders/order-decision";
import { OrderLiveProgress } from "@/components/orders/order-live-progress";
import { OrderStatusPill } from "@/components/orders/order-status";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { ReviewForm } from "@/components/orders/review-form";

type Params = Promise<{ id: string }>;

/**
 * Deliberately no `loading.tsx` above this page — a loading file wraps every
 * nested segment too, and the flushed shell fixes the status at `200` before
 * `notFound()` can set `404`. `/orders`'s own skeleton is scoped by the
 * `app/(app)/orders/(index)` route group.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const order = await getRepo().getOrder(id);
  if (!order) return { title: "Run not found" };
  return {
    title: `${order.agent.name} run · Orders`,
    description: order.brief.slice(0, 160),
  };
}

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const repo = getRepo();
  const order = await repo.getOrder(id);
  if (!order) notFound();

  const now = districtNow();
  const profile = await getCurrentProfile(repo);
  // A run carries the brief, the deliverable, the cost breakdown and the audit
  // log: it is readable by its two participants and nobody else. `/inbox/[thread]`
  // and `GET /api/v1/orders/:id` draw the same line; this page used to leave it
  // to the adapter, and the demo adapter does not filter.
  const isBuyer = profile?.id === order.buyer_id;
  const ownsAgent = profile?.id === order.agent.owner_id;
  if (!profile || (!isBuyer && !ownsAgent)) notFound();
  const title = order.gig?.title ?? order.job?.title ?? "Task run";

  const reviews = await repo.listReviewsForAgent(order.agent.handle, 50);
  const posted = reviews.find((review) => review.order_id === order.id) ?? null;
  // Reputation is only earned from someone else's money: an owner never rates
  // their own agent (the repository refuses it too).
  const canReview = isBuyer && !ownsAgent && order.status === "approved" && !posted;
  const refunded = order.status === "disputed" || order.status === "failed";

  return (
    <div className="grid gap-4">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="m-0 flex flex-wrap items-center gap-1 p-0 text-[11px] text-muted">
          <li className="flex items-center gap-1">
            <Link href="/orders" className="font-bold hover:text-blue">
              Orders
            </Link>
            <ChevronRight className="size-3 opacity-60" aria-hidden="true" />
          </li>
          <li className="min-w-0 truncate text-[#7d8aa2]" aria-current="page">
            {title}
          </li>
        </ol>
      </nav>

      <SectionHead
        as="h1"
        title={`${order.agent.name} · ${title}`}
        subtitle={`Ordered ${timeAgo(order.created_at, now)} · ${formatCents(order.amount_cents)}${
          order.package_tier ? ` · ${order.package_tier} package` : ""
        }`}
        icon={<Package className="size-4" aria-hidden="true" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SimulatedRunBadge />
            <OrderStatusPill status={order.status} />
          </div>
        }
      />

      {/* Three grid items so the approve/dispute rail sits directly under the
          run status on a phone, rather than below the whole audit log. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-1 grid min-w-0 gap-4 lg:col-start-1 lg:row-start-1">
          <Panel title="Progress" subtitle="Queued → Running → Delivered → Approved.">
            <OrderTimeline status={order.status} />
            <hr className="my-3.5 border-0 border-t border-[#1a2334]" />
            <OrderLiveProgress
              key={`${order.status}-${order.progress}`}
              orderId={order.id}
              status={order.status}
              progress={order.progress}
              etaSeconds={order.eta_seconds}
            />
            {order.delivered_at ? (
              <p className="m-0 mt-2 text-[11px] text-muted">
                Delivered {timeAgo(order.delivered_at, now)} · SLA{" "}
                {formatDuration(order.eta_seconds)}.
              </p>
            ) : null}
            {refunded ? (
              <p className="m-0 mt-2 text-[11.5px] font-bold text-yellow">
                {formatCents(order.amount_cents)} was returned to your wallet.
              </p>
            ) : null}
          </Panel>
        </div>

        <div className="order-3 grid min-w-0 gap-4 lg:col-start-1 lg:row-start-2">
          <Panel title="Brief" icon={<FileText className="size-4" aria-hidden="true" />}>
            <p className="m-0 text-[13px] leading-relaxed whitespace-pre-line text-ink">
              {order.brief}
            </p>
          </Panel>

          <Panel
            title="Deliverable"
            subtitle={
              order.output
                ? `${order.output.format.toUpperCase()} · generated from the gig's own output contract.`
                : undefined
            }
            action={
              order.output ? (
                <DeliverableDownload orderId={order.id} output={order.output} />
              ) : null
            }
          >
            {order.output ? (
              <DeliverableViewer output={order.output} />
            ) : (
              <p className="m-0 text-[12px] text-muted">
                Nothing delivered yet. The structured output appears here the moment
                the run completes — this page updates itself while the run is in
                flight.
              </p>
            )}
          </Panel>

          <Panel
            title="Timeline"
            subtitle="The audit log — every step, including the ones a machine took."
            icon={<ListChecks className="size-4" aria-hidden="true" />}
          >
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

        <div className="order-2 grid content-start gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {isBuyer ? (
            <Panel title="Your call">
              <OrderDecision
                orderId={order.id}
                status={order.status}
                amountCents={order.amount_cents}
              />
            </Panel>
          ) : null}

          {canReview ? (
            <Panel
              title="Rate this run"
              subtitle="Ratings come from approved runs only."
              icon={<Star className="size-4" aria-hidden="true" />}
            >
              <ReviewForm orderId={order.id} agentName={order.agent.name} />
            </Panel>
          ) : null}

          {posted ? (
            <Panel title="Your review" icon={<Star className="size-4" aria-hidden="true" />}>
              <Inset>
                <Rating value={posted.rating} showStars />
                <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-ink">
                  {posted.body}
                </p>
                <small className="mt-1.5 block text-[10.5px] text-muted">
                  Posted {timeAgo(posted.created_at, now)} · visible on{" "}
                  <Link
                    href={`/agents/${order.agent.handle}`}
                    className="text-blue hover:underline"
                  >
                    the Passport
                  </Link>
                </small>
              </Inset>
            </Panel>
          ) : null}

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
            <div className="mt-3 grid gap-2">
              {order.gig ? (
                <>
                  <Link
                    href={`/gigs/${order.gig.slug}`}
                    className={buttonClasses("primary", "sm", "w-full")}
                  >
                    Hire again
                  </Link>
                  <Link
                    href={`/gigs/${order.gig.slug}`}
                    className={buttonClasses("ghost", "sm", "w-full")}
                  >
                    Back to gig
                  </Link>
                </>
              ) : order.job ? (
                <>
                  <Link
                    href={`/agents/${order.agent.handle}`}
                    className={buttonClasses("primary", "sm", "w-full")}
                  >
                    Hire again
                  </Link>
                  <Link
                    href={`/jobs/${order.job.id}`}
                    className={buttonClasses("ghost", "sm", "w-full")}
                  >
                    Back to bounty
                  </Link>
                </>
              ) : (
                <Link
                  href={`/agents/${order.agent.handle}`}
                  className={buttonClasses("primary", "sm", "w-full")}
                >
                  Hire again
                </Link>
              )}
            </div>
          </Panel>

          <Panel title="Cost">
            <dl className="m-0 grid gap-0">
              <DataRow label="Total" value={formatCents(order.amount_cents)} />
              {order.cost_breakdown ? (
                <>
                  {/* The released 90% is the payout; tools come out of it, so
                      the agent's net is the last line rather than the first. */}
                  <DataRow
                    label="Agent payout (90%)"
                    value={formatCents(
                      order.amount_cents - order.cost_breakdown.district_fee_cents,
                    )}
                  />
                  <DataRow
                    label="District fee (10%)"
                    value={formatCents(order.cost_breakdown.district_fee_cents)}
                  />
                  <DataRow
                    label="Tools (from the payout)"
                    value={formatCents(order.cost_breakdown.tools_cents)}
                  />
                  <DataRow
                    label="Agent net"
                    value={formatCents(order.cost_breakdown.agent_cents)}
                  />
                </>
              ) : (
                <DataRow
                  label="Status"
                  value={
                    refunded ? (
                      <Pill variant="yellow" size="sm">
                        REFUNDED
                      </Pill>
                    ) : (
                      "Held until you approve"
                    )
                  }
                />
              )}
              {order.package_tier ? (
                <DataRow
                  label="Package"
                  value={<span className="capitalize">{order.package_tier}</span>}
                />
              ) : null}
            </dl>
            <Link href="/wallet" className={buttonClasses("ghost", "sm", "mt-3 w-full")}>
              Open wallet
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
