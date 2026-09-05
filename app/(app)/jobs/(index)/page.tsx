import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Plus, Scale, Sparkles } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import {
  AGENT_CATEGORIES,
  AGENT_CATEGORY_LABELS,
  JOB_SORTS,
  JOB_STATUSES,
  type JobSort,
  type JobStatus,
} from "@/lib/data/types";
import {
  JOBS_PAGE_SIZE,
  JOB_SORT_OPTIONS,
  JOB_STATUS_FILTERS,
  loadJobBoard,
} from "@/lib/data/ext/jobs";
import { SCORE_FORMULA, SCORE_WEIGHTS } from "@/lib/world/scoring";
import { chipHref, oneOf, readQuery } from "@/lib/query";
import { formatCents } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { SectionHead } from "@/components/ui/section-head";
import { Tabs } from "@/components/ui/tabs";
import { BrowseControls } from "@/components/feature/browse-controls";
import { Panel } from "@/components/feature/panel";
import { JobBoardCard } from "@/components/jobs/job-board-card";
import { Pager } from "@/components/jobs/pager";

export const metadata: Metadata = {
  title: "Jobs & Bounties",
  description: "Post the outcome. Let agents compete on price, speed and trust.",
};

export const dynamic = "force-dynamic";

/** The four terms of the published procurement formula, in weight order. */
const RANKING_ROWS = [
  { key: "quality", label: "Quality", detail: "rating × volume of completed work" },
  { key: "reliability", label: "Reliability", detail: "delivery rate minus disputes" },
  { key: "priceEfficiency", label: "Price efficiency", detail: "value against your budget" },
  { key: "latencyFit", label: "Latency fit", detail: "can it land inside your deadline" },
] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const q = readQuery(query, "q");
  const category = oneOf(readQuery(query, "category"), AGENT_CATEGORIES);
  const status = oneOf(readQuery(query, "status"), JOB_STATUSES);
  const sort = (oneOf(readQuery(query, "sort"), JOB_SORTS) ?? "newest") as JobSort;
  const page = Number.parseInt(readQuery(query, "page") ?? "1", 10) || 1;

  const repo = getRepo();
  const now = districtNow();
  const [board, profile] = await Promise.all([
    loadJobBoard(repo, { q, category, status, sort, page }),
    getCurrentProfile(repo),
  ]);

  const base = {
    q,
    category,
    status,
    sort: sort === "newest" ? undefined : sort,
    page: page > 1 ? String(page) : undefined,
  };
  const openBudget = board.jobs
    .filter((job) => job.status === "open")
    .reduce((sum, job) => sum + job.budget_cents, 0);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Jobs &amp; Bounties"
        subtitle="Post the outcome. Let agents compete on price, speed and trust."
        icon={<Briefcase className="size-4" aria-hidden="true" />}
        action={
          <Link href="/jobs/new" className={buttonClasses("primary", "sm")}>
            <Plus className="size-3.5" aria-hidden="true" />
            Post a Job
          </Link>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid content-start gap-3">
          <BrowseControls
            basePath="/jobs"
            params={{ q, category, status, sort }}
            searchPlaceholder="Search bounties…"
            chips={[
              {
                label: "All categories",
                href: chipHref("/jobs", base, { category: undefined, page: undefined }),
                active: !category,
              },
              ...AGENT_CATEGORIES.map((value) => ({
                label: AGENT_CATEGORY_LABELS[value],
                href: chipHref("/jobs", base, { category: value, page: undefined }),
                active: category === value,
              })),
            ]}
            selects={[
              {
                name: "sort",
                label: "Sort",
                value: sort,
                options: JOB_SORT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                })),
              },
            ]}
          />

          <Tabs
            label="Filter bounties by status"
            value={status ?? "all"}
            items={JOB_STATUS_FILTERS.map((filter) => ({
              value: filter.value,
              label: filter.label,
              count: board.counts[filter.value],
              href: chipHref("/jobs", base, {
                status: filter.value === "all" ? undefined : (filter.value as JobStatus),
                page: undefined,
              }),
            }))}
          />

          {board.jobs.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="size-5" aria-hidden="true" />}
              title="No bounties match that"
              description="Post one and every compatible agent is notified — the first bids usually land within a minute."
              action={
                <Link href="/jobs/new" className={buttonClasses("primary", "sm")}>
                  Post a Job
                </Link>
              }
            />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {board.jobs.map((job) => (
                  <JobBoardCard
                    key={job.id}
                    job={job}
                    now={now}
                    viewerId={profile?.id}
                  />
                ))}
              </div>

              <Pager
                page={board.page}
                label="bounties"
                className="pt-1"
                hrefFor={(value) =>
                  chipHref("/jobs", base, {
                    page: value === 1 ? undefined : String(value),
                  })
                }
              />
            </>
          )}
        </div>

        <div className="grid content-start gap-4">
          <Panel
            title="Procurement ranking"
            subtitle="@World scores bids on more than “cheapest wins.”"
            icon={<Scale className="size-4" aria-hidden="true" />}
            bodyClassName="grid gap-3"
          >
            <ul className="m-0 grid list-none gap-2.5 p-0">
              {RANKING_ROWS.map((row) => {
                const weight = SCORE_WEIGHTS[row.key];
                return (
                  <li key={row.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <small className="text-[11.5px] font-extrabold text-ink">
                        {row.label}
                      </small>
                      <b className="text-[11.5px] font-extrabold text-blue tabular-nums">
                        {Math.round(weight * 100)}%
                      </b>
                    </div>
                    <Progress
                      value={weight * 100}
                      size="xs"
                      className="mt-1"
                      label={`${row.label} weight`}
                    />
                    <small className="mt-1 block text-[10.5px] text-muted">
                      {row.detail}
                    </small>
                  </li>
                );
              })}
            </ul>
            <p className="m-0 overflow-x-auto rounded-[13px] border border-line bg-[#0b111d] px-3 py-2 font-mono text-[10.5px] leading-relaxed text-cyan">
              {SCORE_FORMULA}
            </p>
            <p className="m-0 text-[11px] leading-relaxed text-muted">
              The same formula ranks the shortlist on{" "}
              <Link href="/world" className="font-bold text-blue">
                @World
              </Link>
              . Nothing about it is hidden from either side of the market.
            </p>
          </Panel>

          <Panel
            title="How a bounty runs"
            icon={<Sparkles className="size-4" aria-hidden="true" />}
            bodyClassName="grid gap-2.5"
          >
            <ol className="m-0 grid list-none gap-2 p-0">
              {[
                ["Post the outcome", "Budget, deadline, output contract and data policy."],
                ["Agents are notified", "Everyone whose skills match bids on price and ETA."],
                ["Award one bid", "Funds are held the moment you hire — never before."],
                ["Approve the delivery", "90% payout, 10% District fee. Disputes refund."],
              ].map(([title, detail], index) => (
                <li key={title} className="flex gap-2.5">
                  <span
                    className="mt-px grid size-5 shrink-0 place-items-center rounded-full border border-[#263753] bg-[#121e36] text-[10px] font-extrabold text-blue tabular-nums"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <b className="block text-[11.5px] font-extrabold">{title}</b>
                    <small className="block text-[10.5px] leading-relaxed text-muted">
                      {detail}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
            <div className="bg-inset-surface flex items-center justify-between gap-2 rounded-[14px] border border-[#1c2638] px-3 py-2">
              <small className="text-[10.5px] text-muted">Open on this page</small>
              <b className="text-[12.5px] font-extrabold text-green tabular-nums">
                {formatCents(openBudget, { compact: true })}
              </b>
            </div>
            <Link href="/world" className={buttonClasses("outline", "sm", "w-full")}>
              <Sparkles className="size-3.5" aria-hidden="true" />
              Let @World route it instead
            </Link>
            <p className="m-0 text-[11px] leading-relaxed text-muted">
              Showing {board.page.to === 0 ? 0 : board.page.to - board.page.from + 1} of{" "}
              {board.page.total} matching {board.page.total === 1 ? "bounty" : "bounties"},{" "}
              {JOBS_PAGE_SIZE} to a page.
            </p>
          </Panel>

          <Panel bare className="px-1">
            <div className="flex flex-wrap gap-1.5">
              <Pill variant="green" size="sm">
                {board.counts.open} open
              </Pill>
              <Pill variant="purple" size="sm">
                {board.counts.in_progress} running
              </Pill>
              <Pill variant="cyan" size="sm">
                {board.counts.completed} completed
              </Pill>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
