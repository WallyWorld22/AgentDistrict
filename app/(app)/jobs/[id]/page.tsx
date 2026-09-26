import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  Clock,
  FileOutput,
  Gavel,
  ShieldCheck,
  Users,
} from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_VARIANT,
  compatibleAgents,
  findOrderForJob,
  relatedJobs,
} from "@/lib/data/ext/jobs";
import { clampWords, endSentence } from "@/lib/seo/schema";
import { formatCents, formatDuration, timeAgo } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { BidsPanel } from "@/components/jobs/bids-panel";
import { JobMachineBlock } from "@/components/jobs/job-machine-block";
import { PlaceBidForm } from "@/components/jobs/place-bid-form";
import { PostedToast } from "@/components/jobs/posted-toast";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const job = await getRepo().getJob(id);
  if (!job) return { title: "Job not found" };

  const description = `${endSentence(clampWords(job.description, 150))} ${formatCents(job.budget_cents)} budget, bids close in ~${formatDuration(job.deadline_seconds)}. Open bounty on AgentDistrict.`;
  return {
    title: `${job.title} · Jobs`,
    description,
    // A bounty is reachable with sort and filter query strings, so it needs to
    // name its own canonical URL rather than let a crawler pick one.
    alternates: { canonical: `/jobs/${job.id}` },
    openGraph: { type: "website", url: `/jobs/${job.id}`, title: job.title, description },
  };
}

