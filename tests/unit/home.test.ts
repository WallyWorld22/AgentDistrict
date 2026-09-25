// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  AGENT_HUBS,
  LOUNGE_SCENE_ORDER,
  MACHINE_ENTRANCES,
  chatTranscript,
  countOnline,
  loadAgentHubs,
  pickFeaturedChannel,
  pickOpenJobs,
  pickSceneCast,
  tokenizeChatBody,
} from "@/lib/data/ext/home";
import { getRepo } from "@/lib/data";
import { FEATURED_CHANNEL_SLUG, HOME_JOB_SLUGS, jobId } from "@/lib/seed";
import type {
  Agent,
  Channel,
  JobWithBidCount,
  LoungeMessage,
  PresenceWithAgent,
} from "@/lib/data/types";

/**
 * The Home dashboard's selection rules (`lib/data/ext/home.ts`).
 *
 * Everything here is pure or composed from `getRepo()`; the page is only a
 * layout over these, so this is where the behaviour is pinned.
 */

function agent(handle: string, extra: Partial<Agent> = {}): Agent {
  return {
    id: `id-${handle}`,
    handle,
    name: handle,
    tagline: "",
    description: null,
    avatar_emoji: "🤖",
    avatar_gradient: null,
    owner_id: null,
    store_id: null,
    category: "research",
    skills: [],
    regions: [],
    status: "available",
    room_slug: "research-pit",
    pricing_model: "per_run",
    starting_price_cents: 10,
    verified: false,
    rating_avg: 4.5,
    rating_count: 1,
    jobs_completed: 0,
    repeat_hire_rate: 0,
    reliability: 0.9,
    dispute_rate: 0,
    avg_latency_sec: 30,
    endpoints: {},
    mcp_tools: [],
    is_free: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...extra,
  } as Agent;
}

function presence(
  handle: string,
  status: Agent["status"],
  room: string,
): PresenceWithAgent {
  return {
    agent_id: `id-${handle}`,
    room_slug: room,
    status,
    capacity: 8,
    queue_len: 1,
    updated_at: "2026-01-01T00:00:00.000Z",
    agent: agent(handle, { status, room_slug: room }),
  };
}

describe("pickSceneCast", () => {
  const rows = [
    presence("newsbrief", "available", "research-pit"),
    presence("webbuilder", "working", "build-lab"),
    presence("scout", "available", "research-pit"),
    presence("ghost", "offline", "research-pit"),
    presence("otto", "live", "creator-loft"),
  ];

  it("seats the reference cast first, in reference order", () => {
    const cast = pickSceneCast(rows);
    expect(cast.map((row) => row.agent.handle).slice(0, 3)).toEqual([
      "scout",
      "otto",
      "webbuilder",
    ]);
  });

  it("never seats an offline agent", () => {
    expect(pickSceneCast(rows).map((row) => row.agent.handle)).not.toContain("ghost");
  });

  it("filters to a single room", () => {
    expect(pickSceneCast(rows, "build-lab").map((row) => row.agent.handle)).toEqual([
      "webbuilder",
    ]);
    expect(pickSceneCast(rows, "nowhere")).toEqual([]);
  });

  it("respects the seat limit", () => {
    expect(pickSceneCast(rows, null, 2)).toHaveLength(2);
    expect(pickSceneCast(rows, null, 0)).toHaveLength(0);
  });

  it("falls back to live presence when none of the reference cast is around", () => {
    const others = [
      presence("caredesk", "available", "chill-zone"),
      presence("flowforge", "collaborating", "chill-zone"),
    ];
    // Busiest status first, so a filtered room still shows something happening.
    expect(pickSceneCast(others).map((row) => row.agent.handle)).toEqual([
      "flowforge",
      "caredesk",
    ]);
  });

  it("countOnline ignores offline rows", () => {
    expect(countOnline(rows)).toBe(4);
  });

  it("the reference order only names real handles", async () => {
    const repo = getRepo();
    for (const handle of LOUNGE_SCENE_ORDER) {
      expect(await repo.getAgentByHandle(handle), handle).not.toBeNull();
    }
  });
});

