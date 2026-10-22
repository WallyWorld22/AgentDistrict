import type {
  Channel,
  ChannelKind,
  Competition,
  CompetitionWithEntries,
  DistrictEvent,
  EventKind,
  LoungeMessage,
  PresenceWithAgent,
  RoomWithCounts,
} from "@/lib/data/types";

/**
 * Pure helpers behind The Lounge, District TV, Competitions and the Showrooms
 * (BUILD_SPEC §4).
 *
 * Everything here is composed from data the `Repository` already returns — no
 * adapter is imported and nothing new is asked of the data layer. Keeping the
 * selection, formatting and simulation rules out of the pages keeps the pages
 * layouts and makes the rules unit-testable (`tests/unit/lounge.test.ts`).
 *
 * Nothing in this file calls `Math.random()` or `Date.now()`: every "live"
 * number is derived from a seeded string hash or from an injected clock, so the
 * server render and the client hydration agree and screenshots are stable.
 */

/* -------------------------------------------------------------------------- */
/* Deterministic hashing                                                       */
/* -------------------------------------------------------------------------- */

/** FNV-1a, 32-bit. Stable across runtimes — the showroom demos depend on it. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** `hashString` reduced into `[min, max]` inclusive, keyed by `salt`. */
export function hashInRange(
  input: string,
  salt: string,
  min: number,
  max: number,
): number {
  if (max <= min) return min;
  return min + (hashString(`${salt}:${input}`) % (max - min + 1));
}

/** Deterministic pick from a non-empty list. */
export function hashPick<T>(input: string, salt: string, options: readonly T[]): T {
  return options[hashString(`${salt}:${input}`) % options.length];
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

/*
 * `formatViewers` used to live here (`1412 → "1.4K"`), for the "1.4K watching"
 * chips on District TV. Nothing in the District counts an audience, so the
 * chips are gone and so is the formatter.
 */

/** `521 → "08:41"` — the countdown format the legacy race card used. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

/** Whole seconds left on a competition, from an injected clock. Never negative. */
export function secondsUntil(endsAt: string, now: number): number {
  const end = Date.parse(endsAt);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - now) / 1000));
}

/** How long a benchmark heat runs once the seeded clock has been used up. */
export const RACE_HEAT_SECONDS = 900;

/**
 * Seconds left on a race's clock.
 *
 * For an `upcoming` or `finished` competition this is simply `ends_at − now`.
 * A **live** race is different: the District's demo clock is the seed epoch plus
 * process uptime, so a server left running for longer than the seeded race
 * (8m 41s for The Research Race) would show a permanently dead `00:00` on a
 * stream that is still marked live. Benchmarks run in heats, so once the seeded
 * clock is spent the next heat starts — still a pure function of `now`, so the
 * server render and the client countdown agree.
 */
export function raceSecondsRemaining(
  competition: Pick<Competition, "ends_at" | "status">,
  now: number,
): number {
  const remaining = secondsUntil(competition.ends_at, now);
  if (remaining > 0 || competition.status !== "live") return remaining;

  const end = Date.parse(competition.ends_at);
  if (Number.isNaN(end)) return 0;
  const overrun = Math.floor((now - end) / 1000);
  return RACE_HEAT_SECONDS - (overrun % RACE_HEAT_SECONDS);
}

/* -------------------------------------------------------------------------- */
/* The Lounge — rooms                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Where each room sits in the big Lounge hall, as percentages of the scene box.
 * Keyed by slug so an unknown room still lands somewhere sensible (the fallback
 * spreads leftovers along the back wall).
 */
export type RoomZoneGeometry = {
  /** Percent from the left edge of the scene. */
  left: number;
  /** Percent from the top edge of the scene. */
  top: number;
  /** Percent width of the zone. */
  width: number;
  /** Accent used for the zone's glow. */
  glow: string;
};

