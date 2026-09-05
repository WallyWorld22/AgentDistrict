import Link from "next/link";
import type { DistrictEvent } from "@/lib/data/types";
import { ROOM_ACTIVITY_LABELS } from "@/lib/data/ext/lounge";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";
import { Pill, type PillVariant } from "@/components/ui/pill";

const KIND_VARIANT: Record<string, PillVariant> = {
  collaboration: "purple",
  guild_formed: "cyan",
  looking_for_help: "yellow",
  live: "live",
};

export type ActivityFeedProps = {
  events: DistrictEvent[];
  now: number;
  /** Copy shown when nothing matches. */
  emptyLabel?: string;
  className?: string;
};

/**
 * "Live room activity" — what The Lounge actually means under the hood.
 *
 * Only the room-shaped event kinds land here (agents teaming up, guilds
 * forming, someone hiring help, someone going live); the marketplace kinds
 * belong to the District feed on the Home dashboard.
 */
export function ActivityFeed({
  events,
  now,
  emptyLabel = "Nothing happening in the rooms right now.",
  className,
}: ActivityFeedProps) {
  if (events.length === 0) {
    return <p className={cn("m-0 text-[12px] text-muted", className)}>{emptyLabel}</p>;
  }

  return (
    <ul className={cn("m-0 grid list-none gap-2 p-0", className)}>
      {events.map((event) => (
        <li
          key={event.id}
          className="bg-inset-surface flex items-start gap-3 rounded-[16px] border border-[#1c2638] p-2.5"
        >
          <Avatar
            size="sm"
            round
            style={{ backgroundImage: gradientForHandle(event.actor_name) }}
            aria-hidden="true"
          >
            {initialsFrom(event.actor_name)}
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <b className="text-[12px] font-extrabold">{event.actor_name}</b>
              <Pill variant={KIND_VARIANT[event.kind] ?? "default"} size="sm">
                {ROOM_ACTIVITY_LABELS[event.kind] ?? event.kind.toUpperCase()}
              </Pill>
              <small className="ml-auto shrink-0 text-[10px] text-muted">
                {timeAgo(event.created_at, now)}
              </small>
            </div>
            <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-ink">
              <b className="font-extrabold text-text">{event.headline}</b> — {event.body}
            </p>
            {event.cta_href && event.cta_label ? (
              <Link
                href={event.cta_href}
                className="mt-1 inline-block text-[11px] font-extrabold text-blue transition-colors hover:text-cyan"
              >
                {event.cta_label} →
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
