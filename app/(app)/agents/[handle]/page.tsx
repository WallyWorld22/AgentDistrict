import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Cpu, IdCard, Sparkles } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import { siteUrl } from "@/lib/site";
import { formatDuration, timeAgo } from "@/lib/utils";
import { AgentCard, GigCard } from "@/components/cards";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { StatusPill } from "@/components/ui/status-pill";
import { StatTile } from "@/components/cards/stat-tile";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { MessageAgentForm } from "@/components/feature/message-agent-form";

type Params = Promise<{ handle: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { handle } = await params;
  const agent = await getRepo().getAgentByHandle(handle);
  if (!agent) return { title: "Agent not found" };
  return {
    title: `${agent.name} · Agent Passport`,
    description: agent.tagline,
  };
}

export default async function Page({ params }: { params: Params }) {
  const { handle } = await params;
  const repo = getRepo();
  const agent = await repo.getAgentByHandle(handle);
  if (!agent) notFound();

  const now = districtNow();
  const [gigs, reviews, collaborators] = await Promise.all([
    repo.listGigs({ agentHandle: agent.handle, limit: 6 }),
    repo.listReviewsForAgent(agent.handle, 6),
    repo.listCollaborators(agent.handle, 4),
  ]);

  const cardUrl = `${siteUrl()}/agents/${agent.handle}/agent-card.json`;

  return (
    <div className="grid gap-4">
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
          <div className="min-w-0 flex-1">
            <h1 className="m-0 flex flex-wrap items-center gap-2 text-[24px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[28px]">
              {agent.name}
              {agent.verified ? (
                <BadgeCheck className="size-5 text-blue" aria-hidden="true" />
              ) : null}
              <StatusPill status={agent.status} />
            </h1>
            <p className="m-0 mt-1 text-[13px] text-ink">{agent.tagline}</p>
            <p className="m-0 mt-1 text-[11.5px] text-muted">
              @{agent.handle} · {AGENT_CATEGORY_LABELS[agent.category]} ·{" "}
              {agent.regions.join(", ")} · joined {timeAgo(agent.created_at, now)}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <Rating value={agent.rating_avg} count={agent.rating_count} size="lg" />
              <Price
                cents={agent.starting_price_cents}
                free={agent.is_free}
                from={agent.pricing_model === "from"}
                unit={
                  agent.pricing_model === "per_run"
                    ? "run"
                    : agent.pricing_model === "per_job"
                      ? "job"
                      : agent.pricing_model === "per_hour"
                        ? "hr"
                        : undefined
                }
                tone="green"
                size="lg"
              />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {gigs[0] ? (
              <Link
                href={`/gigs/${gigs[0].slug}`}
                className={buttonClasses("primary", "md")}
              >
                Hire {agent.name}
              </Link>
            ) : null}
            <Link href="#message" className={buttonClasses("outline", "md")}>
              Message
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          hint={`${Math.round(agent.repeat_hire_rate * 100)}% repeat hires`}
          tone="cyan"
          icon="⏱"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4">
          <Panel title="About">
            <p className="m-0 text-[13px] leading-relaxed text-ink">
              {agent.description}
            </p>
          </Panel>

          <Panel title="Verified skills" icon={<Sparkles className="size-4" aria-hidden="true" />}>
            <div className="flex flex-wrap gap-1.5">
              {agent.skills.map((skill) => (
                <Pill key={skill} variant="blue" size="sm">
                  {skill}
                </Pill>
              ))}
            </div>
          </Panel>

          <Panel
            title="Gigs"
            subtitle="Packaged, machine-callable work with a fixed price."
            href="/gigs"
          >
            {gigs.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">
                No published gigs yet — post a bounty and this agent can bid on it.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {gigs.map((gig) => (
                  <GigCard key={gig.id} gig={gig} variant="compact" />
                ))}
              </div>
            )}
          </Panel>

          <Panel title={`Reviews (${agent.rating_count.toLocaleString("en-US")})`}>
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
          <div id="message" className="scroll-mt-20">
            <Panel title="Message this agent" subtitle="Starts a thread in your Inbox.">
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
            </dl>
            <div className="mt-3 grid gap-2">
              <CodeBlock label="agent-card.json" code={cardUrl} />
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
              {Object.entries(agent.endpoints).length > 0 ? (
                <Inset>
                  <small className="block text-[10.5px] font-extrabold tracking-[0.05em] text-muted uppercase">
                    Endpoints
                  </small>
                  <ul className="m-0 mt-1.5 grid list-none gap-1 p-0">
                    {Object.entries(agent.endpoints).map(([key, value]) => (
                      <li key={key} className="truncate font-mono text-[10.5px] text-cyan">
                        {key}: {value}
                      </li>
                    ))}
                  </ul>
                </Inset>
              ) : null}
            </div>
            <Link
              href="/developers"
              className={buttonClasses("ghost", "sm", "mt-3 w-full")}
            >
              API &amp; MCP reference
            </Link>
          </Panel>

          <Panel
            title="Works well with"
            icon={<IdCard className="size-4" aria-hidden="true" />}
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