const ZONE_GEOMETRY: Record<string, RoomZoneGeometry> = {
  "research-pit": { left: 3, top: 12, width: 29, glow: "#4ee7ff" },
  "build-lab": { left: 35.5, top: 8, width: 29, glow: "#8e5cff" },
  "creator-loft": { left: 68, top: 12, width: 29, glow: "#df6cff" },
  "home-services": { left: 3, top: 52, width: 29, glow: "#46e39a" },
  "growth-booth": { left: 35.5, top: 56, width: 29, glow: "#ffd66b" },
  "chill-zone": { left: 68, top: 52, width: 29, glow: "#48a8ff" },
};

const FALLBACK_GLOWS = ["#4ee7ff", "#8e5cff", "#df6cff", "#46e39a", "#ffd66b", "#48a8ff"];

export type RoomZone = RoomWithCounts & RoomZoneGeometry & { href: string };

/** Lay the rooms out as glowing zones in the hall. */
export function roomZones(rooms: RoomWithCounts[]): RoomZone[] {
  return rooms.map((room, index) => {
    const geometry =
      ZONE_GEOMETRY[room.slug] ??
      ({
        left: 3 + (index % 3) * 32.5,
        top: index < 3 ? 12 : 52,
        width: 29,
        glow: FALLBACK_GLOWS[index % FALLBACK_GLOWS.length],
      } satisfies RoomZoneGeometry);
    return { ...room, ...geometry, href: `/lounge/${room.slug}` };
  });
}

/** "12 agents • 84 open slots" — the caption style the legacy hall used. */
export function roomOccupancyLine(room: RoomWithCounts): string {
  const agents = `${room.presenceCount.toLocaleString("en-US")} ${
    room.presenceCount === 1 ? "agent" : "agents"
  }`;
  const slots = `${room.openSlots.toLocaleString("en-US")} open slots`;
  return `${agents} • ${slots}`;
}

const STATUS_WEIGHT: Record<string, number> = {
  live: 5,
  collaborating: 4,
  hiring: 3,
  working: 2,
  available: 1,
  offline: 0,
};

/**
 * Who is visible in the hall. Offline agents are never seated (the hall is a
 * presence display) and the busiest statuses lead, so a filtered room still
 * shows something worth looking at.
 */
export function seatedPresence(
  presence: PresenceWithAgent[],
  roomSlug?: string | null,
  limit = 10,
): PresenceWithAgent[] {
  return presence
    .filter(
      (row) =>
        row.status !== "offline" && (roomSlug ? row.room_slug === roomSlug : true),
    )
    .sort(
      (a, b) =>
        STATUS_WEIGHT[b.status] - STATUS_WEIGHT[a.status] ||
        a.agent.name.localeCompare(b.agent.name),
    )
    .slice(0, Math.max(0, limit));
}

/** Open slots an agent still has, floored at zero. */
export function openSlots(row: PresenceWithAgent): number {
  return Math.max(0, row.capacity - row.queue_len);
}

/** Headline numbers over the hall. */
export function loungeTotals(
  rooms: RoomWithCounts[],
  presence: PresenceWithAgent[],
): { online: number; collaborating: number; working: number; openSlots: number } {
  return {
    online: presence.filter((row) => row.status !== "offline").length,
    collaborating: presence.filter((row) => row.status === "collaborating").length,
    working: presence.filter((row) => row.status === "working" || row.status === "live")
      .length,
    openSlots: rooms.reduce((total, room) => total + room.openSlots, 0),
  };
}

/* -------------------------------------------------------------------------- */
/* The Lounge — live activity                                                  */
/* -------------------------------------------------------------------------- */

/**
 * "Live room activity" only shows what actually happens *in* a room: agents
 * teaming up, guilds forming, someone hiring help, someone going live. The
 * marketplace kinds (`hired`, `job_posted`, …) belong to the District feed.
 */
export const ROOM_ACTIVITY_KINDS: readonly EventKind[] = [
  "collaboration",
  "guild_formed",
  "looking_for_help",
  "live",
];

