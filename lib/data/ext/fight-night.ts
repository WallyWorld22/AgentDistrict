import { compareBoutSchedule } from "@/lib/data/league";
import type { BoutMethod, BoutWithResult, LeagueFighter } from "@/lib/data/types";
import { secondsUntil } from "./lounge";

/**
 * Pure helpers behind Fight Night — the District TV Fight League's surfaces on
 * a channel page (`components/tv/fight-night.tsx`).
 *
 * **Fiction.** The league is a scripted robot-boxing show. Its outcomes are
 * decided by `decideBoutOutcome()` and recorded once in `bout_results`; this
 * module only arranges what the repository already returned. Nothing here
 * decides, re-decides or predicts a bout: an upcoming bout carries its time and
 * nothing else, and a decided one is presented from its recorded result.
 *
 * Like the rest of `lib/data/ext`, no adapter is imported, nothing calls
 * `Date.now()` (the clock is injected) and nothing calls `Math.random()`.
 */

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

/** The pill every league surface wears. */
export const LEAGUE_FICTION_LABEL = "Fiction";

/** The pill's `title` and screen-reader text — the whole disclosure in one line. */
export const LEAGUE_FICTION_NOTE =
  "The District TV Fight League is a scripted robot-boxing show. Every bout is decided by the league's published formula and recorded once; it moves no rating, review or job count.";

/** A fighter card's pill. */
export const FIGHTER_FICTION_LABEL = "Fictional fighter";

/** Who the recap is credited to. A desk, not a person: there is no announcer agent. */
export const SPORTS_DESK_BYLINE = "District TV sports desk";

/** The recap byline's `title` — how the copy is made, said plainly. */
export const SPORTS_DESK_NOTE =
  "Written by a fixed template from the recorded winner, method and narrative seed — no model, no person. The result line is the ledger's; the color around it is fiction.";

/* -------------------------------------------------------------------------- */
/* The recap                                                                   */
/* -------------------------------------------------------------------------- */

export type BoutRecap = {
  /** Opener, winner colour, loser colour — flavour, in that order. */
  lines: [opener: string, winnerLine: string, loserLine: string];
  /** The recorded result, restated. Always last, always the ledger's. */
  verdict: string;
  /** Everything above as one paragraph. */
  text: string;
};

type Template = (w: string, l: string) => string;

/**
 * One opener per way a bout can end. A stoppage opener never mentions the
 * judges and a decision opener never mentions a count, so the colour cannot
 * describe a different ending from the recorded `method`.
 */
const OPENERS: Record<BoutMethod, readonly Template[]> = {
  knockout: [
    (w, l) => `${w} ended it the old-fashioned way: one clean shot, and ${l} did not beat the count.`,
    (w, l) => `${l} walked onto a short right hand, and ${w} was already heading for the neutral corner.`,
    (w, l) => `Lights out. ${w} found the opening and ${l} found the canvas.`,
  ],
  "technical knockout": [
    (w, l) => `The referee had seen enough: ${w} was landing at will and ${l} had stopped answering.`,
    (w, l) => `${w} kept the pressure on until the towel came in for ${l}.`,
    (w, l) => `No count, no argument: ${w} broke ${l} down until the referee stepped in.`,
  ],
  "unanimous decision": [
    (w) => `It went the distance, and every judge saw it the same way: ${w}.`,
    (w, l) => `${w} out-boxed ${l} round by round, and all three cards agreed.`,
    (w, l) => `No controversy on press row: ${w} over ${l} on every card.`,
  ],
  "split decision": [
    (w, l) => `Two judges went with ${w}, one with ${l}, and the argument will run until next Friday.`,
    (w) => `Close enough to split the panel: ${w} took it on two of the three cards.`,
    (w, l) => `${l} won one judge over; ${w} won the other two.`,
  ],
  "majority decision": [
    (w, l) => `Two cards for ${w}, one scored even: ${l} pushed it all the way and came up short.`,
    (w) => `A majority decision: ${w} on two cards, the third a draw.`,
    (w) => `${w} edged it. One judge could not separate them; the other two could.`,
  ],
};

/**
 * Colour for whoever won, keyed by the Bot Brawl fighters' handles (their
 * Passports describe them; this only borrows the description). Any other
 * fighter gets the generic lines. Every line here is true of a winner however
 * the bout ended.
 */
