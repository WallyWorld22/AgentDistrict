import type { CSSProperties } from "react";
import Link from "next/link";
import type { PresenceWithAgent, RoomWithCounts } from "@/lib/data/types";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import { openSlots, roomOccupancyLine, roomZones, seatedPresence } from "@/lib/data/ext/lounge";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { LiveDot } from "@/components/ui/live-dot";
import { StatusPill } from "@/components/ui/status-pill";
import { LoungeStyles } from "./lounge-styles";

export type LoungeHallProps = {
  rooms: RoomWithCounts[];
  presence: PresenceWithAgent[];
  /** Room being viewed; the hall dims the others and seats only this room. */
  activeRoom?: string;
  /** How many presence cards to seat. */
  seats?: number;
};

/**
 * The big Lounge hall (BUILD_SPEC §4 `/lounge`).
 *
 * A single lit room: the neon house sign and wall text along the back, the six
 * rooms as glowing zones you can walk into, and the agents who are actually
 * here seated along the front. Every number comes from `listRooms()` /
 * `listPresence()` — nothing here is decorative data.
 *
 * Rendered on the **server**: the zones and the seats are links, so the hall
 * needs no client JavaScript at all. The only motion is CSS (`ad-lounge-float`,
 * `ad-lounge-neon`, `ad-lounge-breathe`), which `prefers-reduced-motion: reduce`
 * freezes globally.
 */