/** The eyebrow each activity kind wears in the room feed. */
export const ROOM_ACTIVITY_LABELS: Record<string, string> = {
  collaboration: "COLLABORATION",
  guild_formed: "GUILD FORMED",
  looking_for_help: "HIRING",
  live: "LIVE EVENT",
};

export function roomActivity(events: DistrictEvent[], limit = 6): DistrictEvent[] {
  return events
    .filter((event) => ROOM_ACTIVITY_KINDS.includes(event.kind))
    .slice(0, Math.max(0, limit));
}

/** The subset of the activity feed that reads as an open call for a partner. */
export function collaborationRequests(
  events: DistrictEvent[],
  limit = 4,
): DistrictEvent[] {
  return events
    .filter(
      (event) => event.kind === "looking_for_help" || event.kind === "collaboration",
    )
    .slice(0, Math.max(0, limit));
}

/* -------------------------------------------------------------------------- */
/* Chat                                                                        */
/* -------------------------------------------------------------------------- */

export type ChatToken =
  | { kind: "text"; value: string }
  | { kind: "room"; value: string; slug: string }
  | { kind: "mention"; value: string; handle: string };

const CHAT_PATTERN = /(#[a-z0-9][a-z0-9-]*)|(@[A-Za-z0-9][A-Za-z0-9_.-]*)/g;

/**
 * Split a chat line into plain text, `#room` references and `@mentions` so the
 * transcript can highlight them (and link the rooms) without ever setting raw
 * HTML.
 */
export function tokenizeChatBody(body: string): ChatToken[] {
  const tokens: ChatToken[] = [];
  let cursor = 0;

  for (const match of body.matchAll(CHAT_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ kind: "text", value: body.slice(cursor, index) });
    const value = match[0];
    if (value.startsWith("#")) {
      tokens.push({ kind: "room", value, slug: value.slice(1).toLowerCase() });
    } else {
      tokens.push({ kind: "mention", value, handle: value.slice(1).toLowerCase() });
    }
    cursor = index + value.length;
  }

  if (cursor < body.length) tokens.push({ kind: "text", value: body.slice(cursor) });
  return tokens;
}

/** Oldest → newest, capped, so the composer always sits under the latest line. */
export function chatTranscript<T extends { created_at: string; id: string }>(
  messages: T[],
  limit: number,
): T[] {
  const sorted = [...messages].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  );
  return sorted.slice(Math.max(0, sorted.length - limit));
}

/** Merge a poll/realtime result into the transcript without duplicating rows. */
export function mergeMessages<T extends { id: string; created_at: string }>(
  current: T[],
  incoming: T[],
  limit: number,
): T[] {
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return chatTranscript([...byId.values()], limit);
}

/** Rooms a lounge message belongs to, for the panel's room filter. */
export function messagesForRoom(
  messages: LoungeMessage[],
  roomSlug?: string | null,
): LoungeMessage[] {
  if (!roomSlug) return messages;
  return messages.filter((message) => message.room_slug === roomSlug);
}

/* -------------------------------------------------------------------------- */
/* District TV                                                                 */
/* -------------------------------------------------------------------------- */

export type TvFilter = {
  label: string;
  /** `undefined` on the "All"/"Live now" chips. */
  kind?: ChannelKind;
  live?: boolean;
};

/**
 * The filter row from `docs/reference/mobile-screens.png` ("Live · Talk · Build
 * · Demos · Agents"), plus Competitions, mapped onto the `channel_kind` enum.
 */
export const TV_FILTERS: TvFilter[] = [
  { label: "All" },
  { label: "Live", live: true },
  { label: "Talk", kind: "talk" },
  { label: "Build", kind: "build" },
  { label: "Demos", kind: "demo" },
  { label: "Agents", kind: "show" },
  { label: "Competitions", kind: "competition" },
];

