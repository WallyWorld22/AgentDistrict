import * as React from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { StatusPill } from "@/components/ui/status-pill";
import type { AgentSummary } from "./types";

const UNIT: Record<string, string | undefined> = {
  per_run: "run",
  per_job: "job",
  per_hour: "hr",
  from: undefined,
};

export type AgentCardProps = {
  agent: AgentSummary;
  /** `card` is the directory tile; `row` is the compact trending/list row. */
  variant?: "card" | "row";
  /**
   * What the `row` variant puts at the end. `price` is the default; `rating`
   * is what the Trending Agents list uses.
   *
   * That list used to end in a "▲ +312" pill. The District measures no such
   * thing — there is no week-over-week anything to compare against — so the row
   * now ends in the agent's real rating, which is a number the Passport can
   * back up review by review.
   */
  trailing?: "price" | "rating";
  /** Trailing content (a Hire button). Replaces `trailing` in `row`. */
  action?: React.ReactNode;
  className?: string;
};

/**
 * Agent Passport card (BUILD_SPEC §4 `/agents`). Presentational only — links
 * to `/agents/[handle]`; the caller supplies the data.
 */
export function AgentCard({
  agent,
  variant = "card",
  trailing = "price",
  action,
  className,
}: AgentCardProps) {
  const unit = agent.pricing_model ? UNIT[agent.pricing_model] : undefined;
  const price =
    agent.starting_price_cents === null || agent.starting_price_cents === undefined ? null : (
      <Price
        cents={agent.starting_price_cents}
        free={agent.is_free}
        from={agent.pricing_model === "from"}
        unit={unit}
        size={variant === "row" ? "sm" : "md"}
        tone="green"
      />
    );

  if (variant === "row") {
    return (
      <Link
        href={`/agents/${agent.handle}`}
        className={cn(
          "flex items-center gap-2.5 rounded-[14px] px-2 py-2 transition-colors",
          "hover:bg-white/4 focus-visible:bg-white/4",
          className,
        )}
      >
        <AgentAvatar
          emoji={agent.avatar_emoji}
          handle={agent.handle}
          gradient={agent.avatar_gradient ?? undefined}
          name={agent.name}
          size="sm"
        />
        <span className="min-w-0 flex-1">
          <b className="flex items-center gap-1 truncate text-[12.5px] font-extrabold">
            {agent.name}
            {agent.verified ? (
              <BadgeCheck className="size-3.5 shrink-0 text-blue" aria-hidden="true" />
            ) : null}
          </b>
          <small className="block truncate text-[10.5px] text-muted">
            {agent.tagline ?? agent.category ?? ""}
          </small>
        </span>
        {action ??
          (trailing === "rating" && agent.rating_avg ? (
            <Rating
              value={agent.rating_avg}
              count={agent.rating_count ?? undefined}
              className="shrink-0"
            />
          ) : trailing === "rating" ? (
            <span className="shrink-0 text-[11px] text-muted">New here</span>
          ) : (
            price
          ))}
      </Link>
    );
  }

  return (
    <Link
      href={`/agents/${agent.handle}`}
      className={cn(
        "bg-card-surface group flex flex-col gap-3 rounded-card border border-line p-4",
        "shadow-[var(--shadow-card)] transition-[transform,border-color,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-[#415477] hover:shadow-[0_18px_44px_rgba(0,0,0,.28)]",
        className,
      )}
    >
      {/*
        The header wraps rather than truncating: a long status pill
        (COLLABORATING) next to a 4-up grid at 1440px used to squeeze the name
        into "Cop…". With `flex-wrap` plus a basis on the identity block the
        pill drops to its own line instead, and the name is never cut.
      */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <AgentAvatar
          emoji={agent.avatar_emoji}
          handle={agent.handle}
          gradient={agent.avatar_gradient ?? undefined}
          name={agent.name}
          size="md"
          status={agent.status}
        />
        <div className="min-w-0 flex-1 basis-[7.5rem]">
          <b className="flex items-center gap-1 text-[14px] leading-tight font-extrabold">
            <span className="truncate">{agent.name}</span>
            {agent.verified ? (
              <BadgeCheck className="size-4 shrink-0 text-blue" aria-hidden="true" />
            ) : null}
          </b>
          <small className="mt-0.5 block truncate text-[11px] text-muted">
            @{agent.handle}
          </small>
        </div>
        {agent.status ? <StatusPill status={agent.status} size="sm" /> : null}
      </div>

      {agent.tagline ? (
        <p className="m-0 line-clamp-2 text-[12px] leading-relaxed text-ink">
          {agent.tagline}
        </p>
      ) : null}

      {agent.skills && agent.skills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {agent.skills.slice(0, 3).map((skill) => (
            <Pill key={skill} size="sm">
              {skill}
            </Pill>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {agent.rating_avg ? (
          <Rating value={agent.rating_avg} count={agent.rating_count ?? undefined} />
        ) : (
          <span className="text-[11px] text-muted">New to the District</span>
        )}
        {action ?? price}
      </div>
    </Link>
  );
}
