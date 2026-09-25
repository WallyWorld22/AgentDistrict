// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import {
  FEED_PAGE_SIZE,
  JOIN_PROTOCOL_STEPS,
  POST_KIND,
  SEND_AGENT_STEPS,
  eventKindLabel,
  firstPostCurl,
  indexAgentsById,
  joinLine,
  loadEntrance,
  loadEventActors,
  loadFeed,
  registerCurl,
  toFeedItem,
} from "@/lib/data/ext/feed";
import { createDemoRepository, type DemoRepository } from "@/lib/data/demo";
import { EVENT_KIND_LABELS, type DistrictEvent } from "@/lib/data/types";
import {
  DEMO_PROFILE_ID,
  SEED_EPOCH_MS,
  agent as seedAgent,
  minutesAgo,
} from "@/lib/seed";

/**
 * The District entrance's read side: `/feed`, the Home counter strip and the
 * "recent arrivals" list are all layouts over `lib/data/ext/feed.ts`.
 *
 * Driven against a real demo repository with an injected clock, because the
 * things worth pinning here are relationships between reads — a page of posts
 * and the Passports behind them, the count and the arrivals — not the shape of
 * a single object.
 */

let repo: DemoRepository;

beforeEach(() => {
  // A fresh District per test: the demo store is mutable and two of these
  // register an agent or publish a post.
  repo = createDemoRepository({ now: () => SEED_EPOCH_MS });
});

function registration(handle: string) {
  return {
    handle,
    name: `Agent ${handle}`,
    tagline: "Joined over the API, like a stranger should be able to.",
    category: "research" as const,
    skills: ["research"],
  };
}

/* -------------------------------------------------------------------------- */
/* The `post` kind                                                             */
/* -------------------------------------------------------------------------- */

describe("the post kind", () => {
  it("is a real member of EventKind, labelled from the shared map", () => {
    // Not a widened string literal: the API writes this kind, the feed reads
    // it, and a typo would otherwise only surface as an empty page.
    expect(POST_KIND).toBe("post");
    expect(eventKindLabel(POST_KIND)).toBe(EVENT_KIND_LABELS.post);
    expect(eventKindLabel("hired")).toBe(EVENT_KIND_LABELS.hired);
  });
});

/* -------------------------------------------------------------------------- */
/* loadFeed                                                                    */
/* -------------------------------------------------------------------------- */

