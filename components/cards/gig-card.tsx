import * as React from "react";
import Link from "next/link";
import { cn, formatDuration } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import type { GigSummary } from "./types";

/** Deterministic cover gradient per gig slug — no randomness in render. */
const COVERS = [
  "linear-gradient(135deg,#1b3a6b,#2f7fb8 55%,#123049)",
  "linear-gradient(135deg,#3a1b6b,#a13fd0 55%,#2a1147)",
  "linear-gradient(135deg,#0f3f42,#2fa89a 55%,#0b2a2c)",
  "linear-gradient(135deg,#5a2145,#e0568f 55%,#2b1024)",
  "linear-gradient(135deg,#1d2a63,#4a5cd0 55%,#111739)",
  "linear-gradient(135deg,#4a3410,#d19a2e 55%,#2a1d08)",
] as const;

export function coverForSlug(slug: string): string {
  let hash = 2166136261;
  for (let i = 0; i < slug.length; i += 1) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return COVERS[Math.abs(hash) % COVERS.length];
}

export type GigCardProps = {
  gig: GigSummary;
  /** `card` is the browse tile; `compact` drops the cover art. */
  variant?: "card" | "compact";
  className?: string;
};

/**
 * Featured / browse gig tile (docs/reference/desktop-home.png "Featured Gigs").
 * Presentational only — links to `/gigs/[slug]`.
 */
export function GigCard({ gig, variant = "card", className }: GigCardProps) {
  const { agent } = gig;

  return (
    <Link
      href={`/gigs/${gig.slug}`}
      className={cn(
        "bg-card-surface flex flex-col rounded-[18px] border border-line",
        "shadow-[var(--shadow-card)] transition-[transform,border-color,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-[#415477] hover:shadow-[0_18px_44px_rgba(0,0,0,.28)]",
        variant === "card" ? "p-2.5" : "p-3.5",
        className,
      )}
    >
      {variant === "card" ? (
        <div
          className="relative mb-3 grid h-[104px] place-items-center overflow-hidden rounded-[13px] border border-[#26344e]"
          style={{ backgroundImage: coverForSlug(gig.slug) }}
          aria-hidden="true"
        >
          <span className="text-[40px] drop-shadow-[0_8px_18px_rgba(0,0,0,.55)]">
            {agent.avatar_emoji}
          </span>
          <span className="absolute inset-0 bg-gradient-to-t from-[#080d17]/70 to-transparent" />
          <span className="absolute top-2 right-2">
            <AgentAvatar
              emoji={agent.avatar_emoji}
              handle={agent.handle}
              gradient={agent.avatar_gradient ?? undefined}
              name={agent.name}
              size="xs"
            />
          </span>
        </div>
      ) : null}

      <b className="line-clamp-2 text-[13.5px] leading-[1.3] font-extrabold">
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

      {gig.tags && gig.tags.length > 0 && variant === "compact" ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {gig.tags.slice(0, 3).map((tag) => (
            <Pill key={tag} size="sm">
              {tag}
            </Pill>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <span className="leading-tight">
          <small className="block text-[10.5px] text-muted">Starting at</small>
          <Price cents={gig.starting_price_cents} size="lg" tone="green" />
        </span>
        {gig.delivery_seconds ? (
          <small className="shrink-0 text-[10.5px] text-muted">
            {formatDuration(gig.delivery_seconds)}
          </small>
        ) : null}
      </div>
    </Link>
  );
}
