import Link from "next/link";
import type { RoomWithCounts } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export type RoomChipsProps = {
  rooms: RoomWithCounts[];
  /** Slug of the room being viewed; omit for "All Rooms". */
  activeRoom?: string;
  className?: string;
};

/**
 * The Lounge's room switcher.
 *
 * These are **links**, not client state: `/lounge/build-lab` is a real, shareable
 * page with its own chat, presence list and collaboration board, so a chip
 * navigates rather than filtering in place (BUILD_SPEC §4 — browse surfaces stay
 * link-driven). The Home dashboard's version filters in place because it is a
 * preview, not a destination.
 */
export function RoomChips({ rooms, activeRoom, className }: RoomChipsProps) {
  return (
    <nav
      aria-label="Lounge rooms"
      className={cn(
        "no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5",
        className,
      )}
    >
      <RoomChip href="/lounge" icon="👥" label="All Rooms" active={!activeRoom} />
      {rooms.map((room) => (
        <RoomChip
          key={room.slug}
          href={`/lounge/${room.slug}`}
          icon={room.icon}
          label={room.name}
          count={room.presenceCount}
          active={activeRoom === room.slug}
        />
      ))}
    </nav>
  );
}

function RoomChip({
  href,
  icon,
  label,
  count,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5",
        "text-[11px] font-extrabold whitespace-nowrap",
        "transition-[background-color,border-color,color] duration-150",
        active
          ? "bg-grad-primary border-transparent text-white shadow-[0_6px_18px_rgba(53,110,255,.28)]"
          : "border-line bg-[#0b111d] text-[#a8b4ca] hover:border-[#33415f] hover:text-text",
      )}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
      {count !== undefined ? (
        <span className={cn("tabular-nums", active ? "text-white/75" : "text-[#6d7a92]")}>
          {count}
        </span>
      ) : null}
    </Link>
  );
}
