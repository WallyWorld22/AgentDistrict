"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import {
  BID_SORTS,
  scoreBid,
  sortBids,
  type BidSort,
  type JobTerms,
  type ScorableBid,
} from "@/lib/data/ext/jobs";
import { cn, formatCents, formatDuration } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { Rating } from "@/components/ui/rating";
import { Tabs } from "@/components/ui/tabs";
import { HireBidButton } from "./hire-bid-button";

export type BidPanelRow = ScorableBid & {
  id: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  note: string;
  placedAgo: string;
  agent: ScorableBid["agent"] & {
    handle: string;
    name: string;
    avatar_emoji: string;
    avatar_gradient: string;
  };
};

export type BidsPanelProps = {
  jobId: string;
  job: JobTerms;
  bids: BidPanelRow[];
  /** The signed-in buyer posted this bounty and it is still open. */
  canAward: boolean;
};

/**
 * The bids table (BUILD_SPEC §4 `/jobs/[id]`), sortable by lowest price,
 * fastest ETA and best fit.
 *
 * "Best fit" is the published procurement formula applied to the *bid* rather
 * than the agent's list price — `scoreBid` in `lib/data/ext/jobs.ts` — and the
 * score bar and the reasons under each row are that same calculation, so a
 * buyer can see why the order came out the way it did.
 */
export function BidsPanel({ jobId, job, bids, canAward }: BidsPanelProps) {
  const [sort, setSort] = React.useState<BidSort>("best");

  const rows = React.useMemo(() => {
    const accepted = bids.filter((bid) => bid.status === "accepted");
    const live = bids.filter((bid) => bid.status === "pending");
    const rest = bids.filter(
      (bid) => bid.status !== "accepted" && bid.status !== "pending",
    );
    return [...accepted, ...sortBids(live, sort, job), ...sortBids(rest, sort, job)];
  }, [bids, sort, job]);

  if (bids.length === 0) {
    return (
      <p className="m-0 text-[12px] leading-relaxed text-muted">
        No bids yet. Every agent whose skills match this brief was notified when it
        went up — the first offers usually land within a minute.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <Tabs
        label="Sort bids"
        size="sm"
        items={BID_SORTS.map((option) => ({ value: option.value, label: option.label }))}
        value={sort}
        onValueChange={(value) => setSort(value as BidSort)}
      />

      <ul className="m-0 grid list-none gap-2 p-0">
        {rows.map((bid, index) => {
          const { score, reasons } = scoreBid(bid, job);
          const won = bid.status === "accepted";
          return (
            <li
              key={bid.id}
              data-testid="bid-row"
              className={cn(
                "rounded-[16px] border p-3",
                won
                  ? "border-[#1b7253] bg-[#0c1f1a]"
                  : bid.status === "pending"
                    ? "bg-inset-surface border-[#1c2638]"
                    : "border-[#161f30] bg-[#0a0f1a] opacity-70",
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-full border border-[#263753] bg-[#121e36] text-[10.5px] font-extrabold text-blue tabular-nums"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <AgentAvatar
                  emoji={bid.agent.avatar_emoji}
                  handle={bid.agent.handle}
                  gradient={bid.agent.avatar_gradient}
                  name={bid.agent.name}
                  size="sm"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={`/agents/${bid.agent.handle}`}
                      className="flex items-center gap-1 text-[12.5px] font-extrabold hover:text-blue"
                    >
                      {bid.agent.name}
                      {bid.agent.verified ? (
                        <BadgeCheck className="size-3.5 text-blue" aria-hidden="true" />
                      ) : null}
                    </Link>
                    <Rating value={bid.agent.rating_avg} count={bid.agent.rating_count} />
                    {bid.status !== "pending" ? (
                      <Pill size="sm" variant={won ? "green" : "default"}>
                        {bid.status.toUpperCase()}
                      </Pill>
                    ) : null}
                  </div>

                  <p className="m-0 mt-1.5 text-[11.5px] leading-relaxed text-ink">
                    {bid.note}
                  </p>

                  <ul className="m-0 mt-1.5 grid list-none gap-0.5 p-0">
                    {reasons.map((reason) => (
                      <li key={reason} className="text-[10.5px] text-muted">
                        · {reason}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2 flex items-center gap-2">
                    <Progress
                      value={score * 100}
                      size="xs"
                      tone={won ? "green" : "primary"}
                      className="max-w-[240px]"
                      label={`${bid.agent.name} fit score`}
                    />
                    <small className="text-[10px] font-extrabold text-blue tabular-nums">
                      {Math.round(score * 100)} fit
                    </small>
                  </div>

                  <small className="mt-1 block text-[10px] text-muted">
                    {bid.placedAgo}
                    {bid.guild?.name ? ` · via ${bid.guild.name}` : ""}
                  </small>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <b
                    data-testid="bid-amount"
                    className="text-[15px] font-extrabold text-green tabular-nums"
                  >
                    {formatCents(bid.amount_cents)}
                  </b>
                  <small className="text-[10.5px] text-muted tabular-nums">
                    {formatDuration(bid.eta_seconds)}
                  </small>
                  {bid.status === "pending" ? (
                    <HireBidButton
                      jobId={jobId}
                      bidId={bid.id}
                      agentHandle={bid.agent.handle}
                      agentName={bid.agent.name}
                      price={formatCents(bid.amount_cents)}
                      canAward={canAward}
                      size="sm"
                    />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
