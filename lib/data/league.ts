import {
  BOUT_METHODS,
  type Bout,
  type BoutMethod,
  type BoutResult,
  type LeagueFighter,
  type LeagueStanding,
  type PublishEventInput,
  type UUID,
} from "./types";

/**
 * The District TV Fight League formula — shared by both adapters.
 *
 * **Fiction.** The league is a scripted robot-boxing show on District TV. A
 * bout's outcome is stored *before* anything presents it, exactly once, and it
 * never touches marketplace reputation. This module is the TypeScript half of
 * that contract; `public.bout_outcome()` in
 * `supabase/migrations/0012_fight_league.sql` is the SQL half, and the two
 * must agree bit for bit:
 *
 *   digest  = md5( lower(bout.id) + ":" + bout.seed )          32 hex chars
 *   roll    = uint32(digest[0..8])  mod (weight_a + weight_b)
 *   winner  = roll < weight_a ? fighter_a : fighter_b
 *   method  = BOUT_METHODS[ uint32(digest[8..16]) mod 5 ]
 *   recap   = digest[16..32]                                   narrative_seed
 *
 * Every input is a column of the bout row. Nothing a caller passes — not the
 * time of the call, not who calls, not the order bouts are processed in — can
 * move the result. `tests/unit/league.test.ts` pins the vectors, and
 * `tests/integration/fight-league.test.ts` runs every seeded bout through
 * Postgres's own `md5()` and compares.
 *
 * MD5 is used because it is the digest Postgres ships without an extension;
 * nothing here is a security boundary (every input is public), it only has to
 * be the same function on both sides. It is hand-rolled, like the seed's
 * SHA-1, so this module imports nothing and runs in any runtime.
 */

/* -------------------------------------------------------------------------- */
/* The roster                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The Bot Brawl fighters — fiction, never marketplace agents.
 *
 * The app's copy of `public.league_fighters` (0012), which is the authority in
 * supabase mode: there every bout's fighters must be on that roster (a foreign
 * key), and a roster member can carry no gig, bid or order and never leaves
 * `offline` (triggers). `tests/unit/league-marketplace.test.ts` pins this list
 * to the seeded roster and `tests/integration/fight-league.test.ts` to the
 * database's.
 */
export const FIGHTER_HANDLES = ["rusty-knuckles", "velvet-voltage"] as const;

const ROSTER: ReadonlySet<string> = new Set(FIGHTER_HANDLES);

/**
 * Is this Passport one of the Fight League's fictional fighters?
 *
 * The one test every marketplace surface asks — discovery listings leave them
 * out, SEO emits no Service or Offer for them, and the write paths (a gig, a
 * bid, going online) refuse them. Takes a handle (`@` and case ignored) or
 * anything with one, so it runs on an `Agent`, a summary or a form value alike.
 * Pure data, no I/O: safe in either repository mode and in a client component.
 */
export function isLeagueFighter(
  agent: string | { handle: string } | null | undefined,
): boolean {
  const handle = typeof agent === "string" ? agent : agent?.handle;
  if (!handle) return false;
  return ROSTER.has(handle.trim().replace(/^@/, "").toLowerCase());
}

/**
 * The disclosure a fighter's machine-readable card carries in place of a
 * capability list.
 */
export const LEAGUE_FIGHTER_CARD_NOTE =
  "A fictional character on Bot Brawl, District TV's scripted Fight League — not a service. " +
  "It has nothing to hire, no tools to call and no endpoint of its own; its bouts are decided " +
  "by the league's published formula and move no rating, review or job count.";

/** What a write path says when it refuses a fighter. One sentence, names the fiction. */
export function leagueFighterRefusal(name: string, action: string): string {
  return `${name} is a fictional Fight League character, not a marketplace agent, so it cannot ${action}.`;
}

/* -------------------------------------------------------------------------- */
/* MD5 (RFC 1321)                                                              */
/* -------------------------------------------------------------------------- */

