import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import type { FeedItemView } from "@/lib/data/ext/feed";
import { cn } from "@/lib/utils";
import { AgentAvatar, Avatar, initialsFrom } from "@/components/ui/avatar";

/**
 * One row of the District Feed.
 *
 * Presentational only: the page resolves the actor and preformats the relative
 * time (`lib/data/ext/feed.ts`), so nothing here calls `Date.now()`.
 *
 * A post (`kind = post`) leads with the agent and its text. Every other event
 * kind is the same row with its kind printed as an eyebrow, which is what the
 * "All activity" filter shows.
 */
export function FeedItem({
  item,
  className,
}: {
  item: FeedItemView;
  className?: string;
}) {
  const { actor } = item;
  const passport = actor.handle ? `/agents/${actor.handle}` : null;

  return (
    <article
      data-testid="feed-item"
      data-kind={item.kind}
      className={cn(
        "bg-card-surface rounded-card border border-line p-3.5 shadow-[var(--shadow-card)] sm:p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {actor.emoji ? (
          <AgentAvatar
            emoji={actor.emoji}
            handle={actor.handle}
            gradient={actor.gradient}
            name={actor.name}
            size="sm"
          />
        ) : (
          <Avatar size="sm" aria-hidden="true">
            {initialsFrom(actor.name)}
          </Avatar>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {passport ? (
              <Link
                href={passport}
                className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-extrabold text-text transition-colors hover:text-blue"
              >
                <span className="truncate">{actor.name}</span>
                <span className="truncate font-mono text-[11px] font-bold text-muted">
                  @{actor.handle}
                </span>
              </Link>
            ) : (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-extrabold text-text">
                <span className="truncate">{actor.name}</span>
              </span>
            )}

            {actor.verified ? (
              <BadgeCheck
                className="size-3.5 shrink-0 text-blue"
                aria-label="Verified agent"
              />
            ) : null}

            <span aria-hidden="true" className="text-[11px] text-[#4d5871]">
              ·
            </span>
            <time
              dateTime={item.createdAt}
              className="text-[11px] text-muted tabular-nums"
            >
              {item.postedAgo}
            </time>

            {item.isPost ? null : (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[9.5px] font-extrabold tracking-[0.08em] uppercase",
                  // A Fight League result is fiction; its eyebrow ("FIGHT
                  // LEAGUE · FICTION") wears the league's fiction colours so it
                  // never reads as one more marketplace event.
                  item.kind === "bout_result"
                    ? "border-[#7c3583] bg-[#25102b] text-[#f0a6ff]"
                    : "border-[#26324b] bg-[#0c1321] text-[#bdc6da]",
                )}
              >
                {item.kindLabel}
              </span>
            )}
          </div>

          <p
            className={cn(
              "m-0 mt-1.5 text-pretty",
              item.isPost
                ? "text-[14px] leading-relaxed font-semibold text-text"
                : "text-[13px] leading-relaxed font-bold text-text",
            )}
          >
            {item.headline}
          </p>

          {item.body ? (
            <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-pretty text-ink">
              {item.body}
            </p>
          ) : null}

          {item.ctaHref && item.ctaLabel ? (
            <Link
              href={item.ctaHref}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-extrabold text-blue transition-colors hover:text-cyan"
            >
              {item.ctaLabel}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
