import Link from "next/link";
import { Clock, Hexagon, Users } from "lucide-react";
import type { AgentCategory } from "@/lib/data/types";
import type { BoardJob } from "@/lib/data/ext/jobs";
import { JOB_STATUS_LABELS, JOB_STATUS_VARIANT } from "@/lib/data/ext/jobs";
import { cn, formatCents, formatDuration, timeAgo } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { STAT_TONES, type StatTone } from "@/components/ui/stat-card";
import { HireBidButton } from "./hire-bid-button";

/** Category → tile tint, so the board reads as a colour-coded queue. */
const CATEGORY_TONE: Record<AgentCategory, StatTone> = {
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

export type JobBoardCardProps = {
  job: BoardJob;
  /** Injected `districtNow()` — cards never call `Date.now()` themselves. */
  now: number;
  /** The signed-in buyer's profile id, to tell "your bounty" apart. */
  viewerId?: string;
};

/**
 * One bounty on `/jobs` — the reference's "Post a job → 3 Bids → Hire" card
 * (`docs/reference/mobile-screens.png`), at desktop density.
 *
 * The card is deliberately *not* one big link: the title, each bidding agent
 * and each Hire button are separate targets, which is what makes the board
 * usable without opening every bounty.
 */
export function JobBoardCard({ job, now, viewerId }: JobBoardCardProps) {
  const tone = CATEGORY_TONE[job.category] ?? "default";
  const mine = viewerId !== undefined && job.poster_id === viewerId;
  const canAward = mine && job.status === "open";
  const closed = job.status !== "open";

  return (
    <article
      className={cn(
        "bg-card-surface flex flex-col gap-3 rounded-card border border-line p-4",
        "shadow-[var(--shadow-card)] transition-[border-color] duration-200 ease-out",
        "hover:border-[#33415f]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-[14px] border",
            STAT_TONES[tone],
          )}
          aria-hidden="true"
        >
          <Hexagon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[14px] leading-tight font-extrabold text-balance">
            <Link href={`/jobs/${job.id}`} className="hover:text-blue">
              {job.title}
            </Link>
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted tabular-nums">
            <b className="text-[12px] font-extrabold text-green">
              {formatCents(job.budget_cents, { compact: true })}
            </b>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" aria-hidden="true" />
              {job.bidCount} {job.bidCount === 1 ? "bid" : "bids"}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {formatDuration(job.deadline_seconds)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{timeAgo(job.created_at, now)}</span>
          </div>
        </div>
        <Pill variant={JOB_STATUS_VARIANT[job.status]} size="sm">
          {JOB_STATUS_LABELS[job.status]}
        </Pill>
      </div>

      {closed && job.winner ? (
        <div className="rounded-[16px] border border-[#1b7253] bg-[#0c1f1a] p-2.5">
          <small className="block text-[9.5px] font-extrabold tracking-[0.06em] text-green uppercase">
            Awarded
          </small>
          <div className="mt-1 flex items-center gap-2">
            <AgentAvatar
              emoji={job.winner.agent.avatar_emoji}
              handle={job.winner.agent.handle}
              gradient={job.winner.agent.avatar_gradient}
              name={job.winner.agent.name}
              size="xs"
            />
            <Link
              href={`/agents/${job.winner.agent.handle}`}
              className="min-w-0 flex-1 truncate text-[12px] font-extrabold hover:text-blue"
            >
              {job.winner.agent.name}
            </Link>
            <b className="text-[12px] font-extrabold text-green tabular-nums">
              {formatCents(job.winner.amount_cents)}
            </b>
          </div>
        </div>
      ) : job.bids.length > 0 ? (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {job.bids.map((bid) => (
            <li
              key={bid.id}
              className="bg-inset-surface flex items-center gap-2 rounded-[14px] border border-[#1c2638] px-2.5 py-2"
            >
              <AgentAvatar
                emoji={bid.agent.avatar_emoji}
                handle={bid.agent.handle}
                gradient={bid.agent.avatar_gradient}
                name={bid.agent.name}
                size="xs"
              />
              <span className="min-w-0 flex-1">
                <Link
                  href={`/agents/${bid.agent.handle}`}
                  className="block truncate text-[11.5px] font-extrabold hover:text-blue"
                >
                  {bid.agent.name}
                </Link>
                <small className="block text-[10px] text-muted tabular-nums">
                  {formatCents(bid.amount_cents)} · {formatDuration(bid.eta_seconds)}
                </small>
              </span>
              <HireBidButton
                jobId={job.id}
                bidId={bid.id}
                agentHandle={bid.agent.handle}
                agentName={bid.agent.name}
                price={formatCents(bid.amount_cents)}
                canAward={canAward}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="bg-inset-surface m-0 rounded-[14px] border border-[#1c2638] px-3 py-2.5 text-[11px] text-muted">
          No bids yet — compatible agents were notified when this went up.
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
        {mine ? (
          <Pill variant="purple" size="sm">
            Your bounty
          </Pill>
        ) : (
          <span className="text-[10.5px] text-muted">
            {job.bidCount > job.bids.length && !closed
              ? `+${job.bidCount - job.bids.length} more bids`
              : ""}
          </span>
        )}
        <Link
          href={`/jobs/${job.id}`}
          className="text-[12px] font-extrabold text-blue hover:text-cyan"
        >
          {closed ? "See the award →" : "View all bids →"}
        </Link>
      </div>
    </article>
  );
}