describe("loadFeed", () => {
  it("shows only posts in the posts view, newest first", async () => {
    const feed = await loadFeed(repo, { view: "posts", now: SEED_EPOCH_MS });

    expect(feed.items.length).toBeGreaterThan(0);
    expect(new Set(feed.items.map((item) => item.kind))).toEqual(new Set(["post"]));
    expect(feed.items.every((item) => item.isPost)).toBe(true);

    const stamps = feed.items.map((item) => item.createdAt);
    expect([...stamps].sort((a, b) => b.localeCompare(a))).toEqual(stamps);
  });

  it("shows every kind in the all view", async () => {
    const all = await loadFeed(repo, { view: "all", now: SEED_EPOCH_MS });
    const kinds = new Set(all.items.map((item) => item.kind));

    expect(kinds.size).toBeGreaterThan(1);
    expect(all.items.some((item) => !item.isPost)).toBe(true);
  });

  it("resolves an agent actor to its Passport and a system actor to its name", async () => {
    const all = await loadFeed(repo, { view: "all", perPage: 50, now: SEED_EPOCH_MS });

    const byAgent = all.items.find((item) => item.actor.type === "agent");
    expect(byAgent?.actor.handle).toBeTruthy();
    expect(byAgent?.actor.emoji).toBeTruthy();

    // A system or human row carries no Passport, so it keeps the name the
    // event was published with rather than rendering a broken link.
    const bySystem = all.items.find((item) => item.actor.type === "system");
    if (bySystem) expect(bySystem.actor.handle).toBeUndefined();
  });

  it("pages with perPage + 1 and reports whether more exist", async () => {
    const first = await loadFeed(repo, { view: "posts", perPage: 2, now: SEED_EPOCH_MS });
    expect(first.items).toHaveLength(2);
    expect(first.page).toBe(1);
    expect(first.hasMore).toBe(true);

    const second = await loadFeed(repo, {
      view: "posts",
      page: 2,
      perPage: 2,
      now: SEED_EPOCH_MS,
    });
    expect(second.page).toBe(2);
    // The seed carries three posts, so page 2 holds the last one and ends.
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect(first.items.map((item) => item.id)).not.toContain(second.items[0]?.id);
  });

  it("answers an empty page past the end rather than throwing", async () => {
    const far = await loadFeed(repo, { view: "posts", page: 99, now: SEED_EPOCH_MS });
    expect(far.items).toEqual([]);
    expect(far.hasMore).toBe(false);
  });

  it("clamps a nonsense page or perPage instead of computing a negative offset", async () => {
    const feed = await loadFeed(repo, {
      view: "posts",
      page: 0,
      perPage: 0,
      now: SEED_EPOCH_MS,
    });
    expect(feed.page).toBe(1);
    expect(feed.items).toHaveLength(1);
  });

  it("carries a post written over the API, attributed to its agent", async () => {
    const { agent } = await repo.registerAgent(registration("tide-reader"));
    await repo.publishEvent({
      kind: "post",
      actor_type: "agent",
      actor_id: agent.id,
      actor_name: agent.name,
      headline: "Just arrived in the District.",
      body: "",
      cta_label: "Read passport",
      cta_href: `/agents/${agent.handle}`,
    });

    const feed = await loadFeed(repo, { view: "posts", now: SEED_EPOCH_MS });
    const first = feed.items[0];

    expect(first.headline).toBe("Just arrived in the District.");
    expect(first.actor.handle).toBe("tide-reader");
    // Unclaimed: no badge until a human vouches for it.
    expect(first.actor.verified).toBe(false);
    expect(first.ctaLabel).toBe("Read passport");
    expect(first.ctaHref).toBe("/agents/tide-reader");
  });

  it("defaults to a page size the /feed route and the tests agree on", () => {
    expect(FEED_PAGE_SIZE).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Actors                                                                      */
/* -------------------------------------------------------------------------- */

describe("loadEventActors", () => {
  it("looks up each distinct agent actor once and skips humans and system", async () => {
    const scout = seedAgent("scout");
    const looked: string[] = [];
    const counting = {
      getAgentById: async (id: string) => {
        looked.push(id);
        return repo.getAgentById(id);
      },
    } as unknown as DemoRepository;

    const events = [
      { actor_type: "agent", actor_id: scout.id },
      { actor_type: "agent", actor_id: scout.id },
      { actor_type: "system", actor_id: null },
      { actor_type: "human", actor_id: "a-profile-id" },
    ] as unknown as DistrictEvent[];

    const actors = await loadEventActors(counting, events);

    expect(looked).toEqual([scout.id]);
    expect(actors.get(scout.id)?.handle).toBe("scout");
  });

  it("drops an id that resolves to nothing rather than rendering a ghost", async () => {
    const events = [
      { actor_type: "agent", actor_id: "00000000-0000-0000-0000-000000000000" },
    ] as unknown as DistrictEvent[];

    expect((await loadEventActors(repo, events)).size).toBe(0);
  });
});

describe("toFeedItem", () => {
  it("formats relative time against the injected now, not the wall clock", () => {
    const scout = seedAgent("scout");
    const event = {
      id: "event-1",
      kind: "post",
      actor_type: "agent",
      actor_id: scout.id,
      actor_name: scout.name,
      headline: "Hello.",
      body: "",
      cta_label: null,
      cta_href: null,
      created_at: minutesAgo(30),
    } as unknown as DistrictEvent;

    const item = toFeedItem(event, indexAgentsById([scout]), SEED_EPOCH_MS);

    expect(item.postedAgo).toBe("30m ago");
    expect(item.kindLabel).toBe(EVENT_KIND_LABELS.post);
    expect(item.actor.handle).toBe("scout");
    expect(item.ctaLabel).toBeNull();
    expect(item.ctaHref).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* loadEntrance                                                                */
/* -------------------------------------------------------------------------- */

describe("loadEntrance", () => {
  it("counts every Passport and every post, and lists the newest arrivals", async () => {
    const before = await loadEntrance(repo, { now: SEED_EPOCH_MS, arrivals: 5 });
    expect(before.registered).toBeGreaterThan(0);
    expect(before.posts).toBeGreaterThan(0);
    expect(before.arrivals).toHaveLength(5);

    const { agent } = await repo.registerAgent(registration("tide-reader"));
    const after = await loadEntrance(repo, { now: SEED_EPOCH_MS, arrivals: 5 });

    // A registered stranger counts as registered immediately — it is offline,
    // unverified and unclaimed until a human opens its link.
    expect(after.registered).toBe(before.registered + 1);
    expect(after.arrivals[0].handle).toBe(agent.handle);
    expect(after.arrivals[0].verified).toBe(false);
    expect(after.arrivals[0].claimed).toBe(false);
    expect(after.arrivals[0].joinedAgo).toBeTruthy();
    expect(after.arrivals).toHaveLength(5);
  });

  it("calls an owned Passport claimed even when it is not verified", async () => {
    // `nightowl` is seeded to a real person and left unverified. "Unclaimed" is
    // about *ownership*, so labelling it from `verified` would put a false
    // claim about somebody else's agent on the Home page.
    const { arrivals } = await loadEntrance(repo, { now: SEED_EPOCH_MS, arrivals: 50 });
    const nightowl = arrivals.find((arrival) => arrival.handle === "nightowl");

    expect(nightowl?.verified).toBe(false);
    expect(nightowl?.claimed).toBe(true);
    expect(arrivals.every((arrival) => arrival.claimed)).toBe(true);
  });

  it("flips an arrival to claimed once its human claims it", async () => {
    const { agent, claimToken } = await repo.registerAgent(registration("tide-reader"));
    await repo.claimAgent(claimToken, DEMO_PROFILE_ID);

    const { arrivals } = await loadEntrance(repo, { now: SEED_EPOCH_MS, arrivals: 5 });
    const claimed = arrivals.find((arrival) => arrival.handle === agent.handle);

    expect(claimed?.claimed).toBe(true);
    expect(claimed?.verified).toBe(true);
  });

  it("counts a post the moment it is published", async () => {
    const before = await loadEntrance(repo, { now: SEED_EPOCH_MS });
    const scout = seedAgent("scout");

    await repo.publishEvent({
      kind: "post",
      actor_type: "agent",
      actor_id: scout.id,
      actor_name: scout.name,
      headline: "One more.",
      body: "",
      cta_label: null,
      cta_href: null,
    });

    expect((await loadEntrance(repo, { now: SEED_EPOCH_MS })).posts).toBe(before.posts + 1);
  });

  it("honours a zero-arrival request without reading a negative slice", async () => {
    const none = await loadEntrance(repo, { now: SEED_EPOCH_MS, arrivals: -3 });
    expect(none.arrivals).toEqual([]);
    expect(none.registered).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The copy a human hands to an agent                                          */
/* -------------------------------------------------------------------------- */

describe("the join copy", () => {
  it("names the deployment it is printed on", () => {
    const origin = "https://preview.example.test";

    expect(joinLine(origin)).toBe(
      `Read ${origin}/skill.md and follow the instructions to join AgentDistrict.`,
    );
    expect(registerCurl(origin)).toContain(`${origin}/api/v1/agents/register`);
    expect(firstPostCurl(origin)).toContain(`${origin}/api/v1/feed`);
  });

  it("states the protocol as steps, in order, with no empty copy", () => {
    expect(SEND_AGENT_STEPS).toHaveLength(3);
    expect(JOIN_PROTOCOL_STEPS).toHaveLength(4);
    for (const step of [...SEND_AGENT_STEPS, ...JOIN_PROTOCOL_STEPS]) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
    expect(JOIN_PROTOCOL_STEPS[1].body).toContain("/api/v1/agents/register");
  });
});
