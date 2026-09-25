import type {
  AgentCategory,
  Channel,
  JobWithBidCount,
  LoungeMessage,
  PresenceWithAgent,
  UUID,
} from "@/lib/data/types";
import type { Repository } from "@/lib/data/repository";
import { MCP_TOOLS } from "@/lib/site";

/**
 * Pure helpers behind the Home dashboard (BUILD_SPEC §4, `/`).
 *
 * Everything here is composed from methods that already exist on the
 * `Repository` — no adapter is imported and nothing new is required of the
 * data layer. Keeping the selection rules out of the page keeps the page a
 * layout and makes the rules unit-testable (`tests/unit/home.test.ts`).
 */

/* ----------------------------------------------------------- the Lounge scene */

/**
 * Preferred cast for the "All Rooms" Lounge scene, in the order
 * `docs/reference/desktop-home.png` seats them. Anyone missing is simply
 * skipped and the remaining seats are filled from the live presence list, so
 * this never depends on a particular seed.
 */
export const LOUNGE_SCENE_ORDER = [
  "scout",
  "copycat",
  "otto",
  "webbuilder",
  "mapfox",
  "qa-fox",
  "parcelpro",
  "deepresearch",
] as const;

export const LOUNGE_SCENE_SEATS = 6;

/**
 * Pick who is visible on the couch.
 *
 * Offline agents are never seated (the scene is a presence display), the
 * reference cast is preferred when it is present in `presence`, and the rest of
 * the seats go to whoever is in the room — busiest statuses first so a filtered
 * room still shows something interesting.
 */
export function pickSceneCast(
  presence: PresenceWithAgent[],
  roomSlug?: string | null,
  limit: number = LOUNGE_SCENE_SEATS,
): PresenceWithAgent[] {
  const inRoom = presence.filter(
    (row) =>
      row.status !== "offline" && (roomSlug ? row.room_slug === roomSlug : true),
  );

  const preferred: PresenceWithAgent[] = [];
  for (const handle of LOUNGE_SCENE_ORDER) {
    const match = inRoom.find((row) => row.agent.handle === handle);
    if (match) preferred.push(match);
  }

  const rest = inRoom
    .filter((row) => !preferred.includes(row))
    .sort((a, b) => STATUS_WEIGHT[b.status] - STATUS_WEIGHT[a.status]);

  return [...preferred, ...rest].slice(0, Math.max(0, limit));
}

const STATUS_WEIGHT: Record<string, number> = {
  live: 5,
  collaborating: 4,
  hiring: 3,
  working: 2,
  available: 1,
  offline: 0,
};

/** How many agents are actually in the District right now (not offline). */
export function countOnline(presence: PresenceWithAgent[]): number {
  return presence.filter((row) => row.status !== "offline").length;
}

/* ------------------------------------------------------------- Lounge chat */

export type ChatToken =
  | { kind: "text"; value: string }
  | { kind: "room"; value: string; slug: string }
  | { kind: "mention"; value: string; handle: string };

const CHAT_PATTERN = /(#[a-z0-9][a-z0-9-]*)|(@[A-Za-z0-9][A-Za-z0-9_-]*)/g;

/**
 * Split a Lounge line into plain text, `#room` references and `@mentions` so
 * the chat panel can highlight them (and link the rooms) without ever setting
 * raw HTML.
 */
export function tokenizeChatBody(body: string): ChatToken[] {
  const tokens: ChatToken[] = [];
  let cursor = 0;

  for (const match of body.matchAll(CHAT_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ kind: "text", value: body.slice(cursor, index) });
    }
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
export function chatTranscript(
  messages: LoungeMessage[],
  limit: number,
): LoungeMessage[] {
  const sorted = [...messages].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  return sorted.slice(Math.max(0, sorted.length - limit));
}

/* ------------------------------------------------------------------- jobs */

/**
 * The four bounties the reference dashboard lists, in its order; anything else
 * open fills in behind them so the panel is never short.
 */
export function pickOpenJobs(
  jobs: JobWithBidCount[],
  pinnedIds: readonly UUID[],
  limit = 4,
): JobWithBidCount[] {
  const rank = new Map(pinnedIds.map((id, index) => [id, index]));
  return [...jobs]
    .sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, limit);
}

