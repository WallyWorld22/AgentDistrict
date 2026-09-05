// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  AMBIENT_CHAT_LINES,
  RACE_HEAT_SECONDS,
  ROOM_ACTIVITY_KINDS,
  SHOWROOMS,
  TV_FILTERS,
  ambientChatLine,
  chatTranscript,
  collaborationRequests,
  formatCountdown,
  formatViewers,
  hashInRange,
  hashPick,
  hashString,
  loungeTotals,
  mergeMessages,
  messagesForRoom,
  openSlots,
  raceSecondsRemaining,
  roomActivity,
  roomOccupancyLine,
  roomZones,
  runShowroom,
  seatedPresence,
  secondsUntil,
  showroomFor,
  sortCompetitions,
  standings,
  tokenizeChatBody,
} from "@/lib/data/ext/lounge";
import { getRepo } from "@/lib/data";
import { CHANNEL_KINDS, EVENT_KINDS } from "@/lib/data/types";
import type {
  CompetitionWithEntries,
  DistrictEvent,
  LoungeMessage,
  PresenceWithAgent,
  RoomWithCounts,
} from "@/lib/data/types";

/**
 * The Lounge / District TV / Competitions / Showrooms rules
 * (`lib/data/ext/lounge.ts`).
 *
 * Everything here is pure or composed from `getRepo()`. The determinism tests
 * matter most: the showroom demos and the TV ambient chat both look "live" and
 * must nevertheless produce identical output for identical input, or the
 * server render and the client hydration would disagree.
 */

/* --------------------------------------------------------------- hashing */

describe("deterministic hashing", () => {
  it("is stable for the same input", () => {
    expect(hashString("1234 Palm Dr, Orlando, FL")).toBe(
      hashString("1234 Palm Dr, Orlando, FL"),
    );
    expect(hashString("a")).not.toBe(hashString("b"));
  });

  it("returns a non-negative 32-bit integer", () => {
    for (const input of ["", "x", "a longer string with spaces", "🏠"]) {
      const value = hashString(input);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("keeps hashInRange inside its bounds and varies with the salt", () => {
    for (let i = 0; i < 200; i += 1) {
      const value = hashInRange(`address ${i}`, "area", 1420, 3260);
      expect(value).toBeGreaterThanOrEqual(1420);
      expect(value).toBeLessThanOrEqual(3260);
    }
    expect(hashInRange("same", "a", 0, 1000)).not.toBe(
      hashInRange("same", "b", 0, 1000),
    );
    // Degenerate range collapses rather than dividing by zero.
    expect(hashInRange("x", "s", 5, 5)).toBe(5);
  });

  it("picks from a list without ever going out of range", () => {
    const options = ["one", "two", "three"] as const;
    for (let i = 0; i < 50; i += 1) {
      expect(options).toContain(hashPick(`input ${i}`, "pick", options));
    }
  });
});

/* -------------------------------------------------------------- formatting */

describe("formatting", () => {
  it("abbreviates viewer counts the way the reference chip does", () => {
    expect(formatViewers(0)).toBe("0");
    expect(formatViewers(918)).toBe("918");
    expect(formatViewers(1412)).toBe("1.4K");
    expect(formatViewers(3204)).toBe("3.2K");
    expect(formatViewers(12000)).toBe("12K");
    expect(formatViewers(2_400_000)).toBe("2.4M");
  });

  it("formats a countdown as mm:ss, or h:mm:ss past an hour", () => {
    expect(formatCountdown(521)).toBe("08:41");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-40)).toBe("00:00");
    expect(formatCountdown(3671)).toBe("1:01:11");
  });

  it("counts down from an injected clock and never goes negative", () => {
    const now = Date.parse("2026-09-05T18:00:00.000Z");
    expect(secondsUntil("2026-09-05T18:08:41.000Z", now)).toBe(521);
    expect(secondsUntil("2026-09-05T17:00:00.000Z", now)).toBe(0);
    expect(secondsUntil("not a date", now)).toBe(0);
  });

  it("keeps a live race's clock alive but lets other statuses expire", () => {
    const now = Date.parse("2026-09-05T18:00:00.000Z");
    const endsAt = "2026-09-05T18:08:41.000Z";

    // Still inside the seeded window: the plain remaining time.
    expect(raceSecondsRemaining({ ends_at: endsAt, status: "live" }, now)).toBe(521);

    // Past it: a live race starts its next heat instead of showing 00:00 …
    const later = Date.parse("2026-09-05T18:20:00.000Z");
    const restarted = raceSecondsRemaining({ ends_at: endsAt, status: "live" }, later);
    expect(restarted).toBeGreaterThan(0);
    expect(restarted).toBeLessThanOrEqual(RACE_HEAT_SECONDS);
    // … deterministically, so the server render and the client clock agree.
    expect(raceSecondsRemaining({ ends_at: endsAt, status: "live" }, later)).toBe(
      restarted,
    );

    // A finished or upcoming race simply reads zero once its time is up.
    expect(raceSecondsRemaining({ ends_at: endsAt, status: "finished" }, later)).toBe(0);
    expect(raceSecondsRemaining({ ends_at: endsAt, status: "upcoming" }, later)).toBe(0);
  });
});

/* ------------------------------------------------------------- the Lounge */

const room = (slug: string, over: Partial<RoomWithCounts> = {}): RoomWithCounts => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  category: "research",
  description: "",
  icon: "🔎",
  position: 0,
  presenceCount: 3,
  openSlots: 12,
  liveCount: 1,
  ...over,
});

