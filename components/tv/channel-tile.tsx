import Link from "next/link";
import { Users } from "lucide-react";
import type { Agent, Channel } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { LiveDot } from "@/components/ui/live-dot";
import { Pill } from "@/components/ui/pill";
import { FollowButton } from "./follow-button";

export type ChannelWithHosts = Channel & { hosts: Agent[] };

const DEFAULT_THUMB = "linear-gradient(150deg,#171b34,#321d4b 52%,#0a0f19)";

/**
 * A District TV channel tile.
 *
 * Richer than the shared `ChannelCard` (which the Home strip uses): the whole
 * card is a link into the player, with the Follow control sitting outside that
 * link so it toggles rather than navigating.
 */
export function ChannelTile({
  channel,
  following,
  className,
}: {
  channel: ChannelWithHosts;
  /** Does the signed-in profile follow this channel? */
  following?: boolean;
  className?: string;
}) {
  const hosts = channel.hosts.slice(0, 3);

  return (
    <article
      data-testid="channel-tile"
      data-live={channel.is_live ? "1" : "0"}
      className={cn(
        "bg-card-surface flex flex-col gap-3 rounded-card border border-line p-3",
        "shadow-[var(--shadow-card)] transition-[transform,border-color,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-[#415477] hover:shadow-[0_18px_44px_rgba(0,0,0,.28)]",
        className,
      )}
    >
      <Link href={`/tv/${channel.slug}`} className="grid gap-3">
        <span
          className="relative grid h-[130px] place-items-center overflow-hidden rounded-[16px] border border-[#31415f]"
          style={{ backgroundImage: channel.thumbnail_gradient || DEFAULT_THUMB }}
          aria-hidden="true"
        >
          <span className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(8,12,22,.1),rgba(6,9,16,.72)_74%)]" />
          <span className="relative flex items-end gap-1">
            {hosts.length > 0
              ? hosts.map((host) => (
                  <span
                    key={host.id}
                    className="grid size-11 place-items-center rounded-full border border-white/15 text-[21px] shadow-[0_8px_20px_rgba(0,0,0,.5)]"
                    style={{
                      backgroundImage:
                        host.avatar_gradient ?? "linear-gradient(135deg,#1d2a63,#4a3aa8)",
                    }}
                  >
                    {host.avatar_emoji}
                  </span>
                ))
              : "📺"}
          </span>
          <span className="absolute inset-x-0 bottom-0 h-5 rounded-b-[15px] border-t border-[#6d4733]/60 bg-[linear-gradient(180deg,#4d3124,#241610)]" />
          {channel.is_live ? (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border border-[#8a2c41] bg-[#2a0d15] px-2 py-1 text-[9px] font-extrabold text-[#ff8293]">
              <LiveDot color="bg-red" size="sm" />
              LIVE
            </span>
          ) : (
            <span className="absolute top-2 left-2 inline-flex items-center rounded-full border border-[#26324b] bg-[#080d17]/85 px-2 py-1 text-[9px] font-extrabold text-[#bdc6da]">
              {channel.schedule}
            </span>
          )}
        </span>

        <span className="block min-w-0">
          <b className="block truncate text-[14px] font-extrabold">{channel.title}</b>
          <span className="m-0 mt-1 line-clamp-2 block text-[11.5px] leading-relaxed text-muted">
            {channel.description}
          </span>
        </span>
      </Link>

      <div className="mt-auto grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            {hosts[0] ? (
              <AgentAvatar
                emoji={hosts[0].avatar_emoji}
                handle={hosts[0].handle}
                gradient={hosts[0].avatar_gradient ?? undefined}
                name={hosts[0].name}
                size="xs"
              />
            ) : null}
            <small className="truncate text-[11px] text-muted">
              {hosts.map((host) => host.name).join(" & ") || channel.schedule}
            </small>
          </span>
          <Pill variant={channel.is_live ? "live" : "default"} size="sm">
            {channel.kind.toUpperCase()}
          </Pill>
        </div>

        <div className="flex items-center justify-between gap-2">
          <small className="inline-flex items-center gap-1.5 text-[10.5px] text-muted tabular-nums">
            <Users className="size-3.5" aria-hidden="true" />
            {channel.followers.toLocaleString("en-US")} followers
          </small>
          <FollowButton slug={channel.slug} title={channel.title} following={following} size="xs" />
        </div>
      </div>
    </article>
  );
}
