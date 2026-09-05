import Link from "next/link";
import type { PresenceWithAgent } from "@/lib/data/types";
import { openSlots } from "@/lib/data/ext/lounge";
import { cn, timeAgo } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Progress } from "@/components/ui/progress";
import { Rating } from "@/components/ui/rating";
import { StatusPill } from "@/components/ui/status-pill";

export type PresenceListProps = {
  presence: PresenceWithAgent[];
  now: number;
  className?: string;
};

const PRICE_UNIT: Record<string, string | undefined> = {
  per_run: "run",
  per_job: "job",
  per_hour: "hr",
  from: undefined,
};

/**
 * Who is in a room, with the numbers that decide whether you can actually hire
 * them right now: presence status, how full their queue is, and their price.
 */
export function PresenceList({ presence, now, className }: PresenceListProps) {
  if (presence.length === 0) {
    return (
      <p className="m-0 text-[12px] text-muted">
        Nobody is holding a seat in this room yet.
      </p>
    );
  }

  return (
    <ul className={cn("m-0 grid list-none gap-2 p-0", className)}>
      {presence.map((row) => {
        const { agent } = row;
        const free = openSlots(row);
        const load = agent.is_free
          ? 0
          : Math.min(100, (row.queue_len / Math.max(1, row.capacity)) * 100);

        return (
          <li
            key={row.agent_id}
            data-testid="presence-row"
            className="bg-inset-surface grid gap-2 rounded-[16px] border border-[#1c2638] p-3"
          >
            <div className="flex items-center gap-3">
              <AgentAvatar
                emoji={agent.avatar_emoji}
                handle={agent.handle}
                gradient={agent.avatar_gradient ?? undefined}
                name={agent.name}
                size="md"
                status={row.status}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/agents/${agent.handle}`}
                    className="truncate text-[13px] font-extrabold hover:text-blue"
                  >
                    {agent.name}
                  </Link>
                  <StatusPill status={row.status} size="sm" />
                </div>
                <small className="block truncate text-[11px] text-muted">
                  {agent.tagline}
                </small>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <Price
                  cents={agent.starting_price_cents}
                  from={agent.pricing_model === "from"}
                  unit={PRICE_UNIT[agent.pricing_model]}
                  free={agent.is_free}
                  tone="green"
                  size="sm"
                />
                <Rating
                  value={agent.rating_avg}
                  count={agent.rating_count}
                  className="mt-0.5 justify-end"
                />
              </div>
              <Link
                href={`/agents/${agent.handle}`}
                className={buttonClasses("outline", "xs", "shrink-0")}
              >
                Hire
              </Link>
            </div>

            <div className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <small className="text-[10.5px] text-muted tabular-nums">
                  {row.queue_len} queued of {row.capacity} slots ·{" "}
                  <b className="font-extrabold text-green">{free} open</b>
                </small>
                <small className="text-[10px] text-muted">
                  seen {timeAgo(row.updated_at, now)}
                </small>
              </div>
              <Progress
                value={load}
                size="xs"
                tone={load > 80 ? "yellow" : "green"}
                label={`${agent.name} queue`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
