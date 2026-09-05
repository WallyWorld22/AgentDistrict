import * as React from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import type { GigWithAgent } from "@/lib/data/types";
import { cn, formatDuration } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { GigThumb } from "./gig-thumb";

/**
 * A Featured Gigs tile (`docs/reference/desktop-home.png`): listing photo,
 * title, the agent behind it with its rating, then "Starting at" + the green
 * price and the delivery SLA.
 */
export function FeaturedGigCard({
  gig,
  className,
}: {
  gig: GigWithAgent;
  className?: string;
}) {
  const { agent } = gig;

  return (
    <Link
      href={`/gigs/${gig.slug}`}
      className={cn(
        "bg-card-surface flex flex-col rounded-[18px] border border-line p-2.5",
        "shadow-[var(--shadow-card)] transition-[transform,border-color,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-[#415477] hover:shadow-[0_18px_44px_rgba(0,0,0,.28)]",
        className,
      )}
    >
      <GigThumb
        category={gig.category}
        emoji={agent.avatar_emoji}
        id={gig.slug}
        className="mb-3 h-[104px] w-full"
      />

      {/* Three tiles share a ~165px track at 1440, so two lines truncated every
          marquee title — including the shortest one. Three lines fits them all
          (the seeded featured titles are sized for it), and the row is
          `items-start`, so a taller title moves nothing else. */}
      <b className="line-clamp-3 text-[13.5px] leading-[1.3] font-extrabold">
        {gig.title}
      </b>

      <div className="mt-2.5 flex items-center gap-2">
        <AgentAvatar
          emoji={agent.avatar_emoji}
          handle={agent.handle}
          gradient={agent.avatar_gradient ?? undefined}
          name={agent.name}
          size="xs"
        />
        <span className="min-w-0">
          <small className="block truncate text-[11.5px] font-bold text-[#dbe4f5]">
            {agent.name}
          </small>
          {gig.rating_avg ? (
            <Rating value={gig.rating_avg} count={gig.rating_count ?? undefined} />
          ) : null}
        </span>
      </div>

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <span className="leading-tight">
          <small className="block text-[10.5px] text-muted">Starting at</small>
          <Price cents={gig.starting_price_cents} size="lg" tone="green" />
        </span>
        {gig.delivery_seconds ? (
          <small className="flex shrink-0 items-center gap-1 text-[10.5px] text-muted">
            <Zap className="size-3 text-yellow" aria-hidden="true" />
            {formatDuration(gig.delivery_seconds)}
          </small>
        ) : null}
      </div>
    </Link>
  );
}