/**
 * Viewer chatter District TV rotates in between real lines, so an idle stream
 * still feels populated. Deterministic: the component advances an index on a
 * timer, it never picks at random.
 */
export const AMBIENT_CHAT_LINES: readonly string[] = [
  "just got here — what did I miss",
  "the hire button on the overlay actually works, that is wild",
  "how is it this fast",
  "someone clip that",
  "ok the output contract thing makes so much more sense now",
  "chat, is this real time or a replay",
  "hired the demo agent mid-stream, 40 seconds and it delivered",
  "this is better than most of my meetings",
  "the accuracy column is the only column",
  "put the leaderboard back up",
  "does it do Florida",
  "watching this instead of working, worth it",
];

export const AMBIENT_CHAT_AUTHORS: readonly string[] = [
  "buildwithjess",
  "agentmax",
  "devdan",
  "lana.ai",
  "maria.work",
  "scale_j",
  "tampa_tess",
  "orlando_omar",
  "nina.ops",
  "roofco_ray",
];

/** The `n`th ambient line for a channel — stable for a given (slug, tick). */
export function ambientChatLine(
  slug: string,
  tick: number,
): { author: string; body: string } {
  const seed = hashString(`${slug}:${tick}`);
  return {
    author: AMBIENT_CHAT_AUTHORS[seed % AMBIENT_CHAT_AUTHORS.length],
    body: AMBIENT_CHAT_LINES[(seed >>> 8) % AMBIENT_CHAT_LINES.length],
  };
}

/**
 * A channel page's "More like this" row: same kind first, then live, then
 * followers; never the channel itself.
 *
 * Generic over the row so the hosts `listChannels()` already returns ride
 * along to the tiles. The page used to re-fetch each tile's full channel detail
 * (hosts, chat and race) just to draw its hosts.
 */
export function relatedChannels<T extends Channel>(
  channel: Pick<Channel, "slug" | "kind">,
  everyChannel: T[],
  limit = 4,
): T[] {
  return everyChannel
    .filter((entry) => entry.slug !== channel.slug)
    .sort(
      (a, b) =>
        Number(b.kind === channel.kind) - Number(a.kind === channel.kind) ||
        Number(b.is_live) - Number(a.is_live) ||
        b.followers - a.followers,
    )
    .slice(0, limit);
}

/** The "Autonomous studio runtime" explainer tiles from the legacy TV page. */
export const STUDIO_RUNTIME_TILES: ReadonlyArray<{
  value: string;
  label: string;
  hint: string;
  icon: string;
  tone: "green" | "purple" | "cyan" | "blue";
}> = [
  {
    value: "LOCAL",
    label: "Agent brain",
    hint: "$0 API per frame",
    icon: "🧠",
    tone: "purple",
  },
  {
    value: "LOCAL",
    label: "Voice / TTS",
    hint: "$0 API per line",
    icon: "🗣️",
    tone: "cyan",
  },
  {
    value: "60 FPS",
    label: "Realtime renderer",
    hint: "Scene runs on the GPU",
    icon: "🎮",
    tone: "blue",
  },
  {
    value: "IDLE",
    label: "Video generation",
    hint: "Cutscenes only",
    icon: "🎞️",
    tone: "green",
  },
];

export const STUDIO_PIPELINE =
  "PRODUCER → WRITER → CHARACTER AGENTS → DIRECTOR → TTS → RENDERER → STREAM";

/* -------------------------------------------------------------------------- */
/* Competitions                                                                */
/* -------------------------------------------------------------------------- */

export type CompetitionStanding = {
  agentHandle: string;
  agentName: string;
  avatarEmoji: string;
  avatarGradient: string | null;
  progress: number;
  accuracy: number;
  /** 1-based, ordered by progress then accuracy. */
  rank: number;
  leader: boolean;
};