describe("tokenizeChatBody", () => {
  it("splits out #rooms and @mentions", () => {
    expect(tokenizeChatBody("Just dropped a new dataset in #research-pit")).toEqual([
      { kind: "text", value: "Just dropped a new dataset in " },
      { kind: "room", value: "#research-pit", slug: "research-pit" },
    ]);
    expect(tokenizeChatBody("@MapFox I got you.")).toEqual([
      { kind: "mention", value: "@MapFox", handle: "mapfox" },
      { kind: "text", value: " I got you." },
    ]);
  });

  it("leaves plain text untouched and lossless", () => {
    const body = "No references at all — just a sentence.";
    expect(tokenizeChatBody(body)).toEqual([{ kind: "text", value: body }]);
  });

  it("round-trips every token back to the original body", () => {
    const body = "ping @scout and @qa-fox in #build-lab or #chill-zone, thanks!";
    expect(tokenizeChatBody(body).map((token) => token.value).join("")).toBe(body);
  });
});

describe("chatTranscript", () => {
  const message = (id: string, minutesAgo: number): LoungeMessage => ({
    id,
    room_slug: null,
    author_type: "agent",
    author_id: null,
    author_name: id,
    body: id,
    created_at: new Date(Date.UTC(2026, 8, 5, 18, -minutesAgo)).toISOString(),
  });

  it("returns the newest N, oldest first", () => {
    const rows = [message("a", 30), message("b", 2), message("c", 10)];
    expect(chatTranscript(rows, 2).map((row) => row.id)).toEqual(["c", "b"]);
  });

  it("is a no-op when there are fewer rows than the limit", () => {
    expect(chatTranscript([message("a", 1)], 6)).toHaveLength(1);
    expect(chatTranscript([], 6)).toEqual([]);
  });
});

describe("pickOpenJobs", () => {
  const job = (id: string): JobWithBidCount =>
    ({ id, title: id, bidCount: 0 }) as JobWithBidCount;

  it("puts the pinned reference jobs first, in order", () => {
    const jobs = [job("x"), job("b"), job("a"), job("y")];
    expect(pickOpenJobs(jobs, ["a", "b"], 4).map((row) => row.id)).toEqual([
      "a",
      "b",
      "x",
      "y",
    ]);
  });

  it("fills up to the limit from whatever is open", () => {
    expect(pickOpenJobs([job("x"), job("y")], [], 4).map((row) => row.id)).toEqual([
      "x",
      "y",
    ]);
  });

  it("matches the four bounties the reference dashboard lists", async () => {
    const repo = getRepo();
    const jobs = await repo.listJobs({ status: "open", limit: 24 });
    const picked = pickOpenJobs(
      jobs,
      HOME_JOB_SLUGS.map((slug) => jobId(slug)),
    );
    expect(picked.map((row) => row.id)).toEqual(HOME_JOB_SLUGS.map((s) => jobId(s)));
  });
});

describe("pickFeaturedChannel", () => {
  // The fallback ranks on `followers` — a real row count. It used to rank on
  // `channels.viewers`, a spectator figure nothing in the District measures.
  const channel = (slug: string, followers: number): Channel =>
    ({ slug, followers, is_live: true }) as Channel;

  it("prefers the named show over the best-followed stream", () => {
    const picked = pickFeaturedChannel(
      [channel("research-race", 9000), channel("the-show", 10)],
      "the-show",
    );
    expect(picked?.slug).toBe("the-show");
  });

  it("falls back to the best-followed live channel, then to null", () => {
    expect(
      pickFeaturedChannel([channel("a", 5), channel("b", 900)], "missing")?.slug,
    ).toBe("b");
    expect(pickFeaturedChannel([], "missing")).toBeNull();
  });

  it("the seeded featured channel really is live and has two hosts", async () => {
    const detail = await getRepo().getChannelBySlug(FEATURED_CHANNEL_SLUG);
    expect(detail?.is_live).toBe(true);
    expect(detail?.hosts.length).toBeGreaterThanOrEqual(2);
  });
});

describe("agent hubs", () => {
  it("names the four hubs from the mobile reference", () => {
    expect(AGENT_HUBS.map((hub) => hub.title)).toEqual([
      "Local Business",
      "Developers",
      "Research",
      "Home Services",
    ]);
  });

  it("counts live agents per hub and links into the directory", async () => {
    const hubs = await loadAgentHubs(getRepo());
    expect(hubs).toHaveLength(4);
    for (const hub of hubs) {
      expect(hub.href).toBe(`/agents?category=${hub.category}`);
      expect(hub.count).toBeGreaterThan(0);
    }
  });
});

describe("machine entrance", () => {
  it("lists the three §4 entry points with in-app hrefs", () => {
    expect(MACHINE_ENTRANCES.map((entry) => entry.path)).toEqual([
      "/.well-known/agent-card.json",
      "/api/v1/agents/search",
      "/api/mcp/mcp",
    ]);
    for (const entry of MACHINE_ENTRANCES) {
      expect(entry.href.startsWith("/")).toBe(true);
    }
  });
});
