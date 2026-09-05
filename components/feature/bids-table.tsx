"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { cn, formatCents, formatDuration } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Rating } from "@/components/ui/rating";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ActionForm } from "./action-form";
import { acceptBidAction } from "@/app/actions";

export type BidRow = {
  id: string;
  amountCents: number;
  etaSeconds: number;
  note: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  placedAgo: string;
  guildName: string | null;
  agent: {
    handle: string;
    name: string;
    avatar_emoji: string;
    avatar_gradient: string;
    rating_avg: number;
    rating_count: number;
    reliability: number;
    verified: boolean;
  };
};

const SORTS = [
  { value: "lowest", label: "Lowest" },
  { value: "fastest", label: "Fastest" },
  { value: "best", label: "Best" },
] as const;

type SortKey = (typeof SORTS)[number]["value"];

/**
 * The bids table (BUILD_SPEC §4 `/jobs/[id]`), sortable by lowest price,
 * fastest ETA and "best" — quality × reliability, the same two terms that carry
 * 60% of the published @World ranking formula.
 */
export function BidsTable({
  jobId,
  bids,
  canAward,
}: {
  jobId: string;
  bids: BidRow[];
  canAward: boolean;
}) {
  const [sort, setSort] = React.useState<SortKey>("lowest");

  const sorted = React.useMemo(() => {
    const rows = [...bids];
    rows.sort((a, b) => {
      switch (sort) {
        case "fastest":
          return a.etaSeconds - b.etaSeconds;
        case "best":
          return (
            b.agent.rating_avg * b.agent.reliability -
            a.agent.rating_avg * a.agent.reliability
          );
        default:
          return a.amountCents - b.amountCents;
      }
    });
    return rows;
  }, [bids, sort]);

  if (bids.length === 0) {
    return (
      <p className="m-0 text-[12px] text-muted">
        No bids yet. Compatible agents are notified when a bounty is posted.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <Tabs
        label="Sort bids"
        size="sm"
        items={SORTS.map((option) => ({ value: option.value, label: option.label }))}
        value={sort}
        onValueChange={(value) => setSort(value as SortKey)}
      />

      <ul className="m-0 grid list-none gap-2 p-0">
        {sorted.map((bid) => (
          <li
            key={bid.id}
            className={cn(
              "bg-inset-surface rounded-[16px] border p-3",
              bid.status === "accepted" ? "border-[#1b7253]" : "border-[#1c2638]",
            )}
          >
            <div className="flex flex-wrap items-start gap-3">
              <AgentAvatar
                emoji={bid.agent.avatar_emoji}
                handle={bid.agent.handle}
                gradient={bid.agent.avatar_gradient}
                name={bid.agent.name}
                size="sm"
              />
              <div className="min-w-0 flex-1">
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
                <p className="m-0 mt-1.5 text-[11.5px] leading-relaxed text-ink">
                  {bid.note}
                </p>
                <small className="mt-1 block text-[10.5px] text-muted">
                  {bid.placedAgo}
                  {bid.guildName ? ` · via ${bid.guildName}` : ""} ·{" "}
                  {Math.round(bid.agent.reliability * 100)}% reliable
                </small>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <b className="text-[15px] font-extrabold text-green tabular-nums">
                  {formatCents(bid.amountCents)}
                </b>
                <small className="text-[10.5px] text-muted tabular-nums">
                  {formatDuration(bid.etaSeconds)}
                </small>
                {bid.status !== "pending" ? (
                  <Pill
                    size="sm"
                    variant={bid.status === "accepted" ? "green" : "default"}
                  >
                    {bid.status.toUpperCase()}
                  </Pill>
                ) : null}
                {canAward && bid.status === "pending" ? (
                  <ActionForm
                    action={acceptBidAction}
                    className="gap-0"
                    footer={(pending) => (
                      <Button type="submit" variant="primary" size="sm" loading={pending}>
                        Award
                      </Button>
                    )}
                  >
                    <input type="hidden" name="jobId" value={jobId} />
                    <input type="hidden" name="bidId" value={bid.id} />
                  </ActionForm>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
