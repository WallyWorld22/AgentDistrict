import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Cpu,
  Gem,
  Globe2,
  IdCard,
  Landmark,
  MessagesSquare,
  Sparkles,
  Users,
} from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import {
  bestGig,
  buildAgentCard,
  priceUnit,
  readPassportCurl,
  requestOrigin,
  resolvedEndpoints,
} from "@/lib/data/ext/agents";
import {
  FOUNDING_CAST_LABEL,
  FOUNDING_CAST_NOTE,
  isFoundingCast,
} from "@/lib/data/ext/cast";
import { SITE_NAME } from "@/lib/site";
import {
  agentBreadcrumbTrail,
  agentProfileSchema,
  breadcrumbSchema,
  endSentence,
} from "@/lib/seo/schema";
import { formatCents, formatDuration, timeAgo } from "@/lib/utils";
import { JsonLd } from "@/components/seo/json-ld";
import { AgentCard, GigCard } from "@/components/cards";
import { StatTile } from "@/components/cards/stat-tile";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { StatusPill } from "@/components/ui/status-pill";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { MessageAgentForm } from "@/components/feature/message-agent-form";
import { AgentStatusControl } from "@/components/agents/agent-status-control";
import { PassportJson } from "@/components/agents/passport-json";

type Params = Promise<{ handle: string }>;
type Query = Promise<Record<string, string | string[] | undefined>>;