function presence(
  handle: string,
  status: PresenceWithAgent["status"],
  roomSlug: string,
  capacity = 10,
  queue = 2,
): PresenceWithAgent {
  return {
    agent_id: `agent-${handle}`,
    room_slug: roomSlug,
    status,
    capacity,
    queue_len: queue,
    updated_at: "2026-09-05T17:59:00.000Z",
    agent: { handle, name: handle, category: "research" } as PresenceWithAgent["agent"],
  };
}

describe("the Lounge hall", () => {
  it("gives every seeded room a zone with a link and a glow", async () => {
    const rooms = await getRepo().listRooms();
    const zones = roomZones(rooms);
    expect(zones).toHaveLength(rooms.length);
    for (const zone of zones) {
      expect(zone.href).toBe(`/lounge/${zone.slug}`);
      expect(zone.glow).toMatch(/^#[0-9a-f]{6}$/i);
      expect(zone.left).toBeGreaterThanOrEqual(0);
      expect(zone.left + zone.width).toBeLessThanOrEqual(100);
    }
  });

  it("lays an unknown room out rather than dropping it", () => {
    const zones = roomZones([room("brand-new-room")]);
    expect(zones).toHaveLength(1);
    expect(zones[0].glow).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("writes the occupancy caption in the legacy hall's style", () => {
    expect(roomOccupancyLine(room("a", { presenceCount: 1944, openSlots: 382 }))).toBe(
      "1,944 agents • 382 open slots",
    );
    expect(roomOccupancyLine(room("b", { presenceCount: 1, openSlots: 0 }))).toBe(
      "1 agent • 0 open slots",
    );
  });

  it("never seats an offline agent, and leads with the busiest", () => {
    const rows = [
      presence("idle", "available", "research-pit"),
      presence("gone", "offline", "research-pit"),
      presence("onair", "live", "research-pit"),
      presence("elsewhere", "live", "build-lab"),
    ];

    const all = seatedPresence(rows, null, 10);
    // Both `live` rows lead; the name breaks the tie so the order is stable.
    expect(all.map((row) => row.agent.handle)).toEqual(["elsewhere", "onair", "idle"]);

    const scoped = seatedPresence(rows, "research-pit", 10);
    expect(scoped.map((row) => row.agent.handle)).toEqual(["onair", "idle"]);

    expect(seatedPresence(rows, null, 1)).toHaveLength(1);
    expect(seatedPresence(rows, null, 0)).toHaveLength(0);
  });

  it("floors open slots at zero when the queue is over capacity", () => {
    expect(openSlots(presence("a", "working", "r", 4, 13))).toBe(0);
    expect(openSlots(presence("a", "available", "r", 17, 1))).toBe(16);
  });

  it("totals the hall from live rows only", () => {
    const totals = loungeTotals(
      [room("a", { openSlots: 5 }), room("b", { openSlots: 7 })],
      [
        presence("a", "collaborating", "a"),
        presence("b", "offline", "a"),
        presence("c", "working", "b"),
        presence("d", "live", "b"),
      ],
    );
    expect(totals).toEqual({
      online: 3,
      collaborating: 1,
      working: 2,
      openSlots: 12,
    });
  });
});

/* ------------------------------------------------------------- activity */

const event = (kind: DistrictEvent["kind"], id: string): DistrictEvent => ({
  id,
  kind,
  actor_type: "agent",
  actor_id: null,
  actor_name: id,
  headline: id,
  body: id,
  cta_label: null,
  cta_href: null,
  created_at: "2026-09-05T17:50:00.000Z",
});

describe("room activity", () => {
  it("only lists room-shaped event kinds", () => {
    for (const kind of ROOM_ACTIVITY_KINDS) {
      expect(EVENT_KINDS).toContain(kind);
    }
    const feed = roomActivity([
      event("hired", "hired"),
      event("collaboration", "collab"),
      event("job_posted", "job"),
      event("live", "live"),
      event("guild_formed", "guild"),
    ]);
    expect(feed.map((row) => row.id)).toEqual(["collab", "live", "guild"]);
  });

  it("narrows collaboration requests to open calls", () => {
    const requests = collaborationRequests([
      event("live", "live"),
      event("looking_for_help", "help"),
      event("collaboration", "collab"),
    ]);
    expect(requests.map((row) => row.id)).toEqual(["help", "collab"]);
  });

  it("finds real room activity in the seeded feed", async () => {
    const events = await getRepo().listEvents({ limit: 40 });
    expect(roomActivity(events).length).toBeGreaterThan(0);
    expect(collaborationRequests(events).length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ chat */

const message = (id: string, body: string, roomSlug: string | null = null): LoungeMessage => ({
  id,
  room_slug: roomSlug,
  author_type: "agent",
  author_id: null,
  author_name: "Scout",
  body,
  created_at: `2026-09-05T17:${id.padStart(2, "0")}:00.000Z`,
});

describe("chat", () => {
  it("tokenises rooms and mentions without producing HTML", () => {
    const tokens = tokenizeChatBody("Just dropped a dataset in #research-pit — @MapFox FYI");
    expect(tokens.filter((t) => t.kind === "room")).toEqual([
      { kind: "room", value: "#research-pit", slug: "research-pit" },
    ]);
    expect(tokens.filter((t) => t.kind === "mention")).toEqual([
      { kind: "mention", value: "@MapFox", handle: "mapfox" },
    ]);
    expect(tokens.map((t) => t.value).join("")).toBe(
      "Just dropped a dataset in #research-pit — @MapFox FYI",
    );
  });

  it("handles a body with no tokens at all", () => {
    expect(tokenizeChatBody("plain line")).toEqual([{ kind: "text", value: "plain line" }]);
    expect(tokenizeChatBody("")).toEqual([]);
  });

  it("keeps the newest lines, oldest first", () => {
    const rows = [message("30", "c"), message("10", "a"), message("20", "b")];
    expect(chatTranscript(rows, 2).map((row) => row.body)).toEqual(["b", "c"]);
    expect(chatTranscript(rows, 99)).toHaveLength(3);
  });

  it("merges a poll result without duplicating a row", () => {
    const current = [message("10", "a"), message("20", "b")];
    const incoming = [message("20", "b"), message("30", "c")];
    const merged = mergeMessages(current, incoming, 10);
    expect(merged.map((row) => row.id)).toEqual(["10", "20", "30"]);
  });

  it("filters a transcript to one room", () => {
    const rows = [message("10", "a", "build-lab"), message("20", "b", "research-pit")];
    expect(messagesForRoom(rows, "build-lab").map((row) => row.body)).toEqual(["a"]);
    expect(messagesForRoom(rows, null)).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------- tv */

describe("District TV", () => {
  it("maps every filter chip onto a real channel kind", () => {
    expect(TV_FILTERS[0].label).toBe("All");
    for (const filter of TV_FILTERS) {
      if (filter.kind) expect(CHANNEL_KINDS).toContain(filter.kind);
    }
    expect(TV_FILTERS.some((f) => f.live)).toBe(true);
    // Every kind in the enum is reachable from the chip row.
    for (const kind of CHANNEL_KINDS) {
      expect(TV_FILTERS.some((filter) => filter.kind === kind)).toBe(true);
    }
  });

  it("produces the same ambient chat line for the same (slug, tick)", () => {
    const a = ambientChatLine("the-otto-and-wally-show", 3);
    const b = ambientChatLine("the-otto-and-wally-show", 3);
    expect(a).toEqual(b);
    expect(AMBIENT_CHAT_LINES).toContain(a.body);
    expect(ambientChatLine("research-race", 3)).not.toEqual(a);
  });

  it("has a live channel with hosts and chat in the seed", async () => {
    const repo = getRepo();
    const live = await repo.listChannels({ liveOnly: true });
    expect(live.length).toBeGreaterThan(0);
    const detail = await repo.getChannelBySlug("the-otto-and-wally-show");
    expect(detail?.is_live).toBe(true);
    expect(detail?.hosts.length).toBeGreaterThan(0);
    expect(detail?.chat.length).toBeGreaterThan(0);
  });
});

/* ----------------------------------------------------------- competitions */

describe("competitions", () => {
  it("ranks racers by progress, breaking ties on accuracy", async () => {
    const [race] = await getRepo().listCompetitions();
    const board = standings(race);
    expect(board[0].rank).toBe(1);
    expect(board[0].leader).toBe(true);
    for (let i = 1; i < board.length; i += 1) {
      expect(board[i - 1].progress).toBeGreaterThanOrEqual(board[i].progress);
      expect(board[i].leader).toBe(false);
      expect(board[i].rank).toBe(i + 1);
    }
  });

  it("puts live races first", () => {
    const make = (status: CompetitionWithEntries["status"], endsAt: string) =>
      ({
        id: `${status}-${endsAt}`,
        channel_id: "c",
        title: status,
        task: "",
        ends_at: endsAt,
        status,
        prize_cents: 0,
        created_at: endsAt,
        entries: [],
        channel: null,
      }) satisfies CompetitionWithEntries;

    const sorted = sortCompetitions([
      make("finished", "2026-09-05T10:00:00.000Z"),
      make("upcoming", "2026-09-06T10:00:00.000Z"),
      make("live", "2026-09-05T18:10:00.000Z"),
    ]);
    expect(sorted.map((row) => row.status)).toEqual(["live", "upcoming", "finished"]);
  });
});

/* ------------------------------------------------------------- showrooms */

describe("showrooms", () => {
  it("names four agents that exist in the District", async () => {
    const repo = getRepo();
    expect(SHOWROOMS.length).toBeGreaterThanOrEqual(4);
    for (const spec of SHOWROOMS) {
      const agent = await repo.getAgentByHandle(spec.agentHandle);
      expect(agent, `${spec.agentHandle} must be a seeded agent`).not.toBeNull();
      expect(spec.fields.length).toBe(spec.sample.length);
      expect(showroomFor(spec.agentHandle)).toBe(spec);
    }
    expect(showroomFor("not-a-showroom")).toBeNull();
  });

  it("is deterministic in the input", () => {
    const first = runShowroom("roofintel", "1234 Palm Dr, Orlando, FL");
    const again = runShowroom("roofintel", "  1234   Palm Dr, Orlando, FL  ");
    expect(first).toEqual(again);
    expect(runShowroom("roofintel", "9 Beach Rd, Stuart, FL")).not.toEqual(first);
  });

  it("returns a filled readout for every showroom", () => {
    for (const spec of SHOWROOMS) {
      const result = runShowroom(spec.agentHandle, spec.inputExample);
      expect(result, spec.agentHandle).not.toBeNull();
      expect(result!.agentName).toBe(spec.agentName);
      expect(result!.fields.length).toBeGreaterThanOrEqual(spec.fields.length);
      for (const field of result!.fields) {
        expect(field.value.length).toBeGreaterThan(0);
      }
      expect(result!.confidence).toBeGreaterThan(0.8);
      expect(result!.confidence).toBeLessThanOrEqual(1);
      expect(result!.durationSeconds).toBeGreaterThan(0);
      expect(result!.summary.length).toBeGreaterThan(10);
    }
  });

  it("refuses an unknown agent or an empty input", () => {
    expect(runShowroom("nobody", "anything")).toBeNull();
    expect(runShowroom("roofintel", "   ")).toBeNull();
  });

  it("quotes the address back on a RoofIntel run", () => {
    const result = runShowroom("roofintel", "77 Ocean Blvd, Stuart, FL")!;
    expect(result.fields[0]).toEqual({
      label: "Address",
      value: "77 Ocean Blvd, Stuart, FL",
    });
    expect(result.fields.map((f) => f.label)).toEqual(
      expect.arrayContaining(["Roof Area", "Est. Replacement", "Storm Risk"]),
    );
  });
});
