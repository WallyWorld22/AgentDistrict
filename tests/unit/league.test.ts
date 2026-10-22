// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createDemoRepository } from "@/lib/data/demo";
import {
  BOUT_SEED_PATTERN,
  boutDigestInput,
  boutLoserId,
  boutResultEvent,
  computeLeagueStandings,
  decideBoutOutcome,
  md5Hex,
  type BoutFormulaInput,
} from "@/lib/data/league";
import { BOUT_METHODS, type Bout, type DistrictDataset } from "@/lib/data/types";
import {
  FIGHT_CHANNEL_ID,
  FIGHT_CHANNEL_SLUG,
  FIGHTER_HANDLES,
  LEAGUE_SEASON,
  SEED_EPOCH_MS,
  agentId,
  boutId,
  seed,
} from "@/lib/seed";

/**
 * The District TV Fight League — fiction, decided once, never reputation.
 *
 * What these pin:
 *
 *  - the formula is a pure function of the stored bout, and it is the same
 *    function the SQL runs (an independent re-derivation with node's own MD5
 *    and the method list parsed out of 0012 itself);
 *  - deciding is advance-on-read, idempotent, and order-independent;
 *  - standings are counted from `bout_results` alone;
 *  - deciding a whole season moves no marketplace number.
 *
 * The cross-*adapter* half (Postgres's `decide_bout()` against this code, bout
 * for bout) is `tests/integration/fight-league.test.ts`.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0012_fight_league.sql"),
  "utf8",
);

const RUSTY = agentId("rusty-knuckles");
const VELVET = agentId("velvet-voltage");
const AFTER_SEASON = Math.max(...seed.bouts.map((bout) => Date.parse(bout.scheduled_at))) + 3600_000;

/** The formula restated from its definition, on node's MD5 and BigInt. */
function referenceOutcome(bout: BoutFormulaInput) {
  const digest = createHash("md5").update(`${bout.id.toLowerCase()}:${bout.seed}`, "utf8").digest("hex");
  const roll = BigInt(`0x${digest.slice(0, 8)}`) % BigInt(bout.fighter_a_weight + bout.fighter_b_weight);
  const methodIndex = Number(BigInt(`0x${digest.slice(8, 16)}`) % BigInt(BOUT_METHODS.length));
  return {
    winner_id: roll < BigInt(bout.fighter_a_weight) ? bout.fighter_a : bout.fighter_b,
    method: BOUT_METHODS[methodIndex],
    narrative_seed: digest.slice(16, 32),
  };
}

function syntheticBout(index: number, weights: [number, number] = [50, 50]): BoutFormulaInput {
  const hex = createHash("sha1").update(`synthetic:${index}`).digest("hex");
  return {
    id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
    seed: `synthetic:${index}`,
    fighter_a: RUSTY,
    fighter_b: VELVET,
    fighter_a_weight: weights[0],
    fighter_b_weight: weights[1],
  };
}

function freshDataset(): DistrictDataset {
  return structuredClone(seed);
}

/* -------------------------------------------------------------------------- */

