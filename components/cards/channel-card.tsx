import * as React from "react";
import Link from "next/link";
import { Eye, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { LiveDot } from "@/components/ui/live-dot";
import { Pill } from "@/components/ui/pill";
import type { ChannelSummary } from "./types";

const DEFAULT_THUMB = "linear-gradient(150deg,#171b34,#321d4b 52%,#0a0f19)";

export type ChannelCardProps = {
  channel: ChannelSummary;
  /** `card` is the TV grid tile; `row` is the compact Home/TV strip entry. */
  variant?: "card" | "row";
  className?: string;
};

function formatViewers(viewers: number): string {
  if (viewers >= 1000) return `${(viewers / 1000).toFixed(1)}K`;
  return String(viewers);
}

/**
 * District TV channel tile (docs/reference/desktop-home.png "District TV").
 * Presentational only — links to `/tv/[slug]`.
 */
export function ChannelCard({
  channel,
  variant = "card",
  className,
}: ChannelCardProps) {
  const thumb = channel.thumbnail_gradient ?? DEFAULT_THUMB;
  const host = channel.hosts?.[0];

  const stage = (
    <span
      className={cn(
        "relative grid overflow-hidden rounded-[14px] border border-[#31415f]",
        variant === "card" ? "h-[132px] place-items-center" : "size-[68px] shrink-0",
      )}
      style={{ backgroundImage: thumb }}
      aria-hidden="true"
    >
      <span
        className={cn(
          "grid place-items-center",
          variant === "card" ? "text-[38px]" : "text-[24px]",
        )}
      >
        {channel.hosts && channel.hosts.length > 0
          ? channel.hosts
              .slice(0, 2)
              .map((h) => h.avatar_emoji)
              .join("")
          : "📺"}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#060a12]/85 to-transparent" />
      {channel.is_live ? (
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border border-[#8a2c41] bg-[#2a0d15] px-2 py-1 text-[9px] font-extrabold text-[#ff8293]">
          <LiveDot color="bg-red" size="sm" />
          LIVE
        </span>
      ) : null}
      {channel.viewers ? (
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[#080d17]/85 px-2 py-1 text-[9px] font-extrabold text-[#dbe4f5]">
          <Eye className="size-3" />
          {formatViewers(channel.viewers)}
        </span>
      ) : null}
    </span>
  );

  if (variant === "row") {
    return (
      <Link
        href={`/tv/${channel.slug}`}
        className={cn(
          "flex items-center gap-3 rounded-[16px] p-2 transition-colors hover:bg-white/4",
          className,
        )}
      >
        {stage}
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[13px] font-extrabold">{channel.title}</b>
          <small className="block truncate text-[11px] text-muted">
            {channel.description ?? channel.schedule ?? ""}
          </small>
        </span>
        <Play className="size-4 shrink-0 text-blue" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <Link
      href={`/tv/${channel.slug}`}
      className={cn(
        "bg-card-surface flex flex-col gap-3 rounded-card border border-line p-3",
        "shadow-[var(--shadow-card)] transition-[transform,border-color,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-[#415477] hover:shadow-[0_18px_44px_rgba(0,0,0,.28)]",
        className,
      )}
    >
      {stage}
      <div className="min-w-0">
        <b className="block truncate text-[14px] font-extrabold">{channel.title}</b>
        {channel.description ? (
          <p className="m-0 mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
            {channel.description}
          </p>
        ) : null}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {host ? (
            <AgentAvatar
              emoji={host.avatar_emoji}
              handle={host.handle}
              gradient={host.avatar_gradient ?? undefined}
              name={host.name}
              size="xs"
            />
          ) : null}
          <small className="truncate text-[11px] text-muted">
            {channel.hosts?.map((h) => h.name).join(" & ") ?? channel.schedule ?? ""}
          </small>
        </span>
        {channel.kind ? (
          <Pill variant={channel.is_live ? "live" : "default"} size="sm">
            {channel.kind.toUpperCase()}
          </Pill>
        ) : null}
      </div>
    </Link>
  );
}
