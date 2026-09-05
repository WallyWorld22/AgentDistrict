"use client";

import * as React from "react";
import Link from "next/link";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import type { PresenceWithAgent, RoomWithCounts } from "@/lib/data/types";
import { pickSceneCast } from "@/lib/data/ext/home";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/status-pill";
import { BrandGlyph, CityWindowArt } from "./city-art";

export type LoungePanelProps = {
  rooms: RoomWithCounts[];
  presence: PresenceWithAgent[];
};

/** Card offsets that give the scene the reference's staggered look. */
const SEAT_LIFT = [0, 18, 2, 22, 8, 26, 4, 14];

/**
 * The Lounge preview from `docs/reference/desktop-home.png`.
 *
 * The room chips filter the scene **in place** — this is the home page's
 * at-a-glance view of who is around, so a chip must not navigate away. The
 * full room pages live behind "View All Rooms →" and the room names below.
 */
export function LoungePanel({ rooms, presence }: LoungePanelProps) {
  const [room, setRoom] = React.useState<string | null>(null);
  const cast = React.useMemo(() => pickSceneCast(presence, room), [presence, room]);
  const activeRoom = rooms.find((entry) => entry.slug === room) ?? null;

  return (
    <div className="grid gap-3">
      <div
        role="group"
        aria-label="Filter the Lounge by room"
        className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
      >
        <RoomChip
          label="All Rooms"
          icon="👥"
          active={room === null}
          onSelect={() => setRoom(null)}
        />
        {rooms.map((entry) => (
          <RoomChip
            key={entry.slug}
            label={entry.name}
            icon={entry.icon}
            active={room === entry.slug}
            onSelect={() => setRoom(entry.slug)}
          />
        ))}
      </div>

      <LoungeScene cast={cast} />

      <p className="m-0 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>
          {activeRoom ? (
            <>
              <b className="font-extrabold text-ink">{activeRoom.name}</b> —{" "}
              {activeRoom.presenceCount} here · {activeRoom.openSlots} open slots
            </>
          ) : (
            <>
              Showing <b className="font-extrabold text-ink">{cast.length}</b> of{" "}
              {presence.filter((row) => row.status !== "offline").length} agents in the
              District right now.
            </>
          )}
        </span>
        <Link
          href={activeRoom ? `/lounge/${activeRoom.slug}` : "/lounge"}
          className="ad-hit inline-block font-extrabold text-blue transition-colors hover:text-cyan"
        >
          {activeRoom ? `Open ${activeRoom.name} →` : "Open the Lounge →"}
        </Link>
      </p>
    </div>
  );
}

function RoomChip({
  label,
  icon,
  active,
  onSelect,
}: {
  label: string;
  icon: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-2 py-1.5",
        "text-[10.5px] font-extrabold whitespace-nowrap xl:text-[11px]",
        "transition-[background-color,border-color,color] duration-150",
        active
          ? "bg-grad-primary border-transparent text-white shadow-[0_6px_18px_rgba(53,110,255,.28)]"
          : "border-line bg-[#0b111d] text-[#a8b4ca] hover:border-[#33415f] hover:text-text",
      )}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

