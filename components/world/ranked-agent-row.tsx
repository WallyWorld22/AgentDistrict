import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { RankedAgent } from "@/lib/world";
import { cn, formatCents, formatDuration } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Rating } from "@/components/ui/rating";
import { StatusPill } from "@/components/ui/status-pill";
import { HireAgentButton } from "./world-buttons";

export type RankedAgentRowProps = {
  entry: RankedAgent;
  rank: number;
  outcome: string;
  /** The top-ranked row gets the brighter frame. */
  featured?: boolean;
};

/**
 * One agent on the @World shortlist: why it was picked, what it would cost,
 * how long it would take, and a button that hires it on the spot.
 */
export function RankedAgentRow({ entry, rank, outcome, featured }: RankedAgentRowProps) {
  const { agent } = entry;

  return (
    <li
      className={cn(
        "rounded-[16px] border p-3",
        featured
          ? "border-[#2d3f6b] bg-[#0e1730] shadow-[0_10px_30px_rgba(20,40,110,.28)]"
          : "bg-inset-surface border-[#1c2638]",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full border border-[#263753] bg-[#121e36] text-[10.5px] font-extrabold text-blue tabular-nums"
          aria-hidden="true"
        >
          {rank}
        </span>
        <AgentAvatar
          emoji={agent.avatar_emoji}
          handle={agent.handle}
          gradient={agent.avatar_gradient}
          name={agent.name}
          size="sm"
          status={agent.status}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/agents/${agent.handle}`}
              className="flex items-center gap-1 text-[13px] font-extrabold hover:text-blue"
            >
              {agent.name}
              {agent.verified ? (
                <BadgeCheck className="size-3.5 text-blue" aria-hidden="true" />
              ) : null}
            </Link>
            <Rating value={agent.rating_avg} count={agent.rating_count} />
            <StatusPill status={agent.status} size="sm" />
          </div>

          <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-ink">{agent.tagline}</p>

          <ul className="m-0 mt-1.5 grid list-none gap-0.5 p-0">
            {entry.reasons.map((reason) => (
              <li key={reason} className="text-[10.5px] text-muted">
                · {reason}
              </li>
            ))}
          </ul>

          <div className="mt-2 flex items-center gap-2">
            <Progress
              value={entry.score * 100}
              size="xs"
              className="max-w-[260px]"
              label={`${agent.name} score`}
            />
            <small className="text-[10px] font-extrabold text-blue tabular-nums">
              {Math.round(entry.score * 100)} score
            </small>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <b className="text-[15px] font-extrabold text-green tabular-nums">
            {agent.is_free && entry.estimateCents === 0
              ? "FREE"
              : formatCents(entry.estimateCents)}
          </b>
          <small className="text-[10.5px] text-muted tabular-nums">
            {formatDuration(entry.etaSeconds)}
          </small>
          <HireAgentButton
            handle={agent.handle}
            name={agent.name}
            outcome={outcome}
            price={formatCents(entry.estimateCents)}
          />
        </div>
      </div>
    </li>
  );
}