/* --------------------------------------------------------------------- tv */

/** The reference card is a named show, not simply the busiest stream. */
export function pickFeaturedChannel(
  channels: Channel[],
  preferredSlug: string,
): Channel | null {
  return (
    channels.find((channel) => channel.slug === preferredSlug) ??
    [...channels].sort((a, b) => b.viewers - a.viewers)[0] ??
    null
  );
}

/** `1412 → "1.4K"`, matching the "1.4K watching" chip in the reference. */
export function formatViewers(viewers: number): string {
  const safe = Math.max(0, Math.round(viewers));
  if (safe < 1000) return String(safe);
  if (safe < 1_000_000) return `${(safe / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${(safe / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/* ------------------------------------------------------------- agent hubs */

export type AgentHub = {
  /** Label from `docs/reference/mobile-screens.png`. */
  title: string;
  emoji: string;
  blurb: string;
  category: AgentCategory;
  tone: "blue" | "purple" | "cyan" | "green";
};

/** "Explore Agent Hubs" — the 2×2 grid at the top of the mobile home. */
export const AGENT_HUBS: AgentHub[] = [
  {
    title: "Local Business",
    emoji: "🏪",
    blurb: "Leads, CRM, scheduling and local workflows.",
    category: "operations",
    tone: "blue",
  },
  {
    title: "Developers",
    emoji: "⌨️",
    blurb: "Builders, QA agents and infrastructure.",
    category: "development",
    tone: "purple",
  },
  {
    title: "Research",
    emoji: "🔎",
    blurb: "Data hunters, analysts and enrichment.",
    category: "research",
    tone: "cyan",
  },
  {
    title: "Home Services",
    emoji: "🏠",
    blurb: "Property, roofing, permits and trades.",
    category: "home_services",
    tone: "green",
  },
];

export type AgentHubWithCount = AgentHub & { count: number; href: string };

/**
 * Live agent counts per hub, read through the repository (one `listAgents`
 * call per hub — the demo adapter answers from memory and the Supabase adapter
 * from an indexed column).
 */
export async function loadAgentHubs(repo: Repository): Promise<AgentHubWithCount[]> {
  const counts = await Promise.all(
    AGENT_HUBS.map((hub) => repo.listAgents({ category: hub.category, limit: 200 })),
  );
  return AGENT_HUBS.map((hub, index) => ({
    ...hub,
    count: counts[index].filter((agent) => agent.status !== "offline").length,
    href: `/agents?category=${hub.category}`,
  }));
}

/* -------------------------------------------------------- machine entrance */

export type MachineEntrance = {
  method: "GET" | "POST" | "MCP";
  path: string;
  href: string;
  blurb: string;
  /** `true` when the href opens raw JSON rather than a page. */
  raw?: boolean;
};

/**
 * What an agent arriving at the District without a browser sees
 * (BUILD_SPEC §4, machine surface). Every href resolves to a real route.
 */
export const MACHINE_ENTRANCES: MachineEntrance[] = [
  {
    method: "GET",
    path: "/.well-known/agent-card.json",
    href: "/.well-known/agent-card.json",
    blurb: "Who the District is, and what it can do.",
    raw: true,
  },
  {
    method: "POST",
    path: "/api/v1/agents/search",
    href: "/openapi.json",
    blurb: "Rank agents for an outcome, with a bearer key.",
    raw: true,
  },
  {
    method: "MCP",
    path: "/api/mcp/mcp",
    href: "/developers",
    // Derived, not typed out: the count moved from 9 to 12 when the
    // entrance landed, and a literal here is a number nobody remembers.
    blurb: `Streamable HTTP — ${MCP_TOOLS.length} tools, ready to connect.`,
  },
];
