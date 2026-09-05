import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  ChevronRight,
  Clock,
  Download,
  Gem,
  Repeat,
  Star,
} from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import { moreFromAgent } from "@/lib/data/ext/gigs";
import { formatDuration, timeAgo } from "@/lib/utils";
import { GigCard } from "@/components/cards";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { SectionHead } from "@/components/ui/section-head";
import { StatusPill } from "@/components/ui/status-pill";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { ContractTable } from "@/components/feature/contract-table";
import { SimulatedRunBadge } from "@/components/feature/simulated-run";
import { GigMachineBlock } from "@/components/gigs/machine-block";
import { PackageSelector } from "@/components/gigs/package-selector";
import { readQuery } from "@/lib/query";

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * Deliberately no `loading.tsx` anywhere above this page.
 *
 * A loading file is the Suspense fallback for its segment *and every segment
 * below it*, and once Next flushes that shell the response status is already
 * `200` — `notFound()` can no longer set `404`. The browse page's skeleton is
 * therefore scoped by the `app/(app)/gigs/(index)` route group; see the note
 * there. Verified both ways against a production build.
 */
export const dynamic = "force-dynamic";

const REVIEW_PREVIEW = 3;
const REVIEW_ALL = 24;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const gig = await getRepo().getGigBySlug(slug);
  if (!gig) return { title: "Gig not found" };
  return {
    title: `${gig.title} · Gigs`,
    description: gig.description.slice(0, 160),
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug } = await params;
  const repo = getRepo();
  const gig = await repo.getGigBySlug(slug);
  if (!gig) notFound();

  const query = await searchParams;
  const showAllReviews = readQuery(query, "reviews") === "all";
  const now = districtNow();

  const [reviews, siblings, profile] = await Promise.all([
    repo.listReviewsForAgent(gig.agent.handle, showAllReviews ? REVIEW_ALL : REVIEW_PREVIEW),
    moreFromAgent(repo, gig.agent.handle, gig.slug, 3),
    getCurrentProfile(repo),
  ]);
  const wallet = profile ? await repo.getWallet(profile.id) : null;
  const available = wallet ? wallet.balance_cents - wallet.held_cents : undefined;

  const firstField = gig.input_contract.fields[0];
  const briefPlaceholder = firstField?.example
    ? `e.g. ${firstField.name}: ${firstField.example}`
    : undefined;

  return (
    <div className="grid gap-4">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="m-0 flex flex-wrap items-center gap-1 p-0 text-[11px] text-muted">
          <li className="flex items-center gap-1">
            <Link href="/gigs" className="font-bold hover:text-blue">
              Gigs
            </Link>
            <ChevronRight className="size-3 opacity-60" aria-hidden="true" />
          </li>
          <li className="flex items-center gap-1">
            <Link
              href={`/gigs?category=${gig.category}`}
              className="font-bold hover:text-blue"
            >
              {AGENT_CATEGORY_LABELS[gig.category]}
            </Link>
            <ChevronRight className="size-3 opacity-60" aria-hidden="true" />
          </li>
          <li className="min-w-0 truncate text-[#7d8aa2]" aria-current="page">
            {gig.title}
          </li>
        </ol>
      </nav>

      <SectionHead
        as="h1"
        title={gig.title}
        subtitle={`${AGENT_CATEGORY_LABELS[gig.category]} · delivered by @${gig.agent.handle}`}
        icon={<Gem className="size-4" aria-hidden="true" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {gig.status === "paused" ? <Pill variant="yellow">PAUSED</Pill> : null}
            <SimulatedRunBadge />
          </div>
        }
      />

      {/* Three grid items, not two columns: on a phone the buy box sits right
          under the overview instead of below every contract table, and on
          desktop it occupies the whole right column so the sticky wrapper
          inside it has room to travel. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-1 grid min-w-0 gap-4 lg:col-start-1 lg:row-start-1">
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
              <DataRow label="Delivery" value={formatDuration(gig.delivery_seconds)} />
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
        </div>

        <div className="order-3 grid min-w-0 gap-4 lg:col-start-1 lg:row-start-2">
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
            icon={<Download className="size-4" aria-hidden="true" />}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Pill variant="blue" size="sm">
                {gig.output_contract.format.toUpperCase()}
              </Pill>
              {gig.output_contract.volume ? (
                <small className="text-[11px] text-muted">{gig.output_contract.volume}</small>
              ) : null}
            </div>
            <ContractTable fields={gig.output_contract.fields} />
          </Panel>

          <GigMachineBlock gig={gig} />

          <div id="reviews" className="scroll-mt-20">
            <Panel
              title={`Reviews for ${gig.agent.name}`}
              subtitle={
                gig.agent.rating_count > 0 ? (
                  <>
                    ★ {gig.agent.rating_avg.toFixed(2)} from{" "}
                    <span data-testid="agent-rating-count">
                      {gig.agent.rating_count.toLocaleString("en-US")}
                    </span>{" "}
                    verified runs
                  </>
                ) : (
                  "No verified runs yet."
                )
              }
              icon={<Star className="size-4" aria-hidden="true" />}
              action={
                showAllReviews ? (
                  <Link
                    href={`/gigs/${gig.slug}#reviews`}
                    className={buttonClasses("ghost", "sm")}
                  >
                    Show fewer
                  </Link>
                ) : (
                  <Link
                    href={`/gigs/${gig.slug}?reviews=all#reviews`}
                    className={buttonClasses("ghost", "sm")}
                  >
                    All reviews
                  </Link>
                )
              }
            >
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
                  <li className="text-[12px] text-muted">
                    No reviews yet — be the first to hire this gig.
                  </li>
                ) : null}
              </ul>
            </Panel>
          </div>

          {siblings.length > 0 ? (
            <Panel
              title={`More from ${gig.agent.name}`}
              subtitle="Other packaged outcomes this Passport delivers."
              href={`/agents/${gig.agent.handle}`}
              actionLabel="Passport"
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {siblings.map((sibling) => (
                  <GigCard key={sibling.id} gig={sibling} variant="compact" />
                ))}
              </div>
            </Panel>
          ) : null}
        </div>

        {/* The rail sticks as one unit. A per-card `sticky` would be painted
            over by the card below it, and a grid item's sticky containing
            block is its own row, so it would not travel at all. */}
        <div className="order-2 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="flex flex-col gap-4 lg:sticky lg:top-[76px]">
            <Panel title="Choose a package" bodyClassName="grid gap-3">
              <PackageSelector
                gigSlug={gig.slug}
                packages={gig.packages}
                inputSummary={gig.input_contract.summary}
                briefPlaceholder={briefPlaceholder}
                availableCents={available}
              />
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
                <DataRow label="Reliability" value={`${Math.round(gig.agent.reliability * 100)}%`} />
                <DataRow
                  label="Avg. latency"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3 text-muted" aria-hidden="true" />
                      {formatDuration(gig.agent.avg_latency_sec)}
                    </span>
                  }
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
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Link
                  href={`/agents/${gig.agent.handle}`}
                  className={buttonClasses("outline", "sm", "w-full")}
                >
                  View Passport
                </Link>
                <Link
                  href={`/agents/${gig.agent.handle}#message`}
                  className={buttonClasses("ghost", "sm", "w-full")}
                >
                  Message
                </Link>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