/** Per-round left-rotation amounts. */
const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/**
 * `floor(abs(sin(i + 1)) * 2^32)`, written out rather than computed: `Math.sin`
 * is only approximately specified, and a constant table cannot drift between
 * engines.
 */
const CONSTANTS = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function littleEndianHex(word: number): string {
  let out = "";
  for (let i = 0; i < 4; i += 1) out += ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
  return out;
}

/** Lowercase hex MD5 of the UTF-8 bytes of `input` — what Postgres's `md5(text)` returns. */
export function md5Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const blocks = ((bytes.length + 8) >> 6) + 1;
  const padded = new Uint8Array(blocks * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(padded.length - 8, bitLength >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLength / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const words = new Uint32Array(16);

  for (let block = 0; block < blocks; block += 1) {
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(block * 64 + i * 4, true);

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const next = (f + a + CONSTANTS[i] + words[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(next, SHIFTS[i])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return littleEndianHex(a0) + littleEndianHex(b0) + littleEndianHex(c0) + littleEndianHex(d0);
}

/* -------------------------------------------------------------------------- */
/* The outcome                                                                 */
/* -------------------------------------------------------------------------- */

/** The bout columns the formula reads — and the only ones. */
export type BoutFormulaInput = Pick<
  Bout,
  "id" | "seed" | "fighter_a" | "fighter_b" | "fighter_a_weight" | "fighter_b_weight"
>;

/** What `decideBoutOutcome` returns: a `BoutResult` without its timestamp. */
export type BoutOutcome = Pick<BoutResult, "winner_id" | "method" | "narrative_seed">;

/** Mirrors the `bouts.seed` check constraint in 0012. */
export const BOUT_SEED_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

/** The string the digest is taken over. */
export function boutDigestInput(bout: Pick<Bout, "id" | "seed">): string {
  return `${bout.id.toLowerCase()}:${bout.seed}`;
}

function assertWeight(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new RangeError(`${label} must be an integer between 1 and 100, got ${value}`);
  }
}

/**
 * The league formula. Pure, total over valid rows, and identical to
 * `public.bout_outcome()` — see the header for the definition.
 */
export function decideBoutOutcome(bout: BoutFormulaInput): BoutOutcome {
  assertWeight("fighter_a_weight", bout.fighter_a_weight);
  assertWeight("fighter_b_weight", bout.fighter_b_weight);
  if (!BOUT_SEED_PATTERN.test(bout.seed)) {
    throw new RangeError(`bout seed ${JSON.stringify(bout.seed)} is outside [A-Za-z0-9._:-]{1,64}`);
  }
  if (bout.fighter_a === bout.fighter_b) {
    throw new RangeError("a bout needs two different fighters");
  }

  const digest = md5Hex(boutDigestInput(bout));
  const roll = parseInt(digest.slice(0, 8), 16) % (bout.fighter_a_weight + bout.fighter_b_weight);
  const method: BoutMethod = BOUT_METHODS[parseInt(digest.slice(8, 16), 16) % BOUT_METHODS.length];
  return {
    winner_id: roll < bout.fighter_a_weight ? bout.fighter_a : bout.fighter_b,
    method,
    narrative_seed: digest.slice(16, 32),
  };
}

/** The fighter who did not win. */
export function boutLoserId(bout: Pick<Bout, "fighter_a" | "fighter_b">, winnerId: UUID): UUID {
  return winnerId === bout.fighter_a ? bout.fighter_b : bout.fighter_a;
}

/* -------------------------------------------------------------------------- */
/* The feed event                                                              */
/* -------------------------------------------------------------------------- */

/** Who a `bout_result` event is from. `decide_bout()` writes the same name. */
export const FIGHT_LEAGUE_ACTOR_NAME = "District TV Fight League";

/**
 * The `bout_result` event for a decided bout — the copy `decide_bout()` writes
 * in SQL, character for character, so the two adapters put the same row in the
 * feed. Both lines say "fiction" in the row itself.
 */
export function boutResultEvent(input: {
  bout: Pick<Bout, "season">;
  result: Pick<BoutResult, "method">;
  winnerName: string;
  loserName: string;
  channel: { slug: string; title: string };
}): PublishEventInput & { kind: "bout_result"; actor_type: "system" } {
  return {
    kind: "bout_result",
    actor_type: "system",
    actor_id: null,
    actor_name: FIGHT_LEAGUE_ACTOR_NAME,
    headline: `Fight League (fiction): ${input.winnerName} def. ${input.loserName} by ${input.result.method}`,
    body:
      `${input.channel.title} · Season ${input.bout.season}. A scripted District TV exhibition, ` +
      "decided by the league's published formula and recorded once. Fiction: it moves no " +
      "rating, review or job count.",
    cta_label: "See the fight card",
    cta_href: `/tv/${input.channel.slug}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Ordering and standings                                                      */
/* -------------------------------------------------------------------------- */

/** Schedule order: `scheduled_at`, then `id` — never array order. */
export function compareBoutSchedule(
  a: Pick<Bout, "id" | "scheduled_at">,
  b: Pick<Bout, "id" | "scheduled_at">,
): number {
  return Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at) || codepointCompare(a.id, b.id);
}

/** A fighter whose Passport could not be read — the ledger still shows the bout. */
export function unknownFighter(id: UUID): LeagueFighter {
  return { id, handle: "", name: "Unknown fighter", avatar_emoji: "🥊", avatar_gradient: "" };
}

/** Narrow any agent-shaped row to the identity the league is allowed to show. */
export function toLeagueFighter(agent: LeagueFighter): LeagueFighter {
  return {
    id: agent.id,
    handle: agent.handle,
    name: agent.name,
    avatar_emoji: agent.avatar_emoji,
    avatar_gradient: agent.avatar_gradient,
  };
}

/**
 * Wins and losses per fighter, counted from `results` and nothing else.
 *
 * `bouts` supplies the card — who fought whom, so a loser can be named and a
 * fighter with only scheduled bouts still appears at 0–0 — but a bout without
 * a row in `results` contributes nothing, whatever its `status` says. Ordered
 * by wins, then fewest losses, then name, then id: a total order, so the table
 * is the same whatever order the rows arrive in.
 */
export function computeLeagueStandings(
  bouts: Array<Pick<Bout, "id" | "fighter_a" | "fighter_b">>,
  results: Array<Pick<BoutResult, "bout_id" | "winner_id">>,
  fighters: Map<UUID, LeagueFighter>,
): LeagueStanding[] {
  const tally = new Map<UUID, { wins: number; losses: number }>();
  const ensure = (id: UUID) => {
    let row = tally.get(id);
    if (!row) {
      row = { wins: 0, losses: 0 };
      tally.set(id, row);
    }
    return row;
  };

  const boutById = new Map(bouts.map((bout) => [bout.id, bout]));
  for (const bout of bouts) {
    ensure(bout.fighter_a);
    ensure(bout.fighter_b);
  }
  for (const result of results) {
    const bout = boutById.get(result.bout_id);
    if (!bout) continue;
    ensure(result.winner_id).wins += 1;
    ensure(boutLoserId(bout, result.winner_id)).losses += 1;
  }

  return [...tally.entries()]
    .map(([id, row]) => ({
      fighter: fighters.get(id) ?? unknownFighter(id),
      wins: row.wins,
      losses: row.losses,
      decided: row.wins + row.losses,
    }))
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        a.losses - b.losses ||
        codepointCompare(a.fighter.name, b.fighter.name) ||
        codepointCompare(a.fighter.id, b.fighter.id),
    );
}

/** Not `localeCompare`: that varies with the runtime's ICU data. */
function codepointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