/** Rank the racers: progress first, accuracy breaks the tie. */
export function standings(competition: CompetitionWithEntries): CompetitionStanding[] {
  return [...competition.entries]
    .sort((a, b) => b.progress - a.progress || b.accuracy - a.accuracy)
    .map((entry, index) => ({
      agentHandle: entry.agent.handle,
      agentName: entry.agent.name,
      avatarEmoji: entry.agent.avatar_emoji,
      avatarGradient: entry.agent.avatar_gradient ?? null,
      progress: entry.progress,
      accuracy: entry.accuracy,
      rank: index + 1,
      leader: index === 0,
    }));
}

/** Live races first, then upcoming, then finished; each group newest first. */
export function sortCompetitions(
  competitions: CompetitionWithEntries[],
): CompetitionWithEntries[] {
  const order = { live: 0, upcoming: 1, finished: 2 } as const;
  return [...competitions].sort(
    (a, b) =>
      (order[a.status] ?? 3) - (order[b.status] ?? 3) ||
      Date.parse(a.ends_at) - Date.parse(b.ends_at),
  );
}

/* -------------------------------------------------------------------------- */
/* Showrooms                                                                   */
/* -------------------------------------------------------------------------- */

export type ShowroomField = {
  label: string;
  /** Filled in by `runShowroom`; the catalog entry only names the field. */
  value?: string;
};

export type ShowroomSpec = {
  agentHandle: string;
  agentName: string;
  /** What the demo is called on the card. */
  title: string;
  blurb: string;
  /** "Parcel → Analysis → Report". */
  pipeline: string;
  durationLabel: string;
  gradient: string;
  glyph: string;
  /** The scene the card draws behind the readout. */
  scene: "parcel" | "grid" | "page" | "copy";
  /** Prompt for the "try it" sheet. */
  inputLabel: string;
  inputPlaceholder: string;
  inputExample: string;
  /** Field labels, revealed one at a time. */
  fields: string[];
  /** The static readout shown before anyone tries it. */
  sample: string[];
};

/**
 * The showroom floor (BUILD_SPEC §4 `/showrooms`). RoofIntel's readout is the
 * one from `docs/reference/desktop-home.png`, verbatim.
 */
export const SHOWROOMS: ShowroomSpec[] = [
  {
    agentHandle: "roofintel",
    agentName: "RoofIntel",
    title: "Property Analysis Agent",
    blurb:
      "Give it an address. It pulls the parcel, measures the roof, checks permit history and storm exposure, and returns a reroof score.",
    pipeline: "Parcel → Analysis → Report",
    durationLabel: "30 seconds",
    gradient: "linear-gradient(150deg,#123b2c,#1d6b4a 55%,#08211a)",
    glyph: "🏠",
    scene: "parcel",
    inputLabel: "Property address",
    inputPlaceholder: "1234 Palm Dr, Orlando, FL",
    inputExample: "1234 Palm Dr, Orlando, FL",
    fields: ["Address", "Roof Area", "Est. Replacement", "Storm Risk"],
    sample: ["1234 Palm Dr, Orlando, FL", "2,148 sq ft", "$12,400 – $14,800", "Moderate"],
  },
  {
    agentHandle: "scout",
    agentName: "Scout",
    title: "Local Lead Search",
    blurb:
      "Describe the list you want. Scout finds the businesses, verifies contacts against a second source and flags anything it is not sure about.",
    pipeline: "Search → Verify → Export",
    durationLabel: "2 minutes",
    gradient: "linear-gradient(150deg,#10233f,#2f6fd0 55%,#07111f)",
    glyph: "🔭",
    scene: "grid",
    inputLabel: "What should Scout find?",
    inputPlaceholder: "400 pool contractors in Florida",
    inputExample: "400 pool contractors in Florida",
    fields: ["Query", "Rows found", "Verified emails", "Flagged for review"],
    sample: ["Roofing companies · Tampa, FL", "512 rows", "486 verified", "3 flagged"],
  },
  {
    agentHandle: "webbuilder",
    agentName: "WebBuilder",
    title: "Landing Page Builder",
    blurb:
      "One brief in, a deployable page out — sections, copy, images and a Lighthouse pass before it hands you the preview URL.",
    pipeline: "Brief → Sections → Deploy preview",
    durationLabel: "4 minutes",
    gradient: "linear-gradient(150deg,#2a1b5e,#6a3fd0 55%,#160e33)",
    glyph: "🧩",
    scene: "page",
    inputLabel: "What is the page for?",
    inputPlaceholder: "Roofing company in Stuart, FL — free inspections",
    inputExample: "Roofing company in Stuart, FL — free inspections",
    fields: ["Sections", "Lighthouse", "Assets", "Preview"],
    sample: [
      "Hero, proof, offer, FAQ, CTA",
      "98 / 100 / 100 / 100",
      "12 optimised · 214 KB",
      "static bundle + URL",
    ],
  },
  {
    agentHandle: "copycat",
    agentName: "CopyCat",
    title: "Offer Copy Preview",
    blurb:
      "Name the product. CopyCat returns a headline, a subhead, three proof bullets and the CTA — in the voice you asked for.",
    pipeline: "Brief → Angles → Copy",
    durationLabel: "45 seconds",
    gradient: "linear-gradient(150deg,#3c1250,#b34ad6 55%,#1a0722)",
    glyph: "✍️",
    scene: "copy",
    inputLabel: "What are we selling?",
    inputPlaceholder: "Storm-season roof inspections on the Treasure Coast",
    inputExample: "Storm-season roof inspections on the Treasure Coast",
    fields: ["Headline", "Subhead", "Proof", "Call to action"],
    sample: [
      "Know your roof before the season does",
      "A 30-second read on any Florida address",
      "3 bullets, sourced",
      "Get my roof report",
    ],
  },
];

