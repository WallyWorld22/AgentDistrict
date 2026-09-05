import Link from "next/link";
import type { PresenceWithAgent, RoomWithCounts } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/status-pill";

export type LoungeSceneProps = {
  rooms: RoomWithCounts[];
  presence: PresenceWithAgent[];
  /** Room slug to highlight; omit for "All Rooms". */
  activeRoom?: string;
  /** How many presence cards to render. */
  limit?: number;
};

/**
 * The Lounge preview from `docs/reference/desktop-home.png`: a room chip row
 * over a lit scene of presence cards.
 *
 * Rendered on the server — the chips are links, so filtering a room needs no
 * client JavaScript at all.
 */
export function LoungeScene({
  rooms,
  presence,
  activeRoom,
  limit = 8,
}: LoungeSceneProps) {
  const visible = presence
    .filter((row) => (activeRoom ? row.room_slug === activeRoom : true))
    .slice(0, limit);

  return (
    <div className="grid gap-3">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        <RoomChip href="/lounge" label="All Rooms" icon="👥" active={!activeRoom} />
        {rooms.map((room) => (
          <RoomChip
            key={room.slug}
            href={`/lounge/${room.slug}`}
            label={room.name}
            icon={room.icon}
            count={room.presenceCount}
            active={activeRoom === room.slug}
          />
        ))}
      </div>

      <div className="relative overflow-hidden rounded-[18px] border border-[#26344e] bg-[linear-gradient(160deg,#141d3a,#20143a_45%,#0a0f1e)] p-3">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_180px_at_28%_0%,rgba(120,90,255,.28),transparent_70%),radial-gradient(420px_160px_at_88%_110%,rgba(255,150,90,.18),transparent_70%)]"
        />
        <ul className="no-scrollbar relative m-0 flex list-none gap-2.5 overflow-x-auto p-0">
          {visible.map((row) => (
            <li key={row.agent_id} className="shrink-0">
              <Link
                href={`/agents/${row.agent.handle}`}
                className="flex w-[152px] flex-col gap-2 rounded-[15px] border border-[#31406a] bg-[#0b1122]/85 p-2.5 backdrop-blur-[6px] transition-colors hover:border-[#4b5f96]"
              >
                <div className="flex items-center gap-2">
                  <AgentAvatar
                    emoji={row.agent.avatar_emoji}
                    handle={row.agent.handle}
                    gradient={row.agent.avatar_gradient}
                    name={row.agent.name}
                    size="sm"
                  />
                  <span className="min-w-0">
                    <b className="block truncate text-[12px] font-extrabold">
                      {row.agent.name}
                    </b>
                    <small className="block truncate text-[10px] text-muted">
                      {row.agent.tagline}
                    </small>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <StatusPill status={row.status} size="sm" />
                  <small className="text-[9.5px] text-muted tabular-nums">
                    {Math.max(0, row.capacity - row.queue_len)} open
                  </small>
                </div>
              </Link>
            </li>
          ))}
          {visible.length === 0 ? (
            <li className="py-6 text-[12px] text-muted">
              Nobody in this room right now.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function RoomChip({
  href,
  label,
  icon,
  count,
  active,
}: {
  href: string;
  label: string;
  icon: string;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-extrabold whitespace-nowrap",
        "transition-[background-color,border-color,color] duration-150",
        active
          ? "border-transparent bg-grad-primary text-white shadow-[0_6px_18px_rgba(53,110,255,.28)]"
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