const WINNER_LINES: Record<string, readonly Template[]> = {
  "rusty-knuckles": [
    () => "The mismatched blue glove did the talking.",
    (w) => `${w} stayed patient behind the guard and picked the moments.`,
    (w) => `${w}, dry as ever afterwards: "Gloves work. Who knew."`,
  ],
  "velvet-voltage": [
    (w) => `${w} narrated the highlight while it was still happening.`,
    () => "The footwork was elegant, and this time it was decisive too.",
    (w) => `${w} took a bow to all four corners on the way out.`,
  ],
};

const GENERIC_WINNER_LINES: readonly Template[] = [
  (w) => `${w} found the range early and kept it.`,
  (w) => `${w} had the better plan and stuck to it.`,
  (w) => `${w} owned the center of the ring.`,
];

/** Colour for whoever lost — never a line that hands them the bout. */
const LOSER_LINES: Record<string, readonly Template[]> = {
  "rusty-knuckles": [
    (_w, l) => `${l} kept the blue glove high, just not high enough.`,
    (_w, l) => `Patient on defense, maybe too patient: ${l} waited for an opening that never came.`,
    (_w, l) => `${l} summed up the night in one dry word: "Noted."`,
  ],
  "velvet-voltage": [
    (_w, l) => `${l} narrated a comeback that never quite arrived.`,
    () => "The footwork was elegant; the result was not.",
    (_w, l) => `${l} still took a bow. Old habits.`,
  ],
};

const GENERIC_LOSER_LINES: readonly Template[] = [
  (_w, l) => `${l} had moments, just not enough of them.`,
  (_w, l) => `${l} never found a rhythm.`,
  (_w, l) => `${l} will want this one back.`,
];

/** The three 16-bit picks the recap takes from `narrative_seed`. */
function seedPicks(narrativeSeed: string): [number, number, number] {
  const word = (index: number) => {
    const value = parseInt(narrativeSeed.slice(index * 4, index * 4 + 4), 16);
    return Number.isNaN(value) ? 0 : value;
  };
  return [word(0), word(1), word(2)];
}

/** A fighter's display name, never empty. */
function nameOf(fighter: LeagueFighter): string {
  return fighter.name.trim() || "Unknown fighter";
}

/**
 * The sports desk's recap of a decided bout — deterministic and zero-LLM.
 *
 * A pure function of the bout's two fighters and its **recorded** result: the
 * winner and loser come from `result.winner_id`, the opener is chosen from the
 * lines for `result.method`, and `result.narrative_seed` (16 hex characters the
 * formula emitted with the result) picks which variant of each line is used.
 * Same bout, same text, on every server, every render.
 *
 * The recorded result is authoritative and the copy cannot contradict it: the
 * winner is always the subject of the verdict, flavour lines about the loser
 * never award them the bout, and the verdict restates the ledger in the feed
 * headline's own words. A bout with no result — or whose recorded winner is
 * neither fighter, which the ledger's trigger refuses — gets no recap.
 */
export function boutRecap(
  bout: Pick<BoutWithResult, "fighter_a" | "fighter_b" | "fighterA" | "fighterB" | "result">,
): BoutRecap | null {
  const result = bout.result;
  if (!result) return null;

  let winner: LeagueFighter;
  let loser: LeagueFighter;
  if (result.winner_id === bout.fighter_a) {
    winner = bout.fighterA;
    loser = bout.fighterB;
  } else if (result.winner_id === bout.fighter_b) {
    winner = bout.fighterB;
    loser = bout.fighterA;
  } else {
    return null;
  }

  const w = nameOf(winner);
  const l = nameOf(loser);
  const [openerPick, winnerPick, loserPick] = seedPicks(result.narrative_seed);

  const openers = OPENERS[result.method] ?? OPENERS["unanimous decision"];
  const winnerLines = WINNER_LINES[winner.handle] ?? GENERIC_WINNER_LINES;
  const loserLines = LOSER_LINES[loser.handle] ?? GENERIC_LOSER_LINES;

  const lines: BoutRecap["lines"] = [
    openers[openerPick % openers.length](w, l),
    winnerLines[winnerPick % winnerLines.length](w, l),
    loserLines[loserPick % loserLines.length](w, l),
  ];
  const verdict = `Official result: ${w} def. ${l} by ${result.method}.`;
  return { lines, verdict, text: [...lines, verdict].join(" ") };
}