export function showroomFor(handle: string): ShowroomSpec | null {
  return SHOWROOMS.find((entry) => entry.agentHandle === handle) ?? null;
}

export type ShowroomResult = {
  agentHandle: string;
  agentName: string;
  /** Echo of what the visitor typed, normalised. */
  input: string;
  fields: Array<{ label: string; value: string }>;
  /** One-line verdict under the table. */
  summary: string;
  /** Wall-clock the simulated run "took". */
  durationSeconds: number;
  confidence: number;
};

const STORM_RISK = ["Low", "Moderate", "Elevated", "High"] as const;
const VOICES = ["direct", "warm", "urgent", "plain-spoken"] as const;

/**
 * Run a showroom demo. Deterministic in the input string, so the same address
 * always returns the same report — this is a **simulated preview**, not a real
 * lookup, and no external service is ever called.
 */
export function runShowroom(handle: string, rawInput: string): ShowroomResult | null {
  const spec = showroomFor(handle);
  if (!spec) return null;
  const input = rawInput.trim().replace(/\s+/g, " ").slice(0, 120);
  if (input.length === 0) return null;

  const confidence = hashInRange(input, "confidence", 88, 99) / 100;
  const durationSeconds = hashInRange(input, "duration", 18, 96);

  if (handle === "roofintel") {
    const area = hashInRange(input, "area", 1420, 3260);
    const low = Math.round((area * hashInRange(input, "rate", 520, 760)) / 100 / 100) * 100;
    const high = low + Math.round(low * 0.18);
    const risk = hashPick(input, "risk", STORM_RISK);
    const ageYears = hashInRange(input, "age", 3, 28);
    // The reroof score is a *priority*, so it has to follow the roof's age and
    // its storm exposure rather than being an independent random number.
    const reroofScore = Math.max(
      5,
      Math.min(99, Math.round(ageYears * 2.6 + STORM_RISK.indexOf(risk) * 9 + 11)),
    );
    return {
      agentHandle: handle,
      agentName: spec.agentName,
      input,
      fields: [
        { label: "Address", value: input },
        { label: "Roof Area", value: `${area.toLocaleString("en-US")} sq ft` },
        {
          label: "Est. Replacement",
          value: `$${low.toLocaleString("en-US")} – $${high.toLocaleString("en-US")}`,
        },
        { label: "Storm Risk", value: risk },
        { label: "Permits on file", value: `${hashInRange(input, "permits", 0, 6)}` },
        { label: "Reroof score", value: `${reroofScore} / 100` },
      ],
      summary: `${risk.toLowerCase()} storm exposure · ${ageYears}-year-old roof · comps drawn from ${hashInRange(input, "comps", 12, 48)} nearby parcels`,
      durationSeconds,
      confidence,
    };
  }

  if (handle === "scout") {
    const rows = hashInRange(input, "rows", 120, 940);
    const verified = Math.round(rows * (hashInRange(input, "verify", 86, 97) / 100));
    const flagged = hashInRange(input, "flag", 0, 9);
    return {
      agentHandle: handle,
      agentName: spec.agentName,
      input,
      fields: [
        { label: "Query", value: input },
        { label: "Rows found", value: `${rows.toLocaleString("en-US")} rows` },
        { label: "Verified emails", value: `${verified.toLocaleString("en-US")} verified` },
        { label: "Flagged for review", value: `${flagged} flagged` },
        { label: "Phone coverage", value: `${hashInRange(input, "phone", 61, 94)}%` },
        { label: "Output", value: "CSV + JSON, one row per business" },
      ],
      summary: `every contact checked against a second source · ${flagged} row${flagged === 1 ? "" : "s"} held back for a human`,
      durationSeconds,
      confidence,
    };
  }

  if (handle === "webbuilder") {
    const sections = hashInRange(input, "sections", 4, 8);
    const assets = hashInRange(input, "assets", 8, 24);
    const weight = hashInRange(input, "weight", 118, 386);
    return {
      agentHandle: handle,
      agentName: spec.agentName,
      input,
      fields: [
        { label: "Sections", value: `${sections} — hero, proof, offer, FAQ, CTA` },
        {
          label: "Lighthouse",
          value: `${hashInRange(input, "lh", 92, 100)} / 100 / 100 / ${hashInRange(input, "seo", 90, 100)}`,
        },
        { label: "Assets", value: `${assets} optimised · ${weight} KB` },
        { label: "Preview", value: `preview-${hashString(input).toString(36).slice(0, 6)}.agentdistrict.dev` },
        { label: "Copy blocks", value: `${sections * 2} written, ${sections} A/B variants` },
        { label: "Output", value: "Static bundle + preview URL" },
      ],
      summary: `built from your brief in one pass · ${weight} KB total, no framework shipped to the visitor`,
      durationSeconds,
      confidence,
    };
  }

  // copycat
  const voice = hashPick(input, "voice", VOICES);
  const subject = input.replace(/^(a|an|the)\s+/i, "");
  return {
    agentHandle: handle,
    agentName: spec.agentName,
    input,
    fields: [
      {
        label: "Headline",
        value: hashPick(input, "headline", [
          `The ${subject} question, answered in 30 seconds`,
          `Stop guessing about ${subject}`,
          `${subject} — priced before you pick up the phone`,
          `Know about ${subject} before it costs you`,
        ]),
      },
      {
        label: "Subhead",
        value: `One address in, a straight answer out. No sales call to get a number.`,
      },
      {
        label: "Proof",
        value: `${hashInRange(input, "proof", 3, 5)} bullets, each with a source line`,
      },
      {
        label: "Call to action",
        value: hashPick(input, "cta", [
          "Get my report",
          "Show me the number",
          "Run it on my address",
          "See what it finds",
        ]),
      },
      { label: "Voice", value: voice },
      { label: "Variants", value: `${hashInRange(input, "variants", 2, 5)} angles to test` },
    ],
    summary: `written in a ${voice} voice · every claim carries a source line`,
    durationSeconds,
    confidence,
  };
}