const PII_COPY = {
  none: "None — no personal data at all",
  redacted: "Redacted — personal fields removed",
  allowed: "Allowed — contact details expected",
} as const;

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id } = await params;
  const repo = getRepo();
  const job = await repo.getJob(id);
  if (!job) notFound();

  const query = await searchParams;
  const postedRaw = Array.isArray(query.posted) ? query.posted[0] : query.posted;
  const posted = postedRaw === undefined ? null : Number.parseInt(postedRaw, 10) || 0;

  const now = districtNow();
  const profile = await getCurrentProfile(repo);
  const isPoster = profile?.id === job.poster_id;

  const [myAgents, related, order, roster] = await Promise.all([
    profile ? repo.listAgentsByOwner(profile.id) : Promise.resolve([]),
    relatedJobs(repo, job),
    profile ? findOrderForJob(repo, job.id, profile.id) : Promise.resolve(null),
    repo.listAgents({ limit: 200 }),
  ]);

  // The same set the poster's agents are excluded from when the bounty goes
  // up, so the banner and this panel never disagree.
  const notified = compatibleAgents(roster, job).filter(
    (agent) => agent.owner_id !== job.poster_id,
  ).length;
  const winner = job.bids.find((bid) => bid.status === "accepted") ?? null;
  const pending = job.bids.filter((bid) => bid.status === "pending");
  const canAward = Boolean(isPoster) && job.status === "open";
  const canBid = !isPoster && job.status === "open" && myAgents.length > 0;
  const cheapest = pending.reduce<number | null>(
    (low, bid) => (low === null ? bid.amount_cents : Math.min(low, bid.amount_cents)),
    null,
  );

  return (
    <div className="grid gap-4">
      {posted !== null ? <PostedToast notified={posted || notified} /> : null}

      <SectionHead
        as="h1"
        title={job.title}
        subtitle={`${AGENT_CATEGORY_LABELS[job.category]} · posted ${timeAgo(
          job.created_at,
          now,
        )} by ${job.poster?.display_name ?? "a buyer"}`}
        icon={<Briefcase className="size-4" aria-hidden="true" />}
        action={
          <div className="flex items-center gap-2">
            <Pill variant={JOB_STATUS_VARIANT[job.status]}>
              {JOB_STATUS_LABELS[job.status]}
            </Pill>
            <Link href="/jobs" className={buttonClasses("ghost", "sm")}>
              All bounties
            </Link>
          </div>
        }
      />

      {posted !== null ? (
        <p
          role="status"
          className="m-0 flex flex-wrap items-center gap-2 rounded-card border border-[#1b7253] bg-[#0c1f1a] px-4 py-3 text-[12.5px] font-bold text-[#8ff0c4]"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          Bounty posted — {posted || notified} compatible{" "}
          {(posted || notified) === 1 ? "agent was" : "agents were"} notified.
          {job.bids.length > 0
            ? ` ${job.bids.length} of them already answered.`
            : " Their bids will land here."}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="grid content-start gap-4">
          <Panel
            title="The brief"
            subtitle="What done looks like, in the buyer's words."
            bodyClassName="grid gap-3"
          >
            <p className="m-0 text-[13px] leading-relaxed whitespace-pre-line text-ink">
              {job.description}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Inset className="p-2.5">
                <small className="block text-[9.5px] font-extrabold tracking-[0.06em] text-muted uppercase">
                  Budget
                </small>
                <b className="mt-0.5 block text-[16px] font-extrabold text-green tabular-nums">
                  {formatCents(job.budget_cents)}
                </b>
              </Inset>
              <Inset className="p-2.5">
                <small className="block text-[9.5px] font-extrabold tracking-[0.06em] text-muted uppercase">
                  Deadline
                </small>
                <b className="mt-0.5 flex items-center gap-1.5 text-[16px] font-extrabold tabular-nums">
                  <Clock className="size-3.5 text-yellow" aria-hidden="true" />
                  {formatDuration(job.deadline_seconds)}
                </b>
              </Inset>
              <Inset className="p-2.5">
                <small className="block text-[9.5px] font-extrabold tracking-[0.06em] text-muted uppercase">
                  Bids
                </small>
                <b className="mt-0.5 flex items-center gap-1.5 text-[16px] font-extrabold tabular-nums">
                  <Users className="size-3.5 text-blue" aria-hidden="true" />
                  {job.bids.length}
                  {cheapest !== null ? (
                    <small className="text-[11px] font-bold text-muted">
                      from {formatCents(cheapest)}
                    </small>
                  ) : null}
                </b>
              </Inset>
            </div>
          </Panel>

          {winner ? (
            <Panel
              title="Awarded"
              subtitle={`${JOB_STATUS_LABELS[job.status]} — the winning bid and its run.`}
              icon={<Gavel className="size-4" aria-hidden="true" />}
              bodyClassName="grid gap-3"
            >
              <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[#1b7253] bg-[#0c1f1a] p-3">
                <AgentAvatar
                  emoji={winner.agent.avatar_emoji}
                  handle={winner.agent.handle}
                  gradient={winner.agent.avatar_gradient}
                  name={winner.agent.name}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/agents/${winner.agent.handle}`}
                    className="flex items-center gap-1 text-[13px] font-extrabold hover:text-blue"
                  >
                    {winner.agent.name}
                    {winner.agent.verified ? (
                      <BadgeCheck className="size-3.5 text-blue" aria-hidden="true" />
                    ) : null}
                  </Link>
                  <small className="block text-[11px] text-muted">
                    {winner.note}
                  </small>
                </div>
                <div className="text-right">
                  <b className="block text-[15px] font-extrabold text-green tabular-nums">
                    {formatCents(winner.amount_cents)}
                  </b>
                  <small className="block text-[10.5px] text-muted tabular-nums">
                    {formatDuration(winner.eta_seconds)}
                  </small>
                </div>
              </div>

              {order ? (
                <div className="bg-inset-surface grid gap-2 rounded-[16px] border border-[#1c2638] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="text-[12px] font-extrabold">
                      Run {order.status.toUpperCase()} · {order.progress}%
                    </b>
                    <Link
                      href={`/orders/${order.id}`}
                      className={buttonClasses("primary", "xs")}
                    >
                      Open the run
                    </Link>
                  </div>
                  <Progress
                    value={order.progress}
                    size="sm"
                    tone={order.status === "approved" ? "green" : "primary"}
                    label="Run progress"
                  />
                </div>
              ) : (
                <p className="m-0 text-[11.5px] leading-relaxed text-muted">
                  The run belongs to the buyer who posted this bounty — only they can
                  see its deliverable and approve it.
                </p>
              )}
            </Panel>
          ) : null}

          <Panel
            title={`Bids (${job.bids.length})`}
            subtitle={
              canAward
                ? "Award one and the funds are held immediately. The rest are rejected."
                : "Sort by lowest, fastest or best fit — the formula is published on the board."
            }
            icon={<Users className="size-4" aria-hidden="true" />}
          >
            <BidsPanel
              jobId={job.id}
              job={{
                budget_cents: job.budget_cents,
                deadline_seconds: job.deadline_seconds,
              }}
              canAward={canAward}
              bids={job.bids.map((bid) => ({
                id: bid.id,
                amount_cents: bid.amount_cents,
                eta_seconds: bid.eta_seconds,
                note: bid.note,
                status: bid.status,
                placedAgo: timeAgo(bid.created_at, now),
                guild: bid.guild ? { name: bid.guild.name } : null,
                agent: {
                  handle: bid.agent.handle,
                  name: bid.agent.name,
                  avatar_emoji: bid.agent.avatar_emoji,
                  avatar_gradient: bid.agent.avatar_gradient,
                  rating_avg: bid.agent.rating_avg,
                  rating_count: bid.agent.rating_count,
                  reliability: bid.agent.reliability,
                  repeat_hire_rate: bid.agent.repeat_hire_rate,
                  dispute_rate: bid.agent.dispute_rate,
                  verified: bid.agent.verified,
                },
              }))}
            />
          </Panel>

          {canBid ? (
            <Panel
              title="Place a bid"
              subtitle="Bid as one of your agents. Price and delivery are what buyers compare."
              icon={<Gavel className="size-4" aria-hidden="true" />}
            >
              <PlaceBidForm
                jobId={job.id}
                budgetCents={job.budget_cents}
                deadlineSeconds={job.deadline_seconds}
                agents={myAgents.map((agent) => ({
                  handle: agent.handle,
                  name: agent.name,
                  startingPriceCents: agent.starting_price_cents,
                  latencySeconds: agent.avg_latency_sec,
                }))}
              />
            </Panel>
          ) : isPoster && job.status === "open" ? (
            <Panel title="Place a bid" icon={<Gavel className="size-4" aria-hidden="true" />}>
              <p className="m-0 text-[12px] leading-relaxed text-muted">
                This is your own bounty — you can award a bid, but you cannot bid on it.
                Agents you own are excluded from the notification for the same reason.
              </p>
            </Panel>
          ) : null}

          <JobMachineBlock job={job} agentHandle={myAgents[0]?.handle ?? "scout"} />
        </div>

        <div className="grid content-start gap-4">
          <Panel
            title="Required output"
            icon={<FileOutput className="size-4" aria-hidden="true" />}
          >
            <dl className="m-0 grid gap-0">
              <DataRow label="Format" value={job.required_output.format.toUpperCase()} />
              <DataRow
                label="Fields"
                value={job.required_output.columns?.length ?? "free-form"}
              />
            </dl>
            {job.required_output.columns?.length ? (
              <Inset className="mt-3">
                <small className="block text-[10.5px] font-extrabold tracking-[0.05em] text-muted uppercase">
                  Every row must carry
                </small>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {job.required_output.columns.map((column) => (
                    <Pill key={column} size="sm" variant="cyan">
                      {column}
                    </Pill>
                  ))}
                </div>
              </Inset>
            ) : null}
            {job.required_output.notes ? (
              <p className="m-0 mt-2 text-[11.5px] leading-relaxed text-muted">
                {job.required_output.notes}
              </p>
            ) : null}
          </Panel>

          <Panel title="Data policy" icon={<ShieldCheck className="size-4" aria-hidden="true" />}>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              <Pill
                size="sm"
                variant={
                  job.data_policy.pii === "none"
                    ? "green"
                    : job.data_policy.pii === "redacted"
                      ? "yellow"
                      : "red"
                }
              >
                PII: {job.data_policy.pii}
              </Pill>
              <Pill size="sm" variant={job.data_policy.retention_days === 0 ? "green" : "default"}>
                {job.data_policy.retention_days === 0
                  ? "Delete on delivery"
                  : `Keep ${job.data_policy.retention_days} days`}
              </Pill>
              <Pill size="sm" variant={job.data_policy.allow_subcontracting ? "blue" : "purple"}>
                {job.data_policy.allow_subcontracting ? "Subcontracting ok" : "No subcontracting"}
              </Pill>
              {job.data_policy.regions?.map((region) => (
                <Pill key={region} size="sm" variant="cyan">
                  {region} only
                </Pill>
              ))}
            </div>
            <p className="m-0 text-[11.5px] leading-relaxed text-ink">
              {PII_COPY[job.data_policy.pii]}.
              {job.data_policy.notes ? ` ${job.data_policy.notes}` : ""}
            </p>
            <p className="m-0 mt-2 text-[11px] leading-relaxed text-muted">
              The policy travels with the job and every run is logged to the{" "}
              <Link href="/workplace" className="font-bold text-blue">
                Workplace Gateway
              </Link>{" "}
              audit trail.
            </p>
          </Panel>

          <Panel title="Reach" bodyClassName="grid gap-2">
            <DataRow label="Agents notified" value={notified} />
            <DataRow label="Bids received" value={job.bids.length} />
            <DataRow
              label="Response rate"
              value={notified > 0 ? `${Math.round((job.bids.length / notified) * 100)}%` : "—"}
            />
          </Panel>

          {related.length > 0 ? (
            <Panel title="Related open bounties" href="/jobs" actionLabel="All bounties">
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {related.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/jobs/${row.id}`}
                      className="bg-inset-surface block rounded-[14px] border border-[#1c2638] px-3 py-2 transition-colors hover:border-[#33415f]"
                    >
                      <b className="block truncate text-[11.5px] font-extrabold">
                        {row.title}
                      </b>
                      <small className="block text-[10.5px] text-muted tabular-nums">
                        {formatCents(row.budget_cents, { compact: true })} · {row.bidCount}{" "}
                        {row.bidCount === 1 ? "bid" : "bids"} ·{" "}
                        {timeAgo(row.created_at, now)}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
