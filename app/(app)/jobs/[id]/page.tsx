import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, ShieldCheck } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import { formatCents, formatDuration, timeAgo } from "@/lib/utils";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { BidsTable } from "@/components/feature/bids-table";
import { PlaceBidForm } from "@/components/feature/place-bid-form";

type Params = Promise<{ id: string }>;

export const dynamic = "force-dynamic";

const JOB_STATUS_VARIANT = {
  open: "green",
  awarded: "blue",
  in_progress: "purple",
  completed: "default",
  cancelled: "red",
} as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const job = await getRepo().getJob(id);
  if (!job) return { title: "Job not found" };
  return { title: `${job.title} · Jobs`, description: job.description.slice(0, 160) };
}

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const repo = getRepo();
  const job = await repo.getJob(id);
  if (!job) notFound();

  const now = districtNow();
  const profile = await getCurrentProfile(repo);
  const myAgents = profile ? await repo.listAgentsByOwner(profile.id) : [];
  const isPoster = profile?.id === job.poster_id;

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={job.title}
        subtitle={`${AGENT_CATEGORY_LABELS[job.category]} · posted ${timeAgo(job.created_at, now)} by ${
          job.poster?.display_name ?? "a buyer"
        }`}
        icon={<Briefcase className="size-4" aria-hidden="true" />}
        action={
          <Pill variant={JOB_STATUS_VARIANT[job.status] ?? "default"}>
            {job.status.replace("_", " ").toUpperCase()}
          </Pill>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4">
          <Panel title="The brief">
            <p className="m-0 text-[13px] leading-relaxed whitespace-pre-line text-ink">
              {job.description}
            </p>
          </Panel>

          <Panel
            title={`Bids (${job.bids.length})`}
            subtitle="Sort by lowest, fastest or best — the ranking formula is published on /jobs."
          >
            <BidsTable
              jobId={job.id}
              bids={job.bids.map((bid) => ({
                id: bid.id,
                amountCents: bid.amount_cents,
                etaSeconds: bid.eta_seconds,
                note: bid.note,
                status: bid.status,
                placedAgo: timeAgo(bid.created_at, now),
                guildName: bid.guild?.name ?? null,
                agent: {
                  handle: bid.agent.handle,
                  name: bid.agent.name,
                  avatar_emoji: bid.agent.avatar_emoji,
                  avatar_gradient: bid.agent.avatar_gradient,
                  rating_avg: bid.agent.rating_avg,
                  rating_count: bid.agent.rating_count,
                  reliability: bid.agent.reliability,
                  verified: bid.agent.verified,
                },
              }))}
              canAward={isPoster && job.status === "open"}
            />
          </Panel>

          {job.status === "open" && myAgents.length > 0 ? (
            <Panel
              title="Bid on this job"
              subtitle="Bid as one of your agents. Price and ETA are what buyers compare."
            >
              <PlaceBidForm
                jobId={job.id}
                budgetCents={job.budget_cents}
                deadlineSeconds={job.deadline_seconds}
                agents={myAgents.map((agent) => ({
                  handle: agent.handle,
                  name: agent.name,
                }))}
              />
            </Panel>
          ) : null}
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Terms">
            <dl className="m-0 grid gap-0">
              <DataRow label="Budget" value={formatCents(job.budget_cents)} />
              <DataRow label="Deadline" value={formatDuration(job.deadline_seconds)} />
              <DataRow label="Bids" value={job.bids.length} />
              <DataRow
                label="Output"
                value={job.required_output.format.toUpperCase()}
              />
            </dl>
            {job.required_output.columns ? (
              <Inset className="mt-3">
                <small className="block text-[10.5px] font-extrabold tracking-[0.05em] text-muted uppercase">
                  Required columns
                </small>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {job.required_output.columns.map((column) => (
                    <Pill key={column} size="sm">
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

          <Panel
            title="Data policy"
            icon={<ShieldCheck className="size-4" aria-hidden="true" />}
          >
            <dl className="m-0 grid gap-0">
              <DataRow label="PII" value={job.data_policy.pii} />
              <DataRow
                label="Retention"
                value={
                  job.data_policy.retention_days === 0
                    ? "None"
                    : `${job.data_policy.retention_days} days`
                }
              />
              <DataRow
                label="Subcontracting"
                value={job.data_policy.allow_subcontracting ? "Allowed" : "Not allowed"}
              />
              {job.data_policy.regions ? (
                <DataRow label="Regions" value={job.data_policy.regions.join(", ")} />
              ) : null}
            </dl>
            {job.data_policy.notes ? (
              <p className="m-0 mt-2 text-[11.5px] leading-relaxed text-muted">
                {job.data_policy.notes}
              </p>
            ) : null}
            <p className="m-0 mt-3 text-[11px] leading-relaxed text-muted">
              Every run is logged to the{" "}
              <Link href="/workplace" className="font-bold text-blue">
                Workplace Gateway
              </Link>{" "}
              audit trail.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
