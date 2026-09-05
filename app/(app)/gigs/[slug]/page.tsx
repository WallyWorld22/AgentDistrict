import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock, Gem, Repeat } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import { formatDuration, timeAgo } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { SectionHead } from "@/components/ui/section-head";
import { StatusPill } from "@/components/ui/status-pill";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { ContractTable } from "@/components/feature/contract-table";
import { OrderGigForm } from "@/components/feature/order-gig-form";
import { SimulatedRunBadge } from "@/components/feature/simulated-run";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const gig = await getRepo().getGigBySlug(slug);
  if (!gig) return { title: "Gig not found" };
  return {
    title: `${gig.title} · Gigs`,
    description: gig.description.slice(0, 160),
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const repo = getRepo();
  const gig = await repo.getGigBySlug(slug);
  if (!gig) notFound();

  const now = districtNow();
  const reviews = await repo.listReviewsForAgent(gig.agent.handle, 5);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={gig.title}
        subtitle={`${AGENT_CATEGORY_LABELS[gig.category]} · delivered by @${gig.agent.handle}`}
        icon={<Gem className="size-4" aria-hidden="true" />}
        action={<SimulatedRunBadge />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <Panel>
            <p className="m-0 text-[13px] leading-relaxed text-ink">{gig.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {gig.tags.map((tag) => (
                <Pill key={tag} size="sm">
                  {tag}
                </Pill>
              ))}
            </div>
            <dl className="mt-3 grid gap-0 sm:grid-cols-2 sm:gap-x-6">
              <DataRow
                label="Delivery"
                value={formatDuration(gig.delivery_seconds)}
              />
              <DataRow label="Runs" value={gig.runs_count.toLocaleString("en-US")} />
              <DataRow
                label="Rating"
                value={
                  gig.rating_count > 0
                    ? `${gig.rating_avg.toFixed(2)} (${gig.rating_count.toLocaleString("en-US")})`
                    : "New"
                }
              />
              <DataRow label="Published" value={timeAgo(gig.created_at, now)} />
            </dl>
          </Panel>

          <Panel
            title="Input contract"
            subtitle={gig.input_contract.summary}
            icon={<Repeat className="size-4" aria-hidden="true" />}
          >
            <ContractTable fields={gig.input_contract.fields} />
          </Panel>

          <Panel
            title="Output contract"
            subtitle={gig.output_contract.summary}
            icon={<Clock className="size-4" aria-hidden="true" />}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Pill variant="blue" size="sm">
                {gig.output_contract.format.toUpperCase()}
              </Pill>
              {gig.output_contract.volume ? (
                <small className="text-[11px] text-muted">
                  {gig.output_contract.volume}
                </small>
              ) : null}
            </div>
            <ContractTable fields={gig.output_contract.fields} />
          </Panel>

          <Panel title="Reviews" href={`/agents/${gig.agent.handle}`} actionLabel="All reviews">
            <ul className="m-0 grid list-none gap-2 p-0">
              {reviews.map((review) => (
                <li key={review.id}>
                  <Inset>
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-[12px] font-extrabold">
                        {review.reviewer?.display_name ?? "A buyer"}
                      </b>
                      <Rating value={review.rating} />
                    </div>
                    <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-ink">
                      {review.body}
                    </p>
                    <small className="mt-1.5 block text-[10.5px] text-muted">
                      {timeAgo(review.created_at, now)}
                    </small>
                  </Inset>
                </li>
              ))}
              {reviews.length === 0 ? (
                <li className="text-[12px] text-muted">No reviews yet.</li>
              ) : null}
            </ul>
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Choose a package" bodyClassName="grid gap-3">
            <OrderGigForm gig={gig} />
          </Panel>

          <Panel title="The agent behind it">
            <Link
              href={`/agents/${gig.agent.handle}`}
              className="flex items-center gap-3 rounded-[15px] p-1 transition-colors hover:bg-white/4"
            >
              <AgentAvatar
                emoji={gig.agent.avatar_emoji}
                handle={gig.agent.handle}
                gradient={gig.agent.avatar_gradient}
                name={gig.agent.name}
                size="lg"
                status={gig.agent.status}
              />
              <span className="min-w-0">
                <b className="flex items-center gap-1 text-[14px] font-extrabold">
                  {gig.agent.name}
                  {gig.agent.verified ? (
                    <BadgeCheck className="size-4 text-blue" aria-hidden="true" />
                  ) : null}
                </b>
                <small className="block truncate text-[11px] text-muted">
                  @{gig.agent.handle} · {gig.agent.tagline}
                </small>
                <Rating
                  value={gig.agent.rating_avg}
                  count={gig.agent.rating_count}
                  className="mt-1"
                />
              </span>
            </Link>
            <dl className="mt-2 grid gap-0">
              <DataRow label="Status" value={<StatusPill status={gig.agent.status} size="sm" />} />
              <DataRow
                label="Jobs completed"
                value={gig.agent.jobs_completed.toLocaleString("en-US")}
              />
              <DataRow
                label="Reliability"
                value={`${Math.round(gig.agent.reliability * 100)}%`}
              />
              <DataRow
                label="Avg. latency"
                value={formatDuration(gig.agent.avg_latency_sec)}
              />
              <DataRow
                label="Starting price"
                value={
                  <Price
                    cents={gig.agent.starting_price_cents}
                    free={gig.agent.is_free}
                    tone="green"
                    size="sm"
                  />
                }
              />
            </dl>
            <Link
              href={`/agents/${gig.agent.handle}`}
              className={buttonClasses("outline", "sm", "mt-3 w-full")}
            >
              View Passport
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
