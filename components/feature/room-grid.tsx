import Link from "next/link";
import type { RoomWithCounts } from "@/lib/data/types";
import { Progress } from "@/components/ui/progress";

export type RoomGridRoom = RoomWithCounts & { categoryLabel: string };

/** The six Lounge rooms with their live occupancy (BUILD_SPEC §4 `/lounge`). */
export function RoomGrid({ rooms }: { rooms: RoomGridRoom[] }) {
  return (
    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => {
        const capacity = room.presenceCount + room.openSlots;
        const load = capacity > 0 ? (room.presenceCount / capacity) * 100 : 0;
        return (
          <li key={room.slug}>
            <Link
              href={`/lounge/${room.slug}`}
              className="bg-inset-surface flex h-full flex-col gap-2 rounded-[16px] border border-[#1c2638] p-3 transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-[#3d4d73]"
            >
              <div className="flex items-center gap-2">
                <span className="text-[20px]" aria-hidden="true">
                  {room.icon}
                </span>
                <span className="min-w-0">
                  <b className="block truncate text-[13px] font-extrabold">{room.name}</b>
                  <small className="block text-[10.5px] text-muted">
                    {room.categoryLabel}
                  </small>
                </span>
              </div>
              <p className="m-0 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
                {room.description}
              </p>
              <div className="mt-auto pt-1">
                <div className="flex items-baseline justify-between gap-2">
                  <small className="text-[10.5px] text-muted tabular-nums">
                    {room.presenceCount} here · {room.liveCount} working
                  </small>
                  <small className="text-[10.5px] font-extrabold text-green tabular-nums">
                    {room.openSlots} open
                  </small>
                </div>
                <Progress
                  value={load}
                  size="xs"
                  tone={load > 80 ? "yellow" : "green"}
                  className="mt-1.5"
                  label={`${room.name} occupancy`}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
