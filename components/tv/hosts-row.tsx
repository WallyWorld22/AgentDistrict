import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { Agent } from "@/lib/data/types";
import { cn, formatDuration } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { StatusPill } from "@/components/ui/status-pill";

export type HostEntry = {
  agent: Agent;
  /** Best gig to hire this host from; falls back to their passport. */
  hireHref: string;
  /** Price of that gig, when there is one. */
  hirePriceCents: number | null;
  hireLabel: string;
};

/**
 * "Hire from the stream" — the host row under a District TV player.
 *
 * The hire link resolves to the host's cheapest published gig (the page looks
 * it up through `listGigs({ agentHandle })`), because "Hire Otto" that lands on
 * a profile with nothing to buy is the wrong ending to a demo.
 */
export function HostsRow({
  hosts,
  className,
}: {
  hosts: HostEntry[];
  className?: string;
}) {
  if (hosts.length === 0) {
    return <p className="m-0 text-[12px] text-muted">No hosts are credited yet.</p>;
  }

  return (
    <ul className={cn("m-0 grid list-none gap-3 p-0 sm:grid-cols-2", className)}>
      {hosts.map(({ agent, hireHref, hirePriceCents, hireLabel }) => (
        <li
          key={agent.id}
          data-testid="tv-host"
          className="bg-inset-surface grid gap-2.5 rounded-[16px] border border-[#1c2638] p-3"
        >
          <div className="flex items-center gap-3">
            <AgentAvatar
              emoji={agent.avatar_emoji}
              handle={agent.handle}
              gradient={agent.avatar_gradient ?? undefined}
              name={agent.name}
              size="lg"
              status={agent.status}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/agents/${agent.handle}`}
                  className="truncate text-[14px] font-extrabold hover:text-blue"
                >
                  {agent.name}
                </Link>
                {agent.verified ? (
                  <BadgeCheck
                    className="size-3.5 shrink-0 text-blue"
                    aria-label="Verified agent"
                  />
                ) : null}
              </div>
              <small className="block truncate text-[11px] text-muted">
                {agent.tagline}
              </small>
              <StatusPill status={agent.status} size="sm" className="mt-1.5" />
            </div>
          </div>

          <dl className="m-0 grid grid-cols-3 gap-2">
            <Stat label="Rating" value={<Rating value={agent.rating_avg} size="sm" />} />
            <Stat
              label="Hires"
              value={
                <b className="text-[12px] font-extrabold tabular-nums">
                  {agent.jobs_completed.toLocaleString("en-US")}
                </b>
              }
            />
            <Stat
              label="Latency"
              value={
                <b className="text-[12px] font-extrabold tabular-nums">
                  {formatDuration(agent.avg_latency_sec)}
                </b>
              }
            />
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={hireHref}
              className={buttonClasses("primary", "sm", "flex-1 justify-center")}
            >
              {hireLabel}
            </Link>
            {hirePriceCents !== null ? (
              <Price
                cents={hirePriceCents}
                from
                tone="green"
                size="sm"
                free={agent.is_free}
              />
            ) : null}
            <Link
              href={`/agents/${agent.handle}`}
              className={buttonClasses("outline", "sm")}
            >
              Passport
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[11px] border border-[#1c2638] bg-[#0a1020] px-2 py-1.5 text-center">
      <dt className="m-0 text-[9px] font-extrabold tracking-[0.1em] text-muted uppercase">
        {label}
      </dt>
      <dd className="m-0 mt-0.5 flex justify-center">{value}</dd>
    </div>
  );
}
