import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AgentAvatar, AvatarStack } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import type { GuildSummary } from "./types";

export type GuildCardProps = {
  guild: GuildSummary;
  /** `row` matches the Home "Top Guilds" list; `card` is the /guilds tile. */
  variant?: "row" | "card";
  /** Where "Hire Team" points. Defaults to the guild page. */
  hireHref?: string;
  className?: string;
};

const MAX_AVATARS = 4;

/**
 * Guild (agent team) card — stacked member avatars + pipeline + Hire Team,
 * per docs/reference/desktop-home.png "Top Guilds". Presentational only.
 */
export function GuildCard({
  guild,
  variant = "row",
  hireHref,
  className,
}: GuildCardProps) {
  const href = `/guilds/${guild.slug}`;
  const shown = guild.members.slice(0, MAX_AVATARS);
  const overflow = Math.max(0, guild.members.length - MAX_AVATARS);

  const avatars = (
    <AvatarStack
      overflow={overflow || undefined}
      /*
       * In the `row` variant the stack (4 avatars ≈ 148px) plus "Hire Team"
       * (≈78px) leaves the guild name under 90px on a phone, which truncates
       * it to "Local G…". Below `sm` only the first two avatars are shown so
       * the name always survives; the full stack returns at ≥640px.
       */
      className={
        variant === "row"
          ? "[&>*:nth-child(n+3)]:hidden sm:[&>*:nth-child(n+3)]:inline-grid"
          : undefined
      }
    >
      {shown.map((member) => (
        <AgentAvatar
          key={member.handle}
          emoji={member.avatar_emoji}
          handle={member.handle}
          gradient={member.avatar_gradient ?? undefined}
          name={member.name}
          size="sm"
          round
        />
      ))}
    </AvatarStack>
  );

  if (variant === "row") {
    return (
      <div
        className={cn(
          "bg-inset-surface flex items-center gap-3 rounded-[16px] border border-[#1c2638] p-2.5",
          className,
        )}
      >
        {avatars}
        <div className="min-w-0 flex-1">
          <Link
            href={href}
            className="ad-hit block truncate text-[12.5px] font-extrabold hover:text-blue"
          >
            {guild.name}
          </Link>
          <small className="block truncate text-[10.5px] text-muted">
            {guild.pipeline ?? guild.description ?? ""}
          </small>
          {guild.rating_avg ? (
            <Rating
              value={guild.rating_avg}
              count={guild.rating_count ?? undefined}
              className="mt-0.5"
            />
          ) : null}
        </div>
        <Link
          href={hireHref ?? href}
          className={buttonClasses("primary", "sm", "shrink-0")}
        >
          Hire Team
        </Link>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card-surface flex flex-col gap-3 rounded-card border border-line p-4",
        "shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={href}
            className="ad-hit block truncate text-[15px] font-extrabold hover:text-blue"
          >
            {guild.name}
          </Link>
          {guild.rating_avg ? (
            <Rating
              value={guild.rating_avg}
              count={guild.rating_count ?? undefined}
              className="mt-1"
            />
          ) : null}
        </div>
        {guild.status ? (
          <Pill variant={guild.status === "available" ? "green" : "yellow"} size="sm">
            {guild.status.toUpperCase()}
          </Pill>
        ) : null}
      </div>

      {avatars}

      {guild.pipeline ? (
        <p className="m-0 text-[11.5px] leading-relaxed text-ink">{guild.pipeline}</p>
      ) : guild.description ? (
        <p className="m-0 line-clamp-2 text-[12px] leading-relaxed text-ink">
          {guild.description}
        </p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {guild.starting_price_cents ? (
          <span className="leading-tight">
            <small className="block text-[10.5px] text-muted">Team rate from</small>
            <Price cents={guild.starting_price_cents} size="md" tone="green" />
          </span>
        ) : (
          <span className="text-[11px] text-muted">
            {guild.hires_count ?? 0} hires
          </span>
        )}
        <Link href={hireHref ?? href} className={buttonClasses("primary", "sm")}>
          Hire Team
        </Link>
      </div>
    </div>
  );
}
