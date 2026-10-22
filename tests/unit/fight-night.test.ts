// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createDemoRepository } from "@/lib/data/demo";
import {
  boutPhase,
  boutRecap,
  currentSeason,
  fightCard,
  fighterIds,
  formatBoutTime,
} from "@/lib/data/ext/fight-night";
import {
  formatCountdown,
  formatLongCountdown,
  leaderboardRows,
  secondsUntil,
  standings,
} from "@/lib/data/ext/lounge";
import { decideBoutOutcome, md5Hex, unknownFighter } from "@/lib/data/league";
import {
  BOUT_METHODS,
  type BoutMethod,
  type BoutWithResult,
  type CompetitionWithEntries,
  type LeagueFighter,
} from "@/lib/data/types";
import { FIGHT_CHANNEL_ID, SEED_EPOCH_MS, agentId, boutId, seed } from "@/lib/seed";

/**
 * Fight Night's pure helpers — the recap, the card, the clock copy — and the
 * `/competitions` leaderboard's finished-only win rule.
 *
 * The recap is the one piece of league copy the District writes itself rather
 * than reading from the ledger, so most of this file pins what it may and may
 * not say: the same bout always reads the same, and nothing in it can hand
 * the bout to anyone but the recorded winner.
 */

const AFTER_SEASON =
  Math.max(...seed.bouts.map((bout) => Date.parse(bout.scheduled_at))) + 3600_000;

const RUSTY = seed.agents.find((agent) => agent.handle === "rusty-knuckles")!;
const VELVET = seed.agents.find((agent) => agent.handle === "velvet-voltage")!;

function fighter(agent: LeagueFighter): LeagueFighter {
  return {
    id: agent.id,
    handle: agent.handle,
    name: agent.name,
    avatar_emoji: agent.avatar_emoji,
    avatar_gradient: agent.avatar_gradient,
  };
}

/** The season as the channel page reads it once every bout has been fought. */
async function decidedSeason(now = AFTER_SEASON): Promise<BoutWithResult[]> {
  const repo = createDemoRepository({ now: () => now, dataset: structuredClone(seed) });
  await repo.decideDueBouts(FIGHT_CHANNEL_ID);
  return repo.listBouts({ channelId: FIGHT_CHANNEL_ID });
}

/** A decided bout between two arbitrary fighters, with a hand-picked result. */
function boutBetween(
  a: LeagueFighter,
  b: LeagueFighter,
  result: { winner: "a" | "b"; method: BoutMethod; narrativeSeed: string },
): BoutWithResult {
  return {
    ...seed.bouts[0],
    fighter_a: a.id,
    fighter_b: b.id,
    fighterA: a,
    fighterB: b,
    status: "decided",
    result: {
      bout_id: seed.bouts[0].id,
      winner_id: result.winner === "a" ? a.id : b.id,
      method: result.method,
      narrative_seed: result.narrativeSeed,
      decided_at: seed.bouts[0].scheduled_at,
    },
  };
}

const GENERIC_A: LeagueFighter = {
  id: "00000000-0000-4000-8000-00000000000a",
  handle: "tin-tempest",
  name: "Tin Tempest",
  avatar_emoji: "⚡",
  avatar_gradient: "",
};
const GENERIC_B: LeagueFighter = {
  id: "00000000-0000-4000-8000-00000000000b",
  handle: "bolt-baron",
  name: "Bolt Baron",
  avatar_emoji: "🔩",
  avatar_gradient: "",
};

/** Every combination of the three 16-bit picks modulo 3, as narrative seeds. */
const PICK_SEEDS: string[] = [];
for (let opener = 0; opener < 3; opener += 1) {
  for (let winner = 0; winner < 3; winner += 1) {
    for (let loser = 0; loser < 3; loser += 1) {
      const word = (value: number) => value.toString(16).padStart(4, "0");
      PICK_SEEDS.push(`${word(opener)}${word(winner)}${word(loser)}0000`);
    }
  }
}

const DECISIONS: readonly BoutMethod[] = [
  "unanimous decision",
  "split decision",
  "majority decision",
];

/* -------------------------------------------------------------------------- */

