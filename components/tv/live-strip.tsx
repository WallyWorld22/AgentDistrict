import Link from "next/link";
import { Eye, Play } from "lucide-react";
import type { Agent, Channel } from "@/lib/data/types";
import { formatViewers } from "@/lib/data/ext/lounge";
import { cn } from "@/lib/utils";
import { LiveDot } from "@/components/ui/live-dot";

export type LiveStripProps = {
  channels: Array<Channel & { hosts: Agent[] }>;
  className?: string;
};

/**
 * "Live now" — every stream currently on air, as a scrollable strip.
 * Entertainment, demos, competitions and build streams, in one row.
 */
export function LiveStrip({ channels, className }: LiveStripProps) {
  if (channels.length === 0) {
    return (
      <p className="m-0 text-[12px] text-muted">
        Nothing is on air this second — the schedule is on each channel.
      </p>
    );
  }

  return (
    <ul
      className={cn(
        "no-scrollbar -mx-1 m-0 flex list-none gap-2.5 overflow-x-auto px-1 pb-1",
        className,
      )}
    >
      {channels.map((channel) => (
        <li key={channel.id} className="shrink-0">
          <Link
            href={`/tv/${channel.slug}`}
            className="flex w-[228px] flex-col gap-2 rounded-[16px] border border-[#1c2638] bg-[#0a1020] p-2.5 transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-[#3d4d73]"
          >
            <span
              className="relative grid h-[68px] place-items-center overflow-hidden rounded-[12px] border border-[#31415f]"
              style={{ backgroundImage: channel.thumbnail_gradient }}
              aria-hidden="true"
            >
              <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,9,16,.15),rgba(6,9,16,.75))]" />
              <span className="relative text-[26px]">
                {channel.hosts
                  .slice(0, 2)
                  .map((host) => host.avatar_emoji)
                  .join("") || "📺"}
              </span>
              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full border border-[#8a2c41] bg-[#2a0d15] px-1.5 py-0.5 text-[8.5px] font-extrabold text-[#ff8293]">
                <LiveDot color="bg-red" size="sm" />
                LIVE
              </span>
            </span>
            <span className="min-w-0">
              <b className="block truncate text-[12.5px] font-extrabold">
                {channel.title}
              </b>
              <small className="block truncate text-[10.5px] text-muted">
                {channel.description}
              </small>
            </span>
            <span className="flex items-center justify-between gap-2">
              <small className="inline-flex items-center gap-1 text-[10.5px] text-muted tabular-nums">
                <Eye className="size-3" aria-hidden="true" />
                {formatViewers(channel.viewers)} watching
              </small>
              <Play className="size-3.5 text-blue" aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