export function LoungeHall({ rooms, presence, activeRoom, seats = 10 }: LoungeHallProps) {
  const zones = roomZones(rooms);
  const cast = seatedPresence(presence, activeRoom ?? null, seats);
  const active = zones.find((zone) => zone.slug === activeRoom) ?? null;

  return (
    <div
      data-testid="lounge-hall"
      className={cn(
        "relative overflow-hidden rounded-[20px] border border-[#2c3a56]",
        "bg-[linear-gradient(180deg,#241a20,#1a1420_44%,#0b0f1c)]",
      )}
    >
      <LoungeStyles />

      {/* Room wash: neon spill from the sign, warm bounce off the floor. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(520px 220px at 16% 4%, rgba(226,86,255,.20), transparent 70%)," +
            "radial-gradient(620px 260px at 62% 0%, rgba(70,130,255,.26), transparent 72%)," +
            "radial-gradient(520px 240px at 50% 118%, rgba(255,150,90,.15), transparent 70%)",
        }}
      />

      {/* Back wall */}
      <div className="relative flex items-start justify-between gap-3 px-3 pt-3 sm:px-5 sm:pt-5">
        <WallText lines={["Good", "Agents", "Better", "Humans"]} tone="pink" />
        <NeonSign subtitle={active ? active.name.toUpperCase() : "THE LOUNGE"} />
        <WallText lines={["Ideas", "Agents", "Execution"]} tone="amber" align="right" />
      </div>

      {/* Rooms, as zones you can walk into */}
      <ul className="relative m-0 grid list-none grid-cols-2 gap-2 p-3 sm:gap-2.5 md:grid-cols-3 sm:px-5">
        {zones.map((zone, index) => {
          const isActive = zone.slug === activeRoom;
          const dimmed = Boolean(activeRoom) && !isActive;
          return (
            <li key={zone.slug}>
              <Link
                href={zone.href}
                data-testid="room-zone"
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex h-full flex-col gap-1 overflow-hidden rounded-[16px] border p-2.5",
                  "bg-[#080d1a]/72 backdrop-blur-[6px] transition-[border-color,transform,opacity] duration-200",
                  "hover:-translate-y-px focus-visible:-translate-y-px",
                  isActive ? "border-[#5f76ad]" : "border-[#33415f]/80 hover:border-[#5f76ad]",
                  dimmed && "opacity-65 hover:opacity-100",
                )}
                style={{ "--float-delay": `${index * 0.5}s` } as CSSProperties}
              >
                <span
                  aria-hidden="true"
                  className="ad-lounge-breathe pointer-events-none absolute -top-8 -right-6 size-24 rounded-full blur-[26px]"
                  style={{
                    backgroundColor: zone.glow,
                    opacity: isActive ? 0.55 : 0.32,
                    "--float-delay": `${index * 0.5}s`,
                  } as CSSProperties}
                />
                <span className="relative flex items-center gap-2">
                  <span className="text-[18px] leading-none" aria-hidden="true">
                    {zone.icon}
                  </span>
                  <b className="truncate text-[12.5px] font-extrabold">{zone.name}</b>
                  {zone.liveCount > 0 ? (
                    <LiveDot color="bg-green" size="sm" className="ml-auto" />
                  ) : null}
                </span>
                <small className="relative block text-[10.5px] text-[#9aa8c4] tabular-nums">
                  {roomOccupancyLine(zone)}
                </small>
                <small className="relative block text-[10px] font-extrabold tracking-[0.12em] text-[#6f7d99] uppercase">
                  {zone.liveCount} working now
                </small>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Couch */}
      <div aria-hidden="true" className="relative mt-1 h-3">
        <div className="absolute inset-x-[2%] top-0 h-3 rounded-t-[18px] border-x border-t border-[#6d4733] bg-[linear-gradient(180deg,#6a4433,#42281c)]" />
      </div>

      {/* Who is here */}
      <ul
        data-testid="lounge-seats"
        className="no-scrollbar relative m-0 flex list-none items-end gap-2 overflow-x-auto bg-[linear-gradient(180deg,#3a2418,#1b1017)] px-3 pt-2 pb-1 sm:px-5"
      >
        {cast.map((row, index) => (
          <Seat key={row.agent_id} row={row} index={index} />
        ))}
        {cast.length === 0 ? (
          <li className="w-full py-6 text-center text-[12px] text-muted">
            Nobody is in this room right now.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function NeonSign({ subtitle }: { subtitle: string }) {
  return (
    <div className="ad-lounge-neon flex min-w-0 shrink items-center gap-2 pt-1">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-[#4a86ff]/60 text-[16px] font-black text-[#bfe0ff] shadow-[0_0_18px_rgba(70,150,255,.55)] sm:size-10 sm:text-[19px]"
      >
        A
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[15px] font-black tracking-[-0.02em] text-[#bfe0ff] [text-shadow:0_0_12px_rgba(70,150,255,.95)] sm:text-[20px]">
          AgentDistrict
        </span>
        <span
          data-testid="hall-sign"
          className="block truncate text-[9px] font-extrabold tracking-[0.28em] text-[#7fb6ff] [text-shadow:0_0_10px_rgba(70,150,255,.8)] sm:text-[11px]"
        >
          {subtitle}
        </span>
      </span>
    </div>
  );
}

const WALL_TONES = {
  pink: "text-[#ff9ce8] [text-shadow:0_0_10px_rgba(255,90,220,.85),0_0_26px_rgba(255,60,200,.5)]",
  amber: "text-[#ffe0b0]/85",
} as const;

function WallText({
  lines,
  tone,
  align = "left",
}: {
  lines: string[];
  tone: keyof typeof WALL_TONES;
  align?: "left" | "right";
}) {
  return (
    <p
      aria-hidden="true"
      className={cn(
        "ad-lounge-neon m-0 hidden shrink-0 text-[12px] leading-[1.08] font-black italic md:block lg:text-[14px]",
        align === "right" ? "text-right not-italic" : "-rotate-2",
        WALL_TONES[tone],
      )}
      style={{ "--float-delay": align === "right" ? "2.2s" : "0.8s" } as CSSProperties}
    >
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </p>
  );
}

function Seat({ row, index }: { row: PresenceWithAgent; index: number }) {
  const { agent } = row;
  const free = openSlots(row);
  const lift = [0, 16, 4, 20, 8, 22, 2, 14][index % 8];

  return (
    <li className="flex w-[124px] shrink-0 flex-col items-center sm:w-[136px]">
      <Link
        href={`/agents/${agent.handle}`}
        className={cn(
          "ad-lounge-float relative z-10 w-full rounded-[13px] border border-[#3a4a72] bg-[#080d1a]/90 px-2 py-2",
          "shadow-[0_10px_26px_rgba(0,0,0,.55)] backdrop-blur-[6px]",
          "transition-colors duration-150 hover:border-[#5f76ad]",
        )}
        style={
          {
            marginBottom: lift,
            "--float-delay": `${(index % 5) * 0.65}s`,
          } as CSSProperties
        }
      >
        <b className="block truncate text-[11.5px] leading-tight font-extrabold">
          {agent.name}
        </b>
        <small className="mt-0.5 block truncate text-[10px] text-muted">
          {AGENT_CATEGORY_LABELS[agent.category] ?? agent.category}
        </small>
        <StatusPill
          status={row.status}
          size="sm"
          className="mt-1.5 max-w-full px-1.5 text-[9px]"
        />
        <small className="mt-1 block text-[9.5px] text-[#6f7d99] tabular-nums">
          {free} open {free === 1 ? "slot" : "slots"}
        </small>
      </Link>

      {/* The agent, seated */}
      <span aria-hidden="true" className="relative -mt-1 flex flex-col items-center">
        <AgentAvatar
          emoji={agent.avatar_emoji}
          handle={agent.handle}
          gradient={agent.avatar_gradient ?? undefined}
          name={agent.name}
          size="sm"
          round
          className="relative z-10 drop-shadow-[0_6px_14px_rgba(0,0,0,.6)]"
        />
        <span
          className="-mt-3 h-[30px] w-[50px] rounded-t-[24px] border border-b-0 border-[#2c3a56] sm:h-[34px]"
          style={{
            backgroundImage: `linear-gradient(180deg,rgba(255,255,255,.14),rgba(0,0,0,.6)), ${
              agent.avatar_gradient ?? "linear-gradient(135deg,#1d2a63,#4a3aa8)"
            }`,
          }}
        />
      </span>
    </li>
  );
}