describe("the sports desk recap", () => {
  it("is the same text for the same bout, every time and in every order", async () => {
    const recaps = (bouts: BoutWithResult[]) =>
      bouts.map((bout) => [bout.id, boutRecap(structuredClone(bout))?.text] as const);
    const first = recaps(await decidedSeason());
    const again = recaps(await decidedSeason());
    expect(again).toEqual(first);

    // Array order is not an input, and a structured copy reads the same.
    const season = await decidedSeason();
    const reversed = recaps([...season].reverse());
    expect(new Map(reversed)).toEqual(new Map(first));

    // Every bout of the season has one, and they are not all the same copy.
    expect(first.every(([, text]) => typeof text === "string" && text.length > 0)).toBe(true);
    expect(new Set(first.map(([, text]) => text)).size).toBe(first.length);
  });

  it("pins the seeded bouts' copy", async () => {
    const byId = new Map((await decidedSeason()).map((bout) => [bout.id, boutRecap(bout)!]));
    // Bout 1 is in the seed with its result; bout 3 is decided on read.
    expect(byId.get(boutId(1))!.text).toBe(
      "No controversy on press row: Velvet Voltage over Rusty Knuckles on every card. " +
        "Velvet Voltage took a bow to all four corners on the way out. " +
        "Patient on defense, maybe too patient: Rusty Knuckles waited for an opening that never came. " +
        "Official result: Velvet Voltage def. Rusty Knuckles by unanimous decision.",
    );
    expect(byId.get(boutId(3))!.verdict).toBe(
      "Official result: Velvet Voltage def. Rusty Knuckles by technical knockout.",
    );
    expect(byId.get(boutId(4))!.lines[0]).toBe(
      "Velvet Voltage won one judge over; Rusty Knuckles won the other two.",
    );
  });

  it("restates the recorded result — the formula's winner — in every verdict", async () => {
    for (const bout of await decidedSeason()) {
      const outcome = decideBoutOutcome(bout);
      expect(bout.result!.winner_id).toBe(outcome.winner_id);
      const winner = outcome.winner_id === bout.fighter_a ? bout.fighterA : bout.fighterB;
      const loser = outcome.winner_id === bout.fighter_a ? bout.fighterB : bout.fighterA;
      const recap = boutRecap(bout)!;
      expect(recap.verdict).toBe(
        `Official result: ${winner.name} def. ${loser.name} by ${outcome.method}.`,
      );
      expect(recap.text.endsWith(recap.verdict)).toBe(true);
    }
  });

  it("follows the recorded winner, not the corners: flip the result, flip the story", () => {
    const rusty = fighter(RUSTY);
    const velvet = fighter(VELVET);
    for (const method of BOUT_METHODS) {
      const aWins = boutRecap(boutBetween(rusty, velvet, { winner: "a", method, narrativeSeed: "0123456789abcdef" }))!;
      const bWins = boutRecap(boutBetween(rusty, velvet, { winner: "b", method, narrativeSeed: "0123456789abcdef" }))!;
      expect(aWins.verdict).toBe(`Official result: Rusty Knuckles def. Velvet Voltage by ${method}.`);
      expect(bWins.verdict).toBe(`Official result: Velvet Voltage def. Rusty Knuckles by ${method}.`);
    }
  });

  it("can never contradict the ledger, whichever template the seed picks", () => {
    const pairs: Array<[LeagueFighter, LeagueFighter]> = [
      [fighter(RUSTY), fighter(VELVET)],
      [fighter(VELVET), fighter(RUSTY)],
      [GENERIC_A, GENERIC_B],
      [fighter(RUSTY), GENERIC_B],
    ];
    let checked = 0;
    for (const [a, b] of pairs) {
      for (const method of BOUT_METHODS) {
        for (const narrativeSeed of PICK_SEEDS) {
          for (const side of ["a", "b"] as const) {
            const bout = boutBetween(a, b, { winner: side, method, narrativeSeed });
            const recap = boutRecap(bout)!;
            const w = side === "a" ? a.name : b.name;
            const l = side === "a" ? b.name : a.name;

            expect(recap.verdict).toBe(`Official result: ${w} def. ${l} by ${method}.`);
            expect(recap.text).toBe([...recap.lines, recap.verdict].join(" "));
            // The opener always names the winner.
            expect(recap.lines[0]).toContain(w);
            // Only the verdict says who defeated whom, and never the other way.
            for (const line of recap.lines) expect(line).not.toMatch(/ def\. /);
            expect(recap.text).not.toContain(`${l} def.`);
            expect(recap.text).not.toMatch(new RegExp(`${l} (won it|took it|edged it|ended it|out-boxed)`));
            // The color describes the recorded ending: a stoppage never went to
            // the judges, and a decision was never stopped.
            const opener = recap.lines[0].toLowerCase();
            if (DECISIONS.includes(method)) {
              expect(opener).toMatch(/judge|card|distance|decision/);
              expect(opener).not.toMatch(/referee|count|canvas|towel|knock/);
            } else {
              expect(opener).not.toMatch(/judge|card|decision/);
            }
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(4 * BOUT_METHODS.length * 27 * 2);
  });

  it("uses each fighter's own color only for that fighter", () => {
    const rusty = fighter(RUSTY);
    const velvet = fighter(VELVET);
    for (const narrativeSeed of PICK_SEEDS) {
      const rustyWins = boutRecap(boutBetween(rusty, velvet, { winner: "a", method: "knockout", narrativeSeed }))!;
      // "Glove" belongs to Rusty and "footwork"/"bow"/"narrat" to Velvet, in
      // either corner — never borrowed by the other fighter's lines.
      expect(rustyWins.lines[1]).not.toMatch(/footwork|bow|narrat/i);
      expect(rustyWins.lines[2]).not.toMatch(/glove|dry/i);
      const velvetWins = boutRecap(boutBetween(rusty, velvet, { winner: "b", method: "knockout", narrativeSeed }))!;
      expect(velvetWins.lines[1]).not.toMatch(/glove|dry/i);
      expect(velvetWins.lines[2]).not.toMatch(/footwork|bow|narrat/i);
    }
  });

  it("varies with the narrative seed", () => {
    const texts = new Set(
      PICK_SEEDS.map(
        (narrativeSeed) =>
          boutRecap(boutBetween(GENERIC_A, GENERIC_B, { winner: "a", method: "split decision", narrativeSeed }))!.text,
      ),
    );
    expect(texts.size).toBe(27);
  });

  it("has no recap without a result, or for a winner who was not on the card", async () => {
    const [bout] = await decidedSeason(SEED_EPOCH_MS);
    expect(boutRecap({ ...bout, result: null })).toBeNull();
    expect(
      boutRecap({ ...bout, result: { ...bout.result!, winner_id: "not-a-fighter" } }),
    ).toBeNull();
  });

  it("survives a malformed narrative seed deterministically", () => {
    const bout = boutBetween(GENERIC_A, GENERIC_B, { winner: "b", method: "knockout", narrativeSeed: "zz" });
    const recap = boutRecap(bout)!;
    expect(recap).toEqual(boutRecap(structuredClone(bout)));
    expect(recap.verdict).toBe("Official result: Bolt Baron def. Tin Tempest by knockout.");
  });

  it("names an unreadable fighter instead of printing an empty string", () => {
    const ghost = unknownFighter("00000000-0000-4000-8000-0000000000ff");
    const recap = boutRecap(boutBetween(ghost, GENERIC_B, { winner: "a", method: "knockout", narrativeSeed: md5Hex("x").slice(16) }))!;
    expect(recap.verdict).toBe("Official result: Unknown fighter def. Bolt Baron by knockout.");
    expect(
      boutRecap(boutBetween({ ...GENERIC_A, name: "  " }, GENERIC_B, { winner: "a", method: "knockout", narrativeSeed: "0000000000000000" }))!.verdict,
    ).toBe("Official result: Unknown fighter def. Bolt Baron by knockout.");
  });
});

/* -------------------------------------------------------------------------- */

describe("the fight card", () => {
  it("reads the District at boot: five decided once the page has asked, three to come", async () => {
    const bouts = await decidedSeason(SEED_EPOCH_MS);
    const card = fightCard(bouts, SEED_EPOCH_MS)!;

    expect(card.season).toBe(1);
    expect(card.bouts.map((bout) => [bout.number, bout.phase])).toEqual([
      [1, "decided"],
      [2, "decided"],
      [3, "decided"],
      [4, "decided"],
      [5, "decided"],
      [6, "upcoming"],
      [7, "upcoming"],
      [8, "upcoming"],
    ]);
    expect(card.decidedCount).toBe(5);
    expect(card.next!.id).toBe(boutId(6));
    expect(card.latest!.id).toBe(boutId(5));

    for (const bout of card.bouts) {
      if (bout.phase === "decided") {
        expect(bout.winner!.id).toBe(bout.result!.winner_id);
        expect(bout.loser!.id).not.toBe(bout.result!.winner_id);
        expect(bout.recap).not.toBeNull();
        expect(bout.secondsToBell).toBe(0);
      } else {
        // Nothing about an upcoming bout's outcome is in the view model.
        expect(bout.result).toBeNull();
        expect(bout.winner).toBeNull();
        expect(bout.loser).toBeNull();
        expect(bout.recap).toBeNull();
        expect(bout.secondsToBell).toBe(secondsUntil(bout.scheduled_at, SEED_EPOCH_MS));
        expect(bout.secondsToBell).toBeGreaterThan(0);
      }
    }
    // A week out, near enough: Fri 9pm ET from Saturday 18:00 UTC.
    expect(card.next!.secondsToBell).toBe(6 * 86_400 + 7 * 3600);
  });

  it("shows a fought bout with no recorded result as due, never as decided", async () => {
    // A pure read with no decide: bouts 3–5 have rung but have no ledger row.
    const repo = createDemoRepository({ now: () => SEED_EPOCH_MS, dataset: structuredClone(seed) });
    const card = fightCard(await repo.listBouts({ channelId: FIGHT_CHANNEL_ID }), SEED_EPOCH_MS)!;
    expect(card.bouts.map((bout) => bout.phase)).toEqual([
      "decided",
      "decided",
      "due",
      "due",
      "due",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(card.bouts.filter((bout) => bout.phase === "due").every((bout) => bout.recap === null && bout.winner === null)).toBe(true);
  });

  it("decides phase from the ledger row, not from status", () => {
    const [bout] = seed.bouts;
    const at = Date.parse(bout.scheduled_at);
    expect(boutPhase({ scheduled_at: bout.scheduled_at, result: null }, at - 1)).toBe("upcoming");
    expect(boutPhase({ scheduled_at: bout.scheduled_at, result: null }, at)).toBe("due");
    expect(boutPhase({ scheduled_at: bout.scheduled_at, result: seed.boutResults[0] }, at - 1)).toBe("decided");
    expect(boutPhase({ scheduled_at: "not a date", result: null }, at)).toBe("due");
  });

  it("numbers by schedule, whatever order the rows arrive in", async () => {
    const bouts = await decidedSeason();
    const forward = fightCard(bouts, AFTER_SEASON)!;
    const backward = fightCard([...bouts].reverse(), AFTER_SEASON)!;
    expect(backward.bouts.map((bout) => [bout.number, bout.id])).toEqual(
      forward.bouts.map((bout) => [bout.number, bout.id]),
    );
    expect(forward.bouts.map((bout) => bout.id)).toEqual(
      Array.from({ length: 8 }, (_, index) => boutId(index + 1)),
    );
    expect(forward.next).toBeNull();
    expect(forward.decidedCount).toBe(8);
  });

  it("shows the newest season, and has nothing for a channel with no bouts", async () => {
    const bouts = await decidedSeason(SEED_EPOCH_MS);
    const nextSeason: BoutWithResult = {
      ...bouts[7],
      id: boutId(1, 2),
      season: 2,
      seed: "bot-brawl:s2:b1",
      result: null,
      status: "scheduled",
    };
    expect(currentSeason([...bouts, nextSeason])).toBe(2);
    const card = fightCard([...bouts, nextSeason], SEED_EPOCH_MS)!;
    expect(card.season).toBe(2);
    expect(card.bouts.map((bout) => [bout.number, bout.id])).toEqual([[1, boutId(1, 2)]]);

    expect(currentSeason([])).toBeNull();
    expect(fightCard([], SEED_EPOCH_MS)).toBeNull();
  });

  it("collects the fighters, so the page can keep them off the hire panel", async () => {
    const ids = fighterIds(await decidedSeason(SEED_EPOCH_MS));
    expect([...ids].sort()).toEqual([agentId("rusty-knuckles"), agentId("velvet-voltage")].sort());
    expect(fighterIds([]).size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("fight night clocks", () => {
  it("prints the bell in Eastern time with the zone named", () => {
    expect(formatBoutTime(seed.bouts[0].scheduled_at)).toBe("Fri, Aug 7 · 9:00 PM EDT");
    expect(formatBoutTime("2026-11-14T02:00:00.000Z")).toBe("Fri, Nov 13 · 9:00 PM EST");
    expect(formatBoutTime("never")).toBe("Time to be announced");
  });

  it("counts a week down in days", () => {
    expect(formatLongCountdown(6 * 86_400 + 7 * 3600 + 12 * 60)).toBe("6d 07:12:00");
    expect(formatLongCountdown(86_400)).toBe("1d 00:00:00");
    for (const seconds of [0, 59, 521, 3600, 86_399]) {
      expect(formatLongCountdown(seconds)).toBe(formatCountdown(seconds));
    }
    expect(formatLongCountdown(-5)).toBe("00:00");
  });
});

/* -------------------------------------------------------------------------- */

describe("the District leaderboard", () => {
  async function seededCompetitions(): Promise<CompetitionWithEntries[]> {
    const repo = createDemoRepository({ now: () => SEED_EPOCH_MS, dataset: structuredClone(seed) });
    return repo.listCompetitions();
  }

  it("counts a win only for a finished race", async () => {
    const competitions = await seededCompetitions();
    const rows = leaderboardRows(competitions);
    const wins = Object.fromEntries(rows.map((row) => [row.handle, row.wins]));

    // The one finished race, and the agent its panel names "Winner".
    const finished = competitions.filter((entry) => entry.status === "finished");
    expect(finished).toHaveLength(1);
    expect(standings(finished[0])[0].agentHandle).toBe("quickpdf");
    expect(wins.quickpdf).toBe(1);

    // Leading a live race is not a win; neither is leading one that has not
    // started (every Cold Open Cup entry is at 0, so array order "leads").
    for (const entry of competitions.filter((row) => row.status !== "finished")) {
      const leader = standings(entry)[0];
      if (leader.agentHandle !== "quickpdf") expect(wins[leader.agentHandle], leader.agentHandle).toBe(0);
    }
    expect(wins.deepresearch).toBe(0);
    expect(wins.sitesprint).toBe(0);
    expect(wins.otto).toBe(0);
    expect(rows.reduce((total, row) => total + row.wins, 0)).toBe(finished.length);
  });

  it("does not credit a live race whose seeded clock ran out — it is in its next heat", async () => {
    const competitions = await seededCompetitions();
    const overrun = competitions.map((entry) =>
      entry.status === "live" ? { ...entry, ends_at: new Date(SEED_EPOCH_MS - 60_000).toISOString() } : entry,
    );
    expect(leaderboardRows(overrun).find((row) => row.handle === "deepresearch")!.wins).toBe(0);

    // The same race, marked finished, is a win for the same agent.
    const settled = competitions.map((entry) =>
      entry.title === "LIVE: The Research Race" ? { ...entry, status: "finished" as const } : entry,
    );
    expect(leaderboardRows(settled).find((row) => row.handle === "deepresearch")!.wins).toBe(1);
  });

  it("still counts every race entered and averages over all of them", async () => {
    const competitions = await seededCompetitions();
    const rows = leaderboardRows(competitions);
    const datafox = rows.find((row) => row.handle === "datafox")!;
    // Live Research Race (0.942) and the finished Permit Pull Classic (0.977).
    expect(datafox.races).toBe(2);
    expect(datafox.wins).toBe(0);
    expect(datafox.bestAccuracy).toBeCloseTo(0.977, 6);
    expect(datafox.avgAccuracy).toBeCloseTo((0.942 + 0.977) / 2, 6);
    expect(rows.reduce((total, row) => total + row.races, 0)).toBe(
      competitions.reduce((total, entry) => total + entry.entries.length, 0),
    );
    // Ranked by average accuracy.
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index - 1].avgAccuracy).toBeGreaterThanOrEqual(rows[index].avgAccuracy);
    }
  });
});
