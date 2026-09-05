import * as React from "react";
import Link from "next/link";
import { ChevronRight, Hexagon } from "lucide-react";
import { cn, formatCents } from "@/lib/utils";
import { Pill } from "@/components/ui/pill";
import { STAT_TONES, type StatTone } from "@/components/ui/stat-card";
import type { JobSummary } from "./types";

/** Category → tile tint, so a jobs list reads as a colour-coded queue. */
const CATEGORY_TONE: Record<string, StatTone> = {
  research: "cyan",
  development: "purple",
  marketing: "pink",
  home_services: "yellow",
  data: "blue",
  operations: "green",
  creative: "pink",
  entertainment: "red",
  finance: "green",
  legal: "blue",
  support: "cyan",
};

const STATUS_VARIANT = {
  open: "green",
  awarded: "blue",
  in_progress: "purple",
  completed: "default",
  cancelled: "red",
} as const;

export type JobCardProps = {
  job: JobSummary;
  /** `row` matches the Home "Open Jobs" list; `card` is the /jobs tile. */
  variant?: "row" | "card";
  className?: string;
};

/**
 * Job / bounty entry (docs/reference/desktop-home.png "Open Jobs").
 * Presentational only — links to `/jobs/[id]`.
 */
export function JobCard({ job, variant = "row", className }: JobCardProps) {
  const tone = CATEGORY_TONE[job.category ?? ""] ?? "default";
  const meta = [
    `${formatCents(job.budget_cents, { compact: true })} budget`,
    job.bidCount === undefined
      ? null
      : `${job.bidCount} ${job.bidCount === 1 ? "bid" : "bids"}`,
    job.postedAgo,
  ]
    .filter(Boolean)
    .join(" • ");

  if (variant === "row") {
    return (
      <Link
        href={`/jobs/${job.id}`}
        className={cn(
          "bg-inset-surface flex items-center gap-3 rounded-[16px] border border-[#1c2638] p-2.5",
          "transition-[border-color,transform] duration-200 ease-out",
          "hover:-translate-y-px hover:border-[#3d4d73]",
          className,
        )}
      >
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-[13px] border",
            STAT_TONES[tone],
          )}
          aria-hidden="true"
        >
          <Hexagon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[12.5px] font-extrabold">{job.title}</b>
          <small className="block truncate text-[11px] text-muted tabular-nums">
            {meta}
          </small>
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-[#66728a]"
          aria-hidden="true"
        />
      </Link>
    );
  }

  return (
    <Link
      href={`/jobs/${job.id}`}
      className={cn(
        "bg-card-surface flex flex-col gap-2.5 rounded-card border border-line p-4",
        "shadow-[var(--shadow-card)] transition-[transform,border-color,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-[#415477] hover:shadow-[0_18px_44px_rgba(0,0,0,.28)]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-[15px] border",
            STAT_TONES[tone],
          )}
          aria-hidden="true"
        >
          <Hexagon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-[14px] leading-tight font-extrabold text-balance">
            {job.title}
          </b>
          <small className="mt-1 block text-[11px] text-muted tabular-nums">
            {meta}
          </small>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {job.status ? (
          <Pill variant={STATUS_VARIANT[job.status] ?? "default"} size="sm">
            {job.status.replace("_", " ").toUpperCase()}
          </Pill>
        ) : (
          <span />
        )}
        <span className="text-[12px] font-extrabold text-blue">View bids →</span>
      </div>
    </Link>
  );
}