describe("md5Hex", () => {
  it("matches the RFC 1321 test suite", () => {
    const suite: Array<[string, string]> = [
      ["", "d41d8cd98f00b204e9800998ecf8427e"],
      ["a", "0cc175b9c0f1b6a831c399e269772661"],
      ["abc", "900150983cd24fb0d6963f7d28e17f72"],
      ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
      ["abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
      [
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
        "d174ab98d277d9f5a5611c2c9f419d9f",
      ],
      [
        "12345678901234567890123456789012345678901234567890123456789012345678901234567890",
        "57edf4a22be3c955ac49da2e2107b67a",
      ],
    ];
    for (const [input, digest] of suite) expect(md5Hex(input), JSON.stringify(input)).toBe(digest);
  });

  it("agrees with node's MD5 across block boundaries and UTF-8", () => {
    for (const length of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const input = "x".repeat(length);
      expect(md5Hex(input)).toBe(createHash("md5").update(input, "utf8").digest("hex"));
    }
    expect(md5Hex("é · 🥊")).toBe(createHash("md5").update("é · 🥊", "utf8").digest("hex"));
  });
});

/* -------------------------------------------------------------------------- */

describe("decideBoutOutcome — the league formula", () => {
  it("is the formula as defined, for every seeded bout and 500 synthetic ones", () => {
    const bouts: BoutFormulaInput[] = [
      ...seed.bouts,
      ...Array.from({ length: 500 }, (_, index) =>
        syntheticBout(index, [1 + (index % 100), 1 + ((index * 37) % 100)]),
      ),
    ];
    for (const bout of bouts) expect(decideBoutOutcome(bout), bout.seed).toEqual(referenceOutcome(bout));
  });

  it("pins Season 1, so a change to the formula cannot pass silently", () => {
    // Recorded results are history: if this table changes, the formula no
    // longer reproduces what the ledger says happened.
    const card = seed.bouts.map((bout) => {
      const outcome = decideBoutOutcome(bout);
      return [bout.seed, outcome.winner_id === RUSTY ? "rusty" : "velvet", outcome.method, outcome.narrative_seed];
    });
    expect(card).toEqual([
      ["bot-brawl:s1:b1", "velvet", "unanimous decision", "2f121466f2feee10"],
      ["bot-brawl:s1:b2", "rusty", "knockout", "4b5dd0a527f7ec04"],
      ["bot-brawl:s1:b3", "velvet", "technical knockout", "9a0e5cb0e6633fff"],
      ["bot-brawl:s1:b4", "rusty", "split decision", "3ecf78651cba8194"],
      ["bot-brawl:s1:b5", "velvet", "majority decision", "1cb51d9147695ecd"],
      ["bot-brawl:s1:b6", "rusty", "knockout", "d75910d020e8f9f0"],
      ["bot-brawl:s1:b7", "rusty", "unanimous decision", "d1ebd6924204c2a1"],
      ["bot-brawl:s1:b8", "rusty", "majority decision", "3864bf26cf19d2bd"],
    ]);
  });

  it("reads only the bout: same row, same answer, whatever else differs", () => {
    const bout = seed.bouts[2];
    const first = decideBoutOutcome(bout);
    // A different status, timestamp or channel is not an input.
    const decorated: Bout = {
      ...bout,
      status: "decided",
      scheduled_at: "2030-01-01T00:00:00.000Z",
      created_at: "2020-01-01T00:00:00.000Z",
      channel_id: seed.channels[0].id,
    };
    expect(decideBoutOutcome(decorated)).toEqual(first);
    expect(decideBoutOutcome({ ...bout })).toEqual(first);
    // Upper-case ids hash as the lower-case uuid Postgres prints.
    expect(decideBoutOutcome({ ...bout, id: bout.id.toUpperCase() })).toEqual(first);
    expect(boutDigestInput(bout)).toBe(`${bout.id}:${bout.seed}`);
  });

  it("honours the stored weights, and only the stored weights", () => {
    const wins = (weights: [number, number]) =>
      Array.from({ length: 4000 }, (_, index) => syntheticBout(index, weights)).filter(
        (bout) => decideBoutOutcome(bout).winner_id === bout.fighter_a,
      ).length / 4000;
    expect(wins([50, 50])).toBeGreaterThan(0.46);
    expect(wins([50, 50])).toBeLessThan(0.54);
    expect(wins([70, 30])).toBeGreaterThan(0.66);
    expect(wins([70, 30])).toBeLessThan(0.74);
    expect(wins([100, 1])).toBeGreaterThan(0.97);
  });

  it("refuses rows the schema would refuse", () => {
    const bout = seed.bouts[0];
    expect(() => decideBoutOutcome({ ...bout, fighter_a_weight: 0 })).toThrow(RangeError);
    expect(() => decideBoutOutcome({ ...bout, fighter_b_weight: 101 })).toThrow(RangeError);
    expect(() => decideBoutOutcome({ ...bout, fighter_a_weight: 1.5 })).toThrow(RangeError);
    expect(() => decideBoutOutcome({ ...bout, seed: "naïve" })).toThrow(RangeError);
    expect(() => decideBoutOutcome({ ...bout, fighter_b: bout.fighter_a })).toThrow(RangeError);
  });

  it("uses exactly the method list and seed rule 0012 writes in SQL", () => {
    const formula = /\(array\[([\s\S]*?)\]\)\[1 \+/.exec(MIGRATION);
    expect(formula, "bout_outcome() method array").not.toBeNull();
    const sqlMethods = [...formula![1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(sqlMethods).toEqual([...BOUT_METHODS]);
    // …the same list in the same order, and `% 5` is its length.
    expect(MIGRATION).toContain(`% ${BOUT_METHODS.length})::integer]`);

    const check = /method\s+text not null check \(method in \(([\s\S]*?)\)\)/.exec(MIGRATION);
    expect([...check![1].matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([...BOUT_METHODS]);

    expect(MIGRATION).toContain(`check (seed ~ '${BOUT_SEED_PATTERN.source}')`);
  });
});

/* -------------------------------------------------------------------------- */

describe("the Season 1 seed", () => {
  const fighters = seed.agents.filter((agent) =>
    (FIGHTER_HANDLES as readonly string[]).includes(agent.handle),
  );

  it("adds two fictional fighters with nothing to sell and no reputation", () => {
    expect(fighters.map((agent) => agent.handle).sort()).toEqual([...FIGHTER_HANDLES].sort());
    for (const agent of fighters) {
      expect(agent.category).toBe("entertainment");
      expect(agent.starting_price_cents).toBe(0);
      expect(agent.is_free, `@${agent.handle} is not a free *service*`).toBe(false);
      // Off shift: fiction never counts towards the District's agentsOnline.
      expect(agent.status).toBe("offline");
      expect(agent.store_id).toBeNull();
      expect(agent.description).toMatch(/fictional character/i);
      expect(agent.description).toMatch(/nothing to hire/i);
      expect(agent.tagline).toMatch(/fictional/i);
      expect([agent.rating_avg, agent.rating_count, agent.jobs_completed]).toEqual([0, 0, 0]);
      expect(seed.gigs.filter((gig) => gig.agent_id === agent.id)).toEqual([]);
      expect(seed.reviews.filter((review) => review.agent_id === agent.id)).toEqual([]);
      expect(seed.orders.filter((order) => order.agent_id === agent.id)).toEqual([]);
      expect(seed.bids.filter((bid) => bid.agent_id === agent.id)).toEqual([]);
    }
    expect(fighters.find((agent) => agent.handle === "rusty-knuckles")!.description).toMatch(
      /blue glove/,
    );
    expect(fighters.find((agent) => agent.handle === "velvet-voltage")!.description).toMatch(
      /plum-and-gold/,
    );
  });

  it("puts them on the couch of the Bot Brawl channel, which says it is fiction", () => {
    const channel = seed.channels.find((row) => row.slug === FIGHT_CHANNEL_SLUG)!;
    expect(channel.id).toBe(FIGHT_CHANNEL_ID);
    expect(channel.description).toMatch(/fiction/i);
    expect(channel.is_live).toBe(false);
    const hosts = seed.channelHosts
      .filter((host) => host.channel_id === channel.id)
      .sort((a, b) => a.position - b.position)
      .map((host) => host.agent_id);
    expect(hosts).toEqual([RUSTY, VELVET]);
  });

  it("schedules eight fictional bouts: two decided, three due, three still to come", () => {
    expect(seed.bouts).toHaveLength(8);
    const ids = new Set(seed.agents.map((agent) => agent.id));
    for (const bout of seed.bouts) {
      expect(bout.kind).toBe("fictional");
      expect(bout.channel_id).toBe(FIGHT_CHANNEL_ID);
      expect(bout.season).toBe(LEAGUE_SEASON);
      expect(ids).toContain(bout.fighter_a);
      expect(ids).toContain(bout.fighter_b);
      expect(new Set([bout.fighter_a, bout.fighter_b])).toEqual(new Set([RUSTY, VELVET]));
      expect(bout.seed).toMatch(BOUT_SEED_PATTERN);
      expect(Date.parse(bout.created_at)).toBeLessThan(Date.parse(bout.scheduled_at));
    }
    expect(new Set(seed.bouts.map((bout) => bout.seed)).size).toBe(8);

    const past = seed.bouts.filter((bout) => Date.parse(bout.scheduled_at) <= SEED_EPOCH_MS);
    const decided = seed.bouts.filter((bout) => bout.status === "decided");
    expect(decided.map((bout) => bout.id)).toEqual([boutId(1), boutId(2)]);
    expect(past.filter((bout) => bout.status === "scheduled")).toHaveLength(3);
    expect(seed.bouts.filter((bout) => Date.parse(bout.scheduled_at) > SEED_EPOCH_MS)).toHaveLength(3);
  });

  it("seeds exactly the decided bouts' results, and each is the formula's", () => {
    const decided = seed.bouts.filter((bout) => bout.status === "decided");
    expect(seed.boutResults.map((row) => row.bout_id)).toEqual(decided.map((bout) => bout.id));
    for (const result of seed.boutResults) {
      const bout = seed.bouts.find((row) => row.id === result.bout_id)!;
      const { decided_at, ...outcome } = result;
      expect(outcome).toEqual({ bout_id: bout.id, ...decideBoutOutcome(bout) });
      expect(Date.parse(decided_at)).toBeGreaterThanOrEqual(Date.parse(bout.scheduled_at));
      expect(Date.parse(decided_at)).toBeLessThanOrEqual(SEED_EPOCH_MS);
    }
  });

  it("seeds one fiction-labelled feed event per seeded result, in decide_bout's copy", () => {
    const events = seed.events.filter((event) => event.kind === "bout_result");
    expect(events).toHaveLength(seed.boutResults.length);
    const channel = seed.channels.find((row) => row.slug === FIGHT_CHANNEL_SLUG)!;
    const name = (id: string) => seed.agents.find((agent) => agent.id === id)!.name;
    for (const result of seed.boutResults) {
      const bout = seed.bouts.find((row) => row.id === result.bout_id)!;
      const expected = boutResultEvent({
        bout,
        result,
        winnerName: name(result.winner_id),
        loserName: name(boutLoserId(bout, result.winner_id)),
        channel,
      });
      const event = events.find((row) => row.created_at === result.decided_at)!;
      expect(event).toMatchObject({ ...expected, actor_id: null });
      expect(event.headline).toMatch(/^Fight League \(fiction\): /);
      expect(event.body).toMatch(/Fiction: it moves no rating, review or job count\.$/);
      expect(event.cta_href).toBe(`/tv/${FIGHT_CHANNEL_SLUG}`);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("the demo adapter's Fight League", () => {
  it("lists the card in schedule order with identity-only fighters", async () => {
    const repo = createDemoRepository({ now: () => SEED_EPOCH_MS });
    const card = await repo.listBouts({ channelId: FIGHT_CHANNEL_ID, season: 1 });
    expect(card.map((bout) => bout.id)).toEqual(seed.bouts.map((bout) => bout.id));
    for (const bout of card) {
      // Never an `Agent`: no rating, no price, no job count to print.
      expect(Object.keys(bout.fighterA).sort()).toEqual(
        ["avatar_emoji", "avatar_gradient", "handle", "id", "name"],
      );
      expect(Object.keys(bout.fighterB)).not.toContain("rating_avg");
    }
    expect(card.filter((bout) => bout.result !== null)).toHaveLength(2);
    expect(await repo.listBouts({ season: 2 })).toEqual([]);
    expect((await repo.getBout(boutId(3)))!.result).toBeNull();
    expect(await repo.getBout("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("is a read that never decides: listing, getting and standings write nothing", async () => {
    const dataset = freshDataset();
    const repo = createDemoRepository({ now: () => AFTER_SEASON, dataset });
    await repo.listBouts();
    await repo.getBout(boutId(5));
    await repo.leagueStandings();
    expect(dataset.boutResults).toHaveLength(2);
    expect(dataset.bouts.filter((bout) => bout.status === "decided")).toHaveLength(2);
  });

  it("decides exactly the due bouts on first read, by the formula, with one event each", async () => {
    const dataset = freshDataset();
    const repo = createDemoRepository({ now: () => SEED_EPOCH_MS, dataset });
    const heard: string[] = [];
    const unsubscribe = repo.subscribe((event) => heard.push(event.kind));

    const results = await repo.decideDueBouts(FIGHT_CHANNEL_ID);
    unsubscribe();

    expect(results.map((row) => row.bout_id)).toEqual([boutId(3), boutId(4), boutId(5)]);
    for (const result of results) {
      const bout = seed.bouts.find((row) => row.id === result.bout_id)!;
      expect(result).toMatchObject(decideBoutOutcome(bout));
      expect(result.decided_at).toBe(new Date(SEED_EPOCH_MS).toISOString());
    }
    expect(heard).toEqual(["bout_result", "bout_result", "bout_result"]);

    const card = await repo.listBouts({ channelId: FIGHT_CHANNEL_ID });
    expect(card.map((bout) => bout.status)).toEqual([
      "decided", "decided", "decided", "decided", "decided", "scheduled", "scheduled", "scheduled",
    ]);
    const feed = await repo.listEvents({ kind: "bout_result", limit: 20 });
    expect(feed).toHaveLength(5);
    for (const event of feed) {
      expect(event.actor_type).toBe("system");
      expect(event.headline).toMatch(/\(fiction\)/);
    }
  });

  it("is idempotent: deciding twice records one result and one event per bout", async () => {
    const dataset = freshDataset();
    const repo = createDemoRepository({ now: () => AFTER_SEASON, dataset });

    const first = await repo.decideDueBouts(FIGHT_CHANNEL_ID);
    expect(first).toHaveLength(6);
    expect(await repo.decideDueBouts(FIGHT_CHANNEL_ID)).toEqual([]);

    expect(dataset.boutResults).toHaveLength(8);
    expect(new Set(dataset.boutResults.map((row) => row.bout_id)).size).toBe(8);
    expect(dataset.events.filter((event) => event.kind === "bout_result")).toHaveLength(8);

    // A bout the ledger already holds is returned as recorded — even if its
    // status somehow still reads `scheduled` — and is never re-decided.
    const replayed = structuredClone(dataset);
    replayed.bouts.find((bout) => bout.id === boutId(6))!.status = "scheduled";
    const again = createDemoRepository({ now: () => AFTER_SEASON, dataset: replayed });
    const [result] = await again.decideDueBouts(FIGHT_CHANNEL_ID);
    expect(result).toEqual(dataset.boutResults.find((row) => row.bout_id === boutId(6)));
    expect(replayed.boutResults).toHaveLength(8);
    expect(replayed.events.filter((event) => event.kind === "bout_result")).toHaveLength(8);
  });

  it("does not decide a bout before its time, on any channel but its own", async () => {
    const dataset = freshDataset();
    const repo = createDemoRepository({ now: () => SEED_EPOCH_MS, dataset });
    expect(await repo.decideDueBouts(seed.channels[0].id)).toEqual([]);
    await repo.decideDueBouts(FIGHT_CHANNEL_ID);
    expect(dataset.boutResults.map((row) => row.bout_id)).not.toContain(boutId(6));
    expect((await repo.getBout(boutId(6)))!.status).toBe("scheduled");
  });

  it("gives the same winners across runs, repositories and array order", async () => {
    const decideAll = async (dataset: DistrictDataset) => {
      const repo = createDemoRepository({ now: () => AFTER_SEASON, dataset });
      await repo.decideDueBouts(FIGHT_CHANNEL_ID);
      return {
        card: (await repo.listBouts()).map((bout) => [bout.id, bout.result?.winner_id, bout.result?.method]),
        standings: await repo.leagueStandings({ channelId: FIGHT_CHANNEL_ID }),
      };
    };

    const baseline = await decideAll(freshDataset());
    expect(await decideAll(freshDataset())).toEqual(baseline);

    const reversed = freshDataset();
    reversed.bouts.reverse();
    reversed.boutResults.reverse();
    reversed.agents.reverse();
    expect(await decideAll(reversed)).toEqual(baseline);

    // And every winner is the formula's.
    for (const [id, winner] of baseline.card) {
      expect(winner).toBe(decideBoutOutcome(seed.bouts.find((bout) => bout.id === id)!).winner_id);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("league standings", () => {
  it("counts the seeded results, then the season, from bout_results alone", async () => {
    const dataset = freshDataset();
    const repo = createDemoRepository({ now: () => AFTER_SEASON, dataset });
    const record = async () =>
      (await repo.leagueStandings({ channelId: FIGHT_CHANNEL_ID, season: 1 })).map((row) => [
        row.fighter.handle,
        row.wins,
        row.losses,
        row.decided,
      ]);

    // Before anyone reads the card: 1–1, ordered by name on the tie.
    expect(await record()).toEqual([
      ["rusty-knuckles", 1, 1, 2],
      ["velvet-voltage", 1, 1, 2],
    ]);
    await repo.decideDueBouts(FIGHT_CHANNEL_ID);
    expect(await record()).toEqual([
      ["rusty-knuckles", 5, 3, 8],
      ["velvet-voltage", 3, 5, 8],
    ]);
    expect(await repo.leagueStandings({ season: 2 })).toEqual([]);
  });

  it("ignores status: a bout with no ledger row counts for nothing", () => {
    const bouts = seed.bouts.map((bout) => ({ ...bout, status: "decided" as const }));
    const fighters = new Map(
      seed.agents
        .filter((agent) => agent.id === RUSTY || agent.id === VELVET)
        .map((agent) => [agent.id, agent]),
    );
    const table = computeLeagueStandings(bouts, seed.boutResults, fighters);
    expect(table.map((row) => [row.wins, row.losses])).toEqual([
      [1, 1],
      [1, 1],
    ]);
    // A result for a bout outside the card is not counted either.
    const stray = { bout_id: "not-on-this-card", winner_id: RUSTY };
    expect(computeLeagueStandings(bouts, [...seed.boutResults, stray], fighters)).toEqual(table);
    // Order of the inputs is not an input.
    expect(
      computeLeagueStandings([...bouts].reverse(), [...seed.boutResults].reverse(), fighters),
    ).toEqual(table);
  });
});

/* -------------------------------------------------------------------------- */

describe("no reputation bleed", () => {
  it("deciding a whole season moves no marketplace number, anywhere", async () => {
    const dataset = freshDataset();
    const before = structuredClone(dataset);
    const repo = createDemoRepository({ now: () => AFTER_SEASON, dataset });

    const fightersBefore = await Promise.all(
      FIGHTER_HANDLES.map((handle) => repo.getAgentByHandle(handle)),
    );
    expect(await repo.decideDueBouts(FIGHT_CHANNEL_ID)).toHaveLength(6);
    await repo.leagueStandings();

    // The fighters' Passports — rating, review count, jobs, updated_at — are
    // byte-for-byte what they were.
    expect(
      await Promise.all(FIGHTER_HANDLES.map((handle) => repo.getAgentByHandle(handle))),
    ).toEqual(fightersBefore);
    // …and so is every other reputation-bearing table in the District.
    for (const key of ["agents", "reviews", "gigs", "orders", "guilds", "stores", "wallets", "walletTransactions", "competitionEntries"] as const) {
      expect(dataset[key], key).toEqual(before[key]);
    }
    expect(await repo.listReviewsForAgent("rusty-knuckles")).toEqual([]);
    expect(await repo.listReviewsForAgent("velvet-voltage")).toEqual([]);
    // What did change is exactly the league and its feed rows.
    expect(dataset.boutResults.length - before.boutResults.length).toBe(6);
    expect(dataset.events.length - before.events.length).toBe(6);
  });

  it("keeps the fighters out of the District's live counters", async () => {
    const repo = createDemoRepository({ now: () => SEED_EPOCH_MS });
    const stats = await repo.getNetworkStats();
    expect(stats.agentsOnline).toBe(
      seed.agents.filter((agent) => agent.status !== "offline").length,
    );
    expect(stats.agentsOnline).toBe(28);
    expect(stats.liveChannels).toBe(5);
  });

  it("leaves the fighters with no gig to sell, and a Passport to link", async () => {
    // The channel page keeps a channel's fighters off "Hire from the stream"
    // altogether (`fighterIds` in lib/data/ext/fight-night.ts) and links each
    // fighter card to the Passport. Neither the hire panel nor anything else
    // has a gig of theirs to resolve.
    const repo = createDemoRepository({ now: () => SEED_EPOCH_MS });
    const channel = await repo.getChannelBySlug(FIGHT_CHANNEL_SLUG);
    expect(channel!.hosts.map((host) => host.handle)).toEqual([...FIGHTER_HANDLES]);
    for (const host of channel!.hosts) {
      expect(await repo.listGigs({ agentHandle: host.handle, sort: "price", limit: 1 })).toEqual([]);
      expect(await repo.getAgentByHandle(host.handle)).not.toBeNull();
    }
    expect(channel!.competition).toBeNull();
  });
});