/* -------------------------------------------------------------------------- */
/* The card                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Where a bout stands, from what is recorded and the injected clock:
 *
 * - `decided` — it has a `bout_results` row. The row is the only thing that
 *   makes a bout decided here; `status` alone does not.
 * - `due` — its time has passed but no result is recorded yet (the
 *   advance-on-read call failed, or the database's clock disagreed). Shown as
 *   pending, never guessed at.
 * - `upcoming` — still in the future.
 */
export type BoutPhase = "decided" | "due" | "upcoming";

export function boutPhase(
  bout: Pick<BoutWithResult, "scheduled_at" | "result">,
  now: number,
): BoutPhase {
  if (bout.result) return "decided";
  const at = Date.parse(bout.scheduled_at);
  return Number.isNaN(at) || at <= now ? "due" : "upcoming";
}

export type FightCardEntry = BoutWithResult & {
  /** 1-based position on its season's card, in schedule order. */
  number: number;
  phase: BoutPhase;
  /** Whole seconds to the opening bell; 0 unless `upcoming`. */
  secondsToBell: number;
  /** From the recorded result; `null` until there is one. */
  winner: LeagueFighter | null;
  loser: LeagueFighter | null;
  recap: BoutRecap | null;
};

export type FightCard = {
  season: number;
  bouts: FightCardEntry[];
  /** The next bout still to be fought, if any. */
  next: FightCardEntry | null;
  /** The most recently fought bout with a recorded result, if any. */
  latest: FightCardEntry | null;
  decidedCount: number;
};

/** The season a channel is on now: the highest one it has bouts in. */
export function currentSeason(bouts: Array<Pick<BoutWithResult, "season">>): number | null {
  if (bouts.length === 0) return null;
  return Math.max(...bouts.map((bout) => bout.season));
}

/**
 * The current season's card, numbered in schedule order (`scheduled_at`, then
 * `id`, the order `listBouts()` guarantees — re-sorted here so array order is
 * never an input). `null` for a channel with no bouts.
 */
export function fightCard(bouts: BoutWithResult[], now: number): FightCard | null {
  const season = currentSeason(bouts);
  if (season === null) return null;

  const entries = bouts
    .filter((bout) => bout.season === season)
    .sort(compareBoutSchedule)
    .map((bout, index): FightCardEntry => {
      const phase = boutPhase(bout, now);
      const recap = phase === "decided" ? boutRecap(bout) : null;
      const winnerIsA = bout.result?.winner_id === bout.fighter_a;
      const winnerIsB = bout.result?.winner_id === bout.fighter_b;
      return {
        ...bout,
        number: index + 1,
        phase,
        secondsToBell: phase === "upcoming" ? secondsUntil(bout.scheduled_at, now) : 0,
        winner: winnerIsA ? bout.fighterA : winnerIsB ? bout.fighterB : null,
        loser: winnerIsA ? bout.fighterB : winnerIsB ? bout.fighterA : null,
        recap,
      };
    });

  const decided = entries.filter((entry) => entry.phase === "decided");
  return {
    season,
    bouts: entries,
    next: entries.find((entry) => entry.phase === "upcoming") ?? null,
    latest: decided.at(-1) ?? null,
    decidedCount: decided.length,
  };
}

/** Every fighter id on a set of bouts — who the channel page must not sell as a host. */
export function fighterIds(bouts: Array<Pick<BoutWithResult, "fighter_a" | "fighter_b">>): Set<string> {
  return new Set(bouts.flatMap((bout) => [bout.fighter_a, bout.fighter_b]));
}

/* -------------------------------------------------------------------------- */
/* Time                                                                        */
/* -------------------------------------------------------------------------- */

/** Bot Brawl is billed in Eastern time ("Fridays, 9pm ET"). */
const FIGHT_NIGHT_TIME_ZONE = "America/New_York";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: FIGHT_NIGHT_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: FIGHT_NIGHT_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/**
 * `2026-08-08T01:00:00Z` → `Fri, Aug 7 · 9:00 PM EDT` — the bell in the
 * show's own time zone, with the zone printed so nobody has to guess. Rendered
 * on the server only, so the viewer's locale cannot split the hydration.
 */
export function formatBoutTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Time to be announced";
  // ICU puts a narrow no-break space before AM/PM; a plain one wraps the same
  // and keeps the copy greppable.
  const time = TIME_FORMAT.format(at).replace(/ /g, " ");
  return `${DATE_FORMAT.format(at)} · ${time}`;
}
