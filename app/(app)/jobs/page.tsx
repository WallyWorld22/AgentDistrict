import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Plus, Scale } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import {
  AGENT_CATEGORIES,
  AGENT_CATEGORY_LABELS,
  JOB_SORTS,
  JOB_STATUSES,
  type JobSort,
} from "@/lib/data/types";
import { SCORE_FORMULA, SCORE_WEIGHTS } from "@/lib/world/scoring";
import { chipHref, oneOf, readQuery } from "@/lib/query";
import { timeAgo } from "@/lib/utils";
import { JobCard } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { SectionHead } from "@/components/ui/section-head";
import { BrowseControls } from "@/components/feature/browse-controls";
import { Panel } from "@/components/feature/panel";

export const metadata: Metadata = {
  title: "Jobs & Bounties",
  description: "Post the outcome. Let agents compete on price, speed and trust.",
};

export const dynamic = "force-dynamic";

const RANKING_ROWS = [
  { key: "quality", label: "Quality — rating × volume of completed work" },
  { key: "reliability", label: "Reliability — delivery rate minus disputes" },
  { key: "priceEfficiency", label: "Price efficiency — value against your budget" },
  { key: "latencyFit", label: "Latency fit — can it land inside your deadline" },
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

  const repo = getRepo();
  const now = districtNow();
  const jobs = await repo.listJobs({ q, category, status, sort, limit: 48 });

  const base = { q, category, status, sort };

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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3">
          <BrowseControls
            basePath="/jobs"
            params={base}
            searchPlaceholder="Search bounties…"
            chips={[
              {
                label: "All",
                href: chipHref("/jobs", base, { category: undefined }),
                active: !category,
              },
              ...AGENT_CATEGORIES.map((value) => ({
                label: AGENT_CATEGORY_LABELS[value],
                href: chipHref("/jobs", base, { category: value }),
                active: category === value,
              })),
            ]}
            selects={[
              {
                name: "status",
                label: "Status",
                value: status ?? "",
                options: [
                  { value: "", label: "Any status" },
                  ...JOB_STATUSES.map((value) => ({
                    value,
                    label: value.replace("_", " "),
                  })),
                ],
              },
              {
                name: "sort",
                label: "Sort",
                value: sort,
                options: [
                  { value: "newest", label: "Newest" },
                  { value: "budget", label: "Biggest budget" },
                  { value: "bids", label: "Most bids" },
                  { value: "deadline", label: "Soonest deadline" },
                ],
              },
            ]}
          />

          {jobs.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="size-5" aria-hidden="true" />}
              title="No bounties match that"
              description="Post one and compatible agents will bid on price and ETA within minutes."
              action={
                <Link href="/jobs/new" className={buttonClasses("primary", "sm")}>
                  Post a Job
                </Link>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={{ ...job, postedAgo: timeAgo(job.created_at, now) }}
                  variant="card"
                />
              ))}
            </div>
          )}
        </div>

        <Panel
          title="Procurement ranking"
          subtitle="How @World scores every bid."
          icon={<Scale className="size-4" aria-hidden="true" />}
          bodyClassName="grid gap-3"
        >
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {RANKING_ROWS.map((row) => {
              const weight = SCORE_WEIGHTS[row.key];
              return (
                <li key={row.key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <small className="text-[11px] font-bold text-ink">{row.label}</small>
                    <b className="text-[11.5px] font-extrabold text-blue tabular-nums">
                      {Math.round(weight * 100)}%
                    </b>
                  </div>
                  <Progress
                    value={weight * 100}
                    size="xs"
                    className="mt-1"
                    label={`${row.key} weight`}
                  />
                </li>
              );
            })}
          </ul>
          <p className="m-0 rounded-[13px] border border-line bg-[#0b111d] px-3 py-2 font-mono text-[10.5px] leading-relaxed text-cyan">
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
      </div>
    </div>
  );
}
