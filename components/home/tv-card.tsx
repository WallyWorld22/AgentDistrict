import * as React from "react";
import Link from "next/link";
import { MessageSquare, Play } from "lucide-react";
import type { Agent, Channel } from "@/lib/data/types";
import { formatViewers } from "@/lib/data/ext/home";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { LiveDot } from "@/components/ui/live-dot";

export type TvCardProps = {
  channel: Channel;
  hosts: Agent[];
  className?: string;
};

/**
 * The District TV card from `docs/reference/desktop-home.png`: the studio
 * stage with the two hosts behind their mics, the LIVE flag and the viewer
 * count, then Watch Live / Live Chat into `/tv/[slug]`.
 */
export function TvCard({ channel, hosts, className }: TvCardProps) {
  return (
    <div data-testid="tv-card" className={cn("grid gap-3", className)}>
      <Link
        href={`/tv/${channel.slug}`}
        className={cn(
          "group relative block h-[152px] overflow-hidden rounded-[16px] border border-[#4a2f6b]",
          "bg-[linear-gradient(180deg,#3a1c56,#25143c_55%,#140b22)]",
          "transition-[border-color,box-shadow] duration-200 hover:border-[#6f45a0]",
        )}
      >
        <StudioStage hosts={hosts} />

        <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0a0713]/85 to-transparent" />

        {channel.is_live ? (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-[7px] bg-[#e8283f] px-2 py-1 text-[9.5px] font-black tracking-[0.06em] text-white">
            <LiveDot color="bg-white" size="sm" />
            LIVE
          </span>
        ) : null}
        <span className="absolute top-2 right-2 rounded-full bg-[#080d17]/85 px-2 py-1 text-[9.5px] font-extrabold text-ink tabular-nums">
          <span aria-hidden="true">👁</span> {formatViewers(channel.viewers)} watching
        </span>
      </Link>

      <div>
        <Link
          href={`/tv/${channel.slug}`}
          className="block text-[14px] font-extrabold hover:text-blue"
        >
          {channel.title}
        </Link>
        <p className="m-0 mt-1 line-clamp-2 text-[11.5px] text-muted">
          {channel.description}
        </p>
      </div>

      <div className="flex gap-2">
        <Link
          href={`/tv/${channel.slug}`}
          className={buttonClasses("primary", "sm", "flex-1")}
        >
          <Play className="size-3.5 fill-current" aria-hidden="true" />
          Watch Live
        </Link>
        <Link
          href={`/tv/${channel.slug}#chat`}
          className={buttonClasses("outline", "sm", "flex-1")}
        >
          <MessageSquare className="size-3.5" aria-hidden="true" />
          Live Chat
        </Link>
      </div>
    </div>
  );
}

/** Two hosts on a couch-style set, drawn from the channel's real hosts. */
function StudioStage({ hosts }: { hosts: Agent[] }) {
  const cast = hosts.slice(0, 2);

  return (
    <span aria-hidden="true" className="absolute inset-0">
      {/* Back wall: slatted panel + neon tubes */}
      <span className="absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,.04)_0px,rgba(255,255,255,.04)_1px,transparent_1px,transparent_7px)]" />
      <span className="absolute top-3 bottom-10 left-[7%] w-[3px] rounded-full bg-[#ff7be8] shadow-[0_0_16px_#ff5cdd]" />
      <span className="absolute top-6 bottom-10 left-[13%] w-[2px] rounded-full bg-[#b57bff] shadow-[0_0_14px_#8e5cff]" />
      <span className="absolute top-4 bottom-10 right-[8%] w-[3px] rounded-full bg-[#ff7be8] shadow-[0_0_16px_#ff5cdd]" />
      <span className="absolute top-8 bottom-10 right-[14%] w-[2px] rounded-full bg-[#7bb8ff] shadow-[0_0_14px_#3f8dff]" />
      <span className="absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(300px_130px_at_50%_0%,rgba(255,150,255,.22),transparent_70%)]" />

      {/* Hosts */}
      <span className="absolute inset-x-0 bottom-[26px] flex items-end justify-center gap-5">
        {cast.map((host, index) => (
          <span key={host.handle} className="relative flex flex-col items-center">
            {/* Head */}
            <span
              className="grid size-[42px] place-items-center rounded-[16px] border-[3px] border-[#150c22] text-[20px] leading-none shadow-[0_8px_20px_rgba(0,0,0,.6)]"
              style={{
                backgroundImage:
                  host.avatar_gradient ?? "linear-gradient(135deg,#297dff,#4ee7ff)",
              }}
            >
              {host.avatar_emoji}
            </span>
            {/* Shoulders */}
            <span
              className="-mt-2.5 h-[42px] w-[62px] rounded-t-[26px] border border-b-0 border-[#3a2455]"
              style={{
                backgroundImage: `linear-gradient(180deg,rgba(255,255,255,.14),rgba(0,0,0,.55)), ${
                  host.avatar_gradient ?? "linear-gradient(135deg,#297dff,#4ee7ff)"
                }`,
              }}
            />
            {/* Name strip on the chest, like the reference's show jackets */}
            <span className="absolute bottom-2 text-[8px] font-black tracking-[0.14em] text-white/85 uppercase">
              {host.name}
            </span>
            {/* Mic */}
            <span
              className={cn(
                "absolute bottom-0 h-[30px] w-[3px] rounded-full bg-[#1a1327]",
                index === 0 ? "-left-1" : "-right-1",
              )}
            >
              <span className="absolute -top-2 -left-[3px] size-[9px] rounded-full border border-[#4a3a63] bg-[#241a35]" />
            </span>
          </span>
        ))}
      </span>

      {/* Desk */}
      <span className="absolute inset-x-0 bottom-0 h-[26px] rounded-t-[10px] border-t border-[#5a3b7d] bg-[linear-gradient(180deg,#2c1a44,#160d24)]" />
    </span>
  );
}