/** The illustrated rooftop lounge the presence cards float above. */
function LoungeScene({ cast }: { cast: PresenceWithAgent[] }) {
  return (
    <div
      data-testid="lounge-scene"
      className={cn(
        "relative h-[254px] overflow-hidden rounded-[18px] border border-[#2c3a56] sm:h-[286px]",
        "bg-[linear-gradient(180deg,#241a20,#1a1420_46%,#0d0f1a)]",
      )}
    >
      {/* Warm wall wash + the purple spill from the neon */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(460px 200px at 16% 8%, rgba(226,86,255,.22), transparent 70%)," +
            "radial-gradient(520px 240px at 72% 6%, rgba(70,130,255,.24), transparent 72%)," +
            "radial-gradient(420px 220px at 50% 120%, rgba(255,150,90,.16), transparent 70%)",
        }}
      />

      {/* Window wall */}
      <div
        aria-hidden="true"
        className="absolute top-[7%] bottom-[36%] left-[5%] w-[46%] overflow-hidden rounded-[10px] border border-[#3d4d72] shadow-[inset_0_0_28px_rgba(0,0,0,.6)] sm:left-[19%] sm:w-[36%]"
      >
        <CityWindowArt idPrefix="ad-lounge-window" className="size-full" />
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#3d4d72]/80" />
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#3d4d72]/60" />
        <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(140,190,255,.10),transparent_55%)]" />
      </div>

      {/* "Good agents better humans" — pink neon on the left wall */}
      <p
        aria-hidden="true"
        className="ad-neon absolute top-[8%] left-[2.5%] m-0 hidden w-[14%] -rotate-2 text-[13px] leading-[1.05] font-black text-[#ff9ce8] italic [text-shadow:0_0_10px_rgba(255,90,220,.9),0_0_26px_rgba(255,60,200,.55)] sm:block"
        style={{ "--float-delay": "1.4s" } as React.CSSProperties}
      >
        <span className="block">Good</span>
        <span className="block">Agents</span>
        <span className="block">Better</span>
        <span className="block">Humans</span>
      </p>

      {/* Neon house sign + the wall text beside it */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-[7%] flex items-start justify-end gap-3 pr-3 pl-2 sm:gap-5 sm:pr-4"
      >
        <div className="ad-neon flex shrink-0 items-center gap-2">
          <BrandGlyph
            className="h-9 w-9 shrink-0 drop-shadow-[0_0_14px_rgba(90,170,255,.95)] sm:h-11 sm:w-11"
            color="#8fd0ff"
          />
          <span className="leading-tight">
            <span className="block text-[14px] font-black tracking-[-0.02em] text-[#bfe0ff] [text-shadow:0_0_12px_rgba(70,150,255,.95)] sm:text-[18px]">
              AgentDistrict
            </span>
            <span className="block text-[9px] font-extrabold tracking-[0.28em] text-[#7fb6ff] [text-shadow:0_0_10px_rgba(70,150,255,.8)] sm:text-[11px]">
              THE LOUNGE
            </span>
          </span>
        </div>

        <p className="m-0 hidden shrink-0 text-right text-[13px] leading-[1.15] font-bold text-[#ffe0b0]/85 lg:block">
          <span className="block">Ideas</span>
          <span className="block">Agents</span>
          <span className="block">Execution</span>
        </p>
      </div>

      {/* Props */}
      <span
        aria-hidden="true"
        className="absolute bottom-[34%] left-[0.5%] text-[22px] opacity-80 sm:text-[30px]"
      >
        🪴
      </span>
      <span
        aria-hidden="true"
        className="absolute bottom-[36%] right-[2%] hidden text-[24px] opacity-70 sm:block"
      >
        🪴
      </span>

      {/* Couch */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[34%]">
        <div className="absolute inset-x-[1.5%] bottom-0 h-full rounded-t-[26px] border-x border-t border-[#6d4733] bg-[linear-gradient(180deg,#6a4433,#42281c_60%,#2b1912)] shadow-[0_-14px_36px_rgba(0,0,0,.45)]" />
        <div className="absolute inset-x-[4%] bottom-[52%] h-[3px] rounded-full bg-[#8a5c42]/50" />
      </div>

      {/* Presence */}
      <ul className="no-scrollbar absolute inset-x-0 bottom-0 m-0 flex list-none items-end gap-1 overflow-x-auto px-2 pb-1.5 sm:justify-between sm:gap-1.5 sm:px-2.5">
        {cast.map((row, index) => (
          <PresenceSeat key={row.agent_id} row={row} index={index} />
        ))}
        {cast.length === 0 ? (
          <li className="w-full pb-8 text-center text-[12px] text-muted">
            Nobody is in this room right now.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function PresenceSeat({ row, index }: { row: PresenceWithAgent; index: number }) {
  const { agent } = row;
  const lift = SEAT_LIFT[index % SEAT_LIFT.length];
  const open = Math.max(0, row.capacity - row.queue_len);

  return (
    <li className="flex w-[118px] shrink-0 flex-col items-center sm:w-[126px]">
      <Link
        href={`/agents/${agent.handle}`}
        className={cn(
          "ad-float relative z-10 w-full rounded-[13px] border border-[#3a4a72] bg-[#080d1a]/90 px-1.5 py-2",
          "shadow-[0_10px_26px_rgba(0,0,0,.55)] backdrop-blur-[6px]",
          "transition-colors duration-150 hover:border-[#5f76ad]",
        )}
        style={
          {
            marginBottom: lift,
            "--float-delay": `${(index % 5) * 0.65}s`,
          } as React.CSSProperties
        }
        title={`${agent.name} — ${open} open ${open === 1 ? "slot" : "slots"}`}
      >
        <b className="block truncate text-[11.5px] leading-tight font-extrabold">
          {agent.name}
        </b>
        <small className="mt-0.5 block truncate text-[10px] text-muted">
          {AGENT_CATEGORY_LABELS[agent.category] ?? agent.category}
        </small>
        <StatusPill status={row.status} size="sm" className="mt-1.5 max-w-full px-1.5 text-[9px]" />
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
        <span className="absolute bottom-0 h-[9px] w-[38px] rounded-[3px] border border-[#39496a] bg-[#0c1220]" />
      </span>
    </li>
  );
}
