import { boutResultEvent, boutLoserId, decideBoutOutcome } from "../data/league";
import type { Bout, BoutResult, DistrictEvent } from "../data/types";
import { agent, agentId } from "./agents";
import { at, daysAgo } from "./clock";
import { channels, FIGHT_CHANNEL_SLUG } from "./tv";
import { id } from "./uuid";

/**
 * The District TV Fight League, Season 1 — **fiction**.
 *
 * Bot Brawl is a scripted robot-boxing show. Eight bouts between Rusty
 * Knuckles and Velvet Voltage, one every Friday at 9pm ET (01:00 UTC
 * Saturday), laid out around `SEED_EPOCH` so the seeded District holds every
 * state a bout can be in:
 *
 *   bouts 1–2  fought and **decided** — their `bout_results` rows and
 *              `bout_result` events are in the seed;
 *   bouts 3–5  fought but **not yet decided** — the first read that calls
 *              `decideDueBouts()` decides them (advance-on-read);
 *   bouts 6–8  still **scheduled** in the future.
 *
 * Those states are relative to the seed epoch, like every seeded timestamp. In
 * supabase mode the clock is real time, so on a database seeded after the
 * epoch more of the card is already due.
 *
 * The two seeded results are not written by hand: they are
 * `decideBoutOutcome()` of their bout — the same formula `decide_bout()` runs
 * in SQL, and 0012's `bout_results` trigger refuses a row that is anything
 * else, so a seed that disagreed with Postgres would not load. Same seed data,
 * same winners, every reseed.
 */

const HOUR = 3600;
const DAY = 24 * HOUR;

/** The Friday-night slot nearest before the epoch: Sat 2026-09-05 01:00 UTC. */
const LAST_FIGHT_NIGHT = -17 * HOUR;

/** How long a bout takes, which is when a seeded result was recorded. */
const BOUT_LENGTH_SECONDS = 45 * 60;

type BoutSpec = {
  /** 1-based position on the Season 1 card. */
  number: number;
  /** The "home" corner. The formula reads the corners, so they are data. */
  a: string;
  b: string;
  weights: [a: number, b: number];
  /** Decided before the epoch: the seed carries its result. */
  decided: boolean;
};

const RUSTY = "rusty-knuckles";
const VELVET = "velvet-voltage";

const SEASON = 1;

const CARD: BoutSpec[] = [
  { number: 1, a: RUSTY, b: VELVET, weights: [50, 50], decided: true },
  { number: 2, a: VELVET, b: RUSTY, weights: [55, 45], decided: true },
  { number: 3, a: RUSTY, b: VELVET, weights: [50, 50], decided: false },
  { number: 4, a: VELVET, b: RUSTY, weights: [60, 40], decided: false },
  { number: 5, a: RUSTY, b: VELVET, weights: [45, 55], decided: false },
  { number: 6, a: VELVET, b: RUSTY, weights: [50, 50], decided: false },
  { number: 7, a: RUSTY, b: VELVET, weights: [52, 48], decided: false },
  { number: 8, a: VELVET, b: RUSTY, weights: [50, 50], decided: false },
];

const channel = channels.find((row) => row.slug === FIGHT_CHANNEL_SLUG);
if (!channel) throw new Error(`seed: the ${FIGHT_CHANNEL_SLUG} channel is missing`);

/** Bout `n` is `n - 5` weeks from the last fight night before the epoch. */
function scheduledOffset(number: number): number {
  return LAST_FIGHT_NIGHT + (number - 5) * 7 * DAY;
}

export function boutId(number: number, season = SEASON): string {
  return id("bout", `s${season}-b${number}`);
}

export const bouts: Bout[] = CARD.map((spec) => ({
  id: boutId(spec.number),
  channel_id: channel.id,
  season: SEASON,
  fighter_a: agentId(spec.a),
  fighter_b: agentId(spec.b),
  fighter_a_weight: spec.weights[0],
  fighter_b_weight: spec.weights[1],
  scheduled_at: at(scheduledOffset(spec.number)),
  seed: `${FIGHT_CHANNEL_SLUG}:s${SEASON}:b${spec.number}`,
  kind: "fictional",
  status: spec.decided ? "decided" : "scheduled",
  // The Season 1 card was announced with the channel.
  created_at: daysAgo(35),
}));

export const boutResults: BoutResult[] = CARD.filter((spec) => spec.decided).map((spec) => {
  const bout = bouts.find((row) => row.id === boutId(spec.number))!;
  return {
    bout_id: bout.id,
    ...decideBoutOutcome(bout),
    decided_at: at(scheduledOffset(spec.number) + BOUT_LENGTH_SECONDS),
  };
});

/** The feed rows `decide_bout()` would have written for the seeded results. */
export const boutResultEvents: DistrictEvent[] = boutResults.map((result) => {
  const bout = bouts.find((row) => row.id === result.bout_id)!;
  const winner = agent(handleOf(result.winner_id));
  const loser = agent(handleOf(boutLoserId(bout, result.winner_id)));
  const event = boutResultEvent({
    bout,
    result,
    winnerName: winner.name,
    loserName: loser.name,
    channel,
  });
  return {
    id: id("event", `bout-result:${bout.seed}`),
    kind: event.kind,
    actor_type: event.actor_type,
    actor_id: null,
    actor_name: event.actor_name,
    headline: event.headline,
    body: event.body,
    cta_label: event.cta_label ?? null,
    cta_href: event.cta_href ?? null,
    created_at: result.decided_at,
  };
});

function handleOf(agentUuid: string): string {
  if (agentUuid === agentId(RUSTY)) return RUSTY;
  if (agentUuid === agentId(VELVET)) return VELVET;
  throw new Error(`seed: ${agentUuid} is not on the Season 1 card`);
}

/** The channel the seeded league fights on, for tests and the adapters' callers. */
export const FIGHT_CHANNEL_ID = channel.id;
export const LEAGUE_SEASON = SEASON;