/** Reviews shown before "All reviews" is expanded. */
const REVIEW_PREVIEW = 4;
const REVIEW_ALL = 40;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { handle } = await params;
  const agent = await getRepo().getAgentByHandle(handle);
  if (!agent) return { title: "Agent not found" };

  // The tagline is the sentence the creator wrote; the rest is what a searcher
  // (or a model asked "who does X") needs to decide — category, price and
  // whether anybody has rated it. Never padded with keywords the page cannot
  // back up — and never quoting the founding cast's seeded rating as fact: the
  // Passport shows that number beside its "track record simulated" pill, and a
  // search snippet has no room for the pill.
  const price = agent.is_free ? "Free" : `From ${formatCents(agent.starting_price_cents)}`;
  const rating =
    agent.rating_count > 0 && !isFoundingCast(agent.handle)
      ? `Rated ${agent.rating_avg.toFixed(2)}/5 across ${agent.rating_count.toLocaleString("en-US")} ratings. `
      : "";
  const description = `${endSentence(agent.tagline)} ${rating}${AGENT_CATEGORY_LABELS[agent.category]} agent on AgentDistrict. ${price}. Hire it over the web, MCP or REST.`;

  return {
    title: `${agent.name} · Agent Passport`,
    description,
    alternates: {
      canonical: `/agents/${agent.handle}`,
      types: {
        "application/json": [
          { url: `/agents/${agent.handle}/agent-card.json`, title: `${agent.name} agent card` },
        ],
      },
    },
    openGraph: {
      type: "profile",
      url: `/agents/${agent.handle}`,
      title: `${agent.name} (@${agent.handle}) · Agent Passport`,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${agent.name} (@${agent.handle}) · Agent Passport`,
      description,
    },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Query;
}) {
  const { handle } = await params;
  const query = await searchParams;
  const showAllReviews = query.reviews === "all";

  const repo = getRepo();
  const agent = await repo.getAgentByHandle(handle);
  if (!agent) notFound();

  const now = districtNow();
  const [gigs, reviews, collaborators, profile, requestHeaders] = await Promise.all([
    repo.listGigs({ agentHandle: agent.handle, limit: 12 }),
    repo.listReviewsForAgent(agent.handle, showAllReviews ? REVIEW_ALL : REVIEW_PREVIEW),
    repo.listCollaborators(agent.handle, 4),
    getCurrentProfile(repo),
    headers(),
  ]);

  const origin = requestOrigin(requestHeaders);
  const cardHref = `/agents/${agent.handle}/agent-card.json`;
  const cardUrl = `${origin}${cardHref}`;
  const agentCard = buildAgentCard(agent, gigs, origin, { organization: SITE_NAME });
  const featured = bestGig(gigs);
  const endpoints = resolvedEndpoints(agent.endpoints, origin);
  const owned = profile?.id === agent.owner_id;
  // `agentHandle` is the semantic filter `GigFilter` names; /gigs reads it.
  const gigsHref = `/gigs?agentHandle=${encodeURIComponent(agent.handle)}`;

  return (
    <div className="grid gap-4">
      {/* The passport as a ProfilePage over a hireable Service, with the
          agent's rating only when it was earned (never the founding cast's
          simulated one) — the visible breadcrumb below, restated for a
          machine. */}
      <JsonLd
        data={[
          agentProfileSchema(agent, origin),
          breadcrumbSchema(origin, agentBreadcrumbTrail(agent)),
        ]}
      />

      <nav aria-label="Breadcrumb" className="text-[11.5px] text-muted">
        <Link href="/agents" className="font-bold hover:text-text">
          Agent Passports
        </Link>
        <span aria-hidden="true"> / </span>
        <Link
          href={`/agents?category=${agent.category}`}
          className="font-bold text-blue hover:text-cyan"
        >
          {AGENT_CATEGORY_LABELS[agent.category]}
        </Link>
      </nav>

      <section className="bg-card-surface relative overflow-hidden rounded-card border border-line p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ backgroundImage: agent.avatar_gradient, filter: "blur(72px)" }}
        />
        <div className="relative flex flex-wrap items-start gap-4">
          <AgentAvatar
            emoji={agent.avatar_emoji}
            handle={agent.handle}
            gradient={agent.avatar_gradient}
            name={agent.name}
            size="xl"
            status={agent.status}
          />
          {/* See the note on /profile: `min-w-*` is dead app-wide, so the
              wrap floor is a flex basis. */}
          <div className="min-w-0 shrink-0 grow basis-[260px]">
            {/* The pill and the badge are siblings, not children: inside the
                <h1> the page's accessible name became "ScoutAVAILABLE" and
                changed every time the agent's presence did. */}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-[24px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[28px]">
                {agent.name}
              </h1>
              {agent.verified ? (
                <BadgeCheck
                  className="size-5 text-blue"
                  role="img"
                  aria-label="Verified agent"
                />
              ) : null}
              <StatusPill status={agent.status} />
              {/* House agent, not a registrant. Its reputation numbers were
                  written with the District rather than earned in it, and the
                  Passport is the one page that has to say so. */}
              {isFoundingCast(agent.handle) ? (
                <Pill
                  size="sm"
                  title={FOUNDING_CAST_NOTE}
                  data-testid="founding-cast"
                >
                  <Landmark className="size-3" aria-hidden="true" />
                  {FOUNDING_CAST_LABEL}
                  <span className="sr-only"> — {FOUNDING_CAST_NOTE}</span>
                </Pill>
              ) : null}
            </div>
            <p className="m-0 mt-1 text-[13px] text-ink">{agent.tagline}</p>
            <p className="m-0 mt-1 text-[11.5px] text-muted">
              @{agent.handle} · {AGENT_CATEGORY_LABELS[agent.category]} · joined{" "}
              {timeAgo(agent.created_at, now)}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <Rating value={agent.rating_avg} count={agent.rating_count} size="lg" />
              <Price
                cents={agent.starting_price_cents}
                free={agent.is_free}
                from={agent.pricing_model === "from"}
                unit={priceUnit(agent.pricing_model)}
                tone="green"
                size="lg"
              />
            </div>
            <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-1.5 p-0">
              {agent.regions.map((region) => (
                <li key={region}>
                  <Pill variant="cyan" size="sm">
                    <Globe2 className="size-3" aria-hidden="true" />
                    {region}
                  </Pill>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {featured ? (
              <Link
                href={`/gigs/${featured.slug}`}
                data-testid="hire-agent"
                className={buttonClasses("primary", "md")}
              >
                Hire {agent.name}
              </Link>
            ) : (
              <Link
                href={`/jobs/new?category=${agent.category}`}
                data-testid="hire-agent"
                className={buttonClasses("primary", "md")}
              >
                Post a bounty
              </Link>
            )}
            <Link href="#message" className={buttonClasses("outline", "md")}>
              <MessagesSquare className="size-3.5" aria-hidden="true" />
              Message
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          value={agent.rating_avg.toFixed(2)}
          label="Rating"
          hint={`${agent.rating_count.toLocaleString("en-US")} reviews`}
          tone="yellow"
          icon="★"
        />
        <StatTile
          value={agent.jobs_completed.toLocaleString("en-US")}
          label="Jobs completed"
          hint={`${Math.round(agent.repeat_hire_rate * 100)}% repeat hires`}
          tone="green"
          icon="✓"
        />
        <StatTile
          value={`${Math.round(agent.reliability * 100)}%`}
          label="Reliability"
          hint={`${(agent.dispute_rate * 100).toFixed(1)}% disputed`}
          tone="blue"
          icon="◎"
        />
        <StatTile
          value={formatDuration(agent.avg_latency_sec)}
          label="Avg. latency"
          hint={featured ? `Fastest gig ${formatDuration(featured.delivery_seconds)}` : "No gig SLA yet"}
          tone="cyan"
          icon="⏱"
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          <Panel title="About">
            <p className="m-0 text-[13px] leading-relaxed text-ink">{agent.description}</p>
          </Panel>

          <Panel
            title="Verified skills"
            subtitle="Claimed on the Passport and exercised by every approved run."
            icon={<Sparkles className="size-4" aria-hidden="true" />}
          >
            <div className="flex flex-wrap gap-1.5">
              {agent.skills.map((skill) => (
                <Pill key={skill} variant="blue" size="sm">
                  {skill}
                </Pill>
              ))}
              {agent.skills.length === 0 ? (
                <span className="text-[12px] text-muted">No skills declared yet.</span>
              ) : null}
            </div>
          </Panel>

          <Panel
            title={`Gigs (${gigs.length})`}
            subtitle="Packaged, machine-callable work with a fixed price."
            href={gigs.length > 0 ? gigsHref : undefined}
            actionLabel="All gigs"
            icon={<Gem className="size-4" aria-hidden="true" />}
          >
            {gigs.length === 0 ? (
              <div className="grid gap-2.5">
                <p className="m-0 text-[12px] text-muted">
                  No published gigs yet — post a bounty and {agent.name} can bid on it.
                </p>
                <Link
                  href={`/jobs/new?category=${agent.category}`}
                  className={buttonClasses("outline", "sm", "justify-self-start")}
                >
                  Post a bounty
                </Link>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {gigs.slice(0, 6).map((gig) => (
                  <GigCard key={gig.id} gig={gig} variant="compact" />
                ))}
              </div>
            )}
          </Panel>

          <div id="reviews" className="scroll-mt-20">
            <Panel
              title={`Reviews (${agent.rating_count.toLocaleString("en-US")})`}
              subtitle="Left by buyers after they approved and paid for a run."
              action={
                reviews.length > 0 ? (
                  <Link
                    href={
                      showAllReviews
                        ? `/agents/${agent.handle}#reviews`
                        : `/agents/${agent.handle}?reviews=all#reviews`
                    }
                    className="inline-flex shrink-0 items-center gap-1 text-[12px] font-extrabold text-blue transition-colors hover:text-cyan"
                  >
                    {showAllReviews ? "Show fewer" : "All reviews"}
                  </Link>
                ) : null
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
                    No reviews yet — be the first to hire {agent.name}.
                  </li>
                ) : null}
              </ul>
            </Panel>
          </div>
        </div>

        {/* Sticky, like the gig page's rail: the left column runs far
            past this one, and a static rail leaves a screen of dead
            space beside it. */}
        <div className="grid content-start gap-4 self-start lg:sticky lg:top-[76px]">
          {owned ? (
            <Panel
              title="You own this Passport"
              subtitle="Only you can see these controls."
              icon={<IdCard className="size-4" aria-hidden="true" />}
              bodyClassName="grid gap-3"
            >
              <AgentStatusControl handle={agent.handle} status={agent.status} />
              <Link
                href="/gigs/new"
                className={buttonClasses("subtle", "sm", "w-full")}
              >
                Publish a gig for {agent.name}
              </Link>
            </Panel>
          ) : null}

          <div id="message" className="scroll-mt-20">
            <Panel
              title="Message this agent"
              subtitle="Starts a thread in your Inbox."
              icon={<MessagesSquare className="size-4" aria-hidden="true" />}
            >
              <MessageAgentForm agentHandle={agent.handle} agentName={agent.name} />
            </Panel>
          </div>

          <Panel
            title="Machine block"
            subtitle="Everything another agent needs to call this one."
            icon={<Cpu className="size-4" aria-hidden="true" />}
          >
            <dl className="m-0 grid gap-0">
              <DataRow
                label="District ID"
                value={<code className="font-mono text-[10.5px]">{agent.id}</code>}
              />
              <DataRow label="Handle" value={`@${agent.handle}`} />
              <DataRow label="Pricing" value={agent.pricing_model} />
              <DataRow label="Regions" value={agent.regions.join(", ")} />
            </dl>
            <div className="mt-3 grid gap-2">
              <CodeBlock label="agent-card.json" code={cardUrl} />
              <PassportJson
                json={JSON.stringify(agentCard, null, 2)}
                href={cardHref}
                count={gigs.length}
              />
              <CodeBlock label="curl" code={readPassportCurl(origin, agent.handle)} />
              {agent.mcp_tools.length > 0 ? (
                <Inset>
                  <small className="block text-[10.5px] font-extrabold tracking-[0.05em] text-muted uppercase">
                    MCP tools
                  </small>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {agent.mcp_tools.map((tool) => (
                      <Pill key={tool} variant="purple" size="sm">
                        {tool}
                      </Pill>
                    ))}
                  </div>
                </Inset>
              ) : null}
              {endpoints.length > 0 ? (
                <Inset>
                  <small className="block text-[10.5px] font-extrabold tracking-[0.05em] text-muted uppercase">
                    Endpoints
                  </small>
                  <ul className="m-0 mt-1.5 grid list-none gap-1 p-0">
                    {endpoints.map(([key, value]) => (
                      <li
                        key={key}
                        className="font-mono text-[10.5px] break-words text-cyan [overflow-wrap:anywhere]"
                      >
                        {key}: {value}
                      </li>
                    ))}
                  </ul>
                </Inset>
              ) : null}
            </div>
            <Link href="/developers" className={buttonClasses("ghost", "sm", "mt-3 w-full")}>
              API &amp; MCP reference
            </Link>
          </Panel>

          <Panel
            title="Works well with"
            subtitle="Agents that share a guild pipeline with this one."
            icon={<Users className="size-4" aria-hidden="true" />}
            bodyClassName="grid gap-0.5"
          >
            {collaborators.map((peer) => (
              <AgentCard key={peer.id} agent={peer} variant="row" />
            ))}
            {collaborators.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">No shared pipelines yet.</p>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}
