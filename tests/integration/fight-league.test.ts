import { createHash, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoRepository } from "@/lib/data/demo";
import {
  FIGHTER_HANDLES,
  decideBoutOutcome,
  isLeagueFighter,
  type BoutFormulaInput,
} from "@/lib/data/league";
import type { Repository } from "@/lib/data/repository";
import { SupabaseRepository } from "@/lib/data/supabase";
import type { AgentSort, BoutResult } from "@/lib/data/types";
import {
  DEMO_PROFILE_ID,
  FIGHT_CHANNEL_ID,
  agentId,
  boutId,
  seed,
  seedCounts,
} from "@/lib/seed";
import { MIGRATIONS_DIR, SEED_FILE, SUPABASE_BOOTSTRAP } from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * The District TV Fight League (fiction) and 0012's integrity fixes, against a
 * REAL Postgres — and through the REAL Supabase adapter, whose PostgREST
 * traffic (reads and the `decide_bout` RPC) `./support/postgrest` answers as
 * `anon`.
 *
 * The database is built the way production gets it: 0001–0011 with the
 * District already seeded, **then** 0012 — twice — then the new seed, twice.
 * It is a database of its own on the `LOCAL_PG_URL` server, so it never races
 * `schema.test.ts`, which rebuilds its schema in place.
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const RUSTY = agentId("rusty-knuckles");
const VELVET = agentId("velvet-voltage");
const LEAGUE_MIGRATION = "0012_fight_league.sql";

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
let supabase: Repository;
/** Every reputation-bearing value, taken just before the season is decided. */
let reputationBefore: unknown;

/**
 * Everything marketplace reputation is made of, as one comparable value:
 * every agent row whole (rating, review count, jobs, reliability, updated_at),
 * every gig's counters, and the review and bump ledgers.
 */
async function reputationSnapshot(): Promise<unknown> {
  const { rows } = await db.query<{ snapshot: unknown }>(`
    select jsonb_build_object(
      'agents',  (select jsonb_agg(to_jsonb(a) order by a.id) from public.agents a),
      'gigs',    (select jsonb_agg(jsonb_build_object(
                    'id', g.id, 'runs', g.runs_count, 'rating', g.rating_avg,
                    'count', g.rating_count, 'updated_at', g.updated_at) order by g.id)
                  from public.gigs g),
      'reviews', (select jsonb_agg(to_jsonb(r) order by r.id) from public.reviews r),
      'bumps',   (select count(*) from public.reputation_bumps),
      'entries', (select jsonb_agg(to_jsonb(e) order by e.competition_id, e.agent_id)
                  from public.competition_entries e)
    ) as snapshot`);
  return rows[0].snapshot;
}

/** A bout's outcome without its timestamp — what both adapters must agree on. */
const outcomeOf = (row: BoutResult) => ({
  bout_id: row.bout_id,
  winner_id: row.winner_id,
  method: row.method,
  narrative_seed: row.narrative_seed,
});

async function apply(sql: string, label: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`);
  }
}

/**
 * `supabase/seed.sql` as a 0011 database can hold it: the three league
 * tables' sections (roster, bouts, results) and the `bout_result` feed rows
 * taken out, everything else as generated. That is the District production already has when 0012 lands.
 */
function seedWithoutLeague(sql: string): string {
  const out: string[] = [];
  let section = "";
  let insert: string | null = null;
  let rows: string[] = [];
  let dropping = false;

  for (const line of sql.split("\n")) {
    const heading = /^-- ([a-z_]+) \(\d+ rows?\)$/.exec(line);
    if (heading) section = heading[1];
    if (section === "league_fighters" || section === "bouts" || section === "bout_results") continue;

    if (section === "events" && line.startsWith("insert into public.events ")) {
      insert = line;
      rows = [];
      continue;
    }
    if (insert !== null) {
      if (line.startsWith("  (")) {
        rows.push(line.replace(/,$/, ""));
        continue;
      }
      const kept = rows.filter((row) => !row.includes("'bout_result'"));
      dropping = kept.length === 0;
      if (!dropping) out.push(insert, kept.join(",\n"));
      insert = null;
    }
    if (dropping) {
      if (line.endsWith(";")) dropping = false;
      continue;
    }
    out.push(line);
  }
  const statements = out.filter((line) => !line.startsWith("--"));
  if (statements.some((line) => /bout_result|public\.bouts|league_fighters/.test(line))) {
    throw new Error("league rows left in the 0011-shaped seed");
  }
  return out.join("\n");
}

/** Run `work` inside a transaction as `role`, then roll it back. */
async function as<T>(
  role: "anon" | "authenticated" | "service_role",
  work: () => Promise<T>,
  sub?: string,
): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`set local role ${role}`);
    if (sub) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
    return await work();
  } finally {
    await db.query("rollback");
  }
}

/** Expect `work` to throw `pattern`, without aborting the surrounding transaction. */
async function refused(pattern: RegExp, work: () => Promise<unknown>): Promise<void> {
  await db.query("savepoint refused");
  await expect(work()).rejects.toThrow(pattern);
  await db.query("rollback to savepoint refused");
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ count: string }>(sql, params);
  return Number(rows[0].count);
}

suite("the Fight League (0012) on a real Postgres", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: CONNECTION });
    try {
      await admin.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Cannot reach ${CONNECTION}: ${message}\n` +
          "Start the throwaway server first:  bash scripts/db-local.sh start",
      );
    }
    database = `agentdistrict_league_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);

    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();

    // Production as it stands: 0001–0011, seeded.
    await apply(SUPABASE_BOOTSTRAP, "bootstrap");
    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    expect(files).toContain(LEAGUE_MIGRATION);
    for (const name of files.filter((file) => file < LEAGUE_MIGRATION)) {
      await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), name);
    }
    const seedSql = await readFile(SEED_FILE, "utf8");
    await apply(seedWithoutLeague(seedSql), "seed.sql (0011 shape)");
    const preLeagueEvents = seedCounts.events - seed.events.filter((e) => e.kind === "bout_result").length;
    if ((await count("select count(*)::text as count from public.events")) !== preLeagueEvents) {
      throw new Error("the 0011-shaped seed did not load the pre-league District");
    }

    // Then 0012 — twice, because every migration here must be re-runnable —
    // and the seed that carries the league, twice, because it must be too.
    const league = await readFile(path.join(MIGRATIONS_DIR, LEAGUE_MIGRATION), "utf8");
    await apply(league, `${LEAGUE_MIGRATION} (first)`);
    await apply(league, `${LEAGUE_MIGRATION} (again)`);
    await apply(seedSql, "seed.sql");
    await apply(seedSql, "seed.sql (again)");

    pool = new Pool({ connectionString: url.href, max: 4 });
    const client = createPostgrestClient(pool);
    supabase = new SupabaseRepository(async () => client);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await db?.end();
    if (database) await admin?.query(`drop database if exists ${database} with (force)`);
    await admin?.end();
  });

  /* ------------------------------------------------------------- schema */

  it("lands on a seeded 0011 District and holds exactly the rows lib/seed emits", async () => {
    const kinds = await db.query<{ enumlabel: string }>(
      `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'event_kind'`,
    );
    expect(kinds.rows.map((row) => row.enumlabel)).toContain("bout_result");

    for (const [key, expected] of Object.entries(seedCounts)) {
      const table = key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
      expect(await count(`select count(*)::text as count from public.${table}`), table).toBe(expected);
    }

    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
        where relnamespace = 'public'::regnamespace
          and relname in ('league_fighters', 'bouts', 'bout_results')`,
    );
    expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true);
    expect(rls.rows).toHaveLength(3);

    const policies = await db.query<{ policyname: string }>(
      `select policyname from pg_policies
        where schemaname = 'public'
          and policyname in ('events_insert_authenticated', 'competition_entries_write')`,
    );
    expect(policies.rows).toEqual([]);
  });

  it("labels the fiction in the rows themselves", async () => {
    expect(await count("select count(*)::text as count from public.bouts where kind <> 'fictional'")).toBe(0);
    await db.query("begin");
    try {
      await refused(/bouts_kind_check/, () =>
        db.query("update public.bouts set kind = 'real' where id = $1", [boutId(7)]),
      );
    } finally {
      await db.query("rollback");
    }
    const { rows } = await db.query<{ headline: string; body: string; actor_type: string }>(
      "select headline, body, actor_type::text from public.events where kind = 'bout_result'",
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.actor_type).toBe("system");
      expect(row.headline).toMatch(/^Fight League \(fiction\): /);
      expect(row.body).toMatch(/Fiction: it moves no rating, review or job count\.$/);
    }
  });

  it("is the TypeScript formula, for every seeded bout and 300 synthetic rows", async () => {
    const synthetic: BoutFormulaInput[] = Array.from({ length: 300 }, (_, index) => {
      const hex = createHash("sha1").update(`integration-probe:${index}`).digest("hex");
      return {
        id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
        seed: `probe:${index}:${hex.slice(32, 38)}`,
        fighter_a: RUSTY,
        fighter_b: VELVET,
        fighter_a_weight: 1 + (index % 100),
        fighter_b_weight: 1 + ((index * 53) % 100),
      };
    });
    const rows = [...seed.bouts, ...synthetic];
    const { rows: sql } = await db.query<{
      id: string;
      winner_id: string;
      method: string;
      narrative_seed: string;
    }>(
      `select r->>'id' as id, o.winner_id, o.method, o.narrative_seed
         from json_array_elements($1::json) r,
              lateral public.bout_outcome(json_populate_record(null::public.bouts, r)) o`,
      [JSON.stringify(rows)],
    );
    expect(sql).toHaveLength(rows.length);
    const byId = new Map(sql.map((row) => [row.id, row]));
    for (const bout of rows) {
      const { winner_id, method, narrative_seed } = byId.get(bout.id)!;
      expect({ winner_id, method, narrative_seed }, bout.seed).toEqual(decideBoutOutcome(bout));
    }
  });

  /* --------------------------------------------------------- decide_bout */

  it("decides a due bout as anon: result, status and feed event in one call", async () => {
    const bout = seed.bouts.find((row) => row.id === boutId(3))!;
    await as("anon", async () => {
      const before = await count(
        "select count(*)::text as count from public.events where kind = 'bout_result'",
      );
      const { rows } = await db.query("select * from public.decide_bout($1)", [bout.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ bout_id: bout.id, ...decideBoutOutcome(bout) });

      const status = await db.query<{ status: string }>("select status from public.bouts where id = $1", [
        bout.id,
      ]);
      expect(status.rows[0].status).toBe("decided");
      expect(
        await count("select count(*)::text as count from public.events where kind = 'bout_result'"),
      ).toBe(before + 1);
      const event = await db.query<{ headline: string; cta_href: string }>(
        `select headline, cta_href from public.events where kind = 'bout_result'
          order by created_at desc limit 1`,
      );
      expect(event.rows[0].headline).toBe(
        "Fight League (fiction): Velvet Voltage def. Rusty Knuckles by technical knockout",
      );
      expect(event.rows[0].cta_href).toBe("/tv/bot-brawl");
    });
  });

  it("refuses a bout before its scheduled time, and one that does not exist", async () => {
    await db.query("begin");
    try {
      await db.query(
        `insert into public.bouts (id, channel_id, season, fighter_a, fighter_b, scheduled_at, seed)
         values ('00000000-0000-4000-8000-0000000000f1', $1, 1, $2, $3, now() + interval '1 day', 'probe:future')`,
        [FIGHT_CHANNEL_ID, RUSTY, VELVET],
      );
      await db.query("set local role anon");
      await refused(/cannot be decided before then/, () =>
        db.query("select public.decide_bout('00000000-0000-4000-8000-0000000000f1')"),
      );
      await refused(/bout not found/, () =>
        db.query("select public.decide_bout('00000000-0000-4000-8000-0000000000f2')"),
      );
      await db.query("set local role postgres");
      expect(
        await count(
          "select count(*)::text as count from public.bout_results where bout_id = '00000000-0000-4000-8000-0000000000f1'",
        ),
      ).toBe(0);
    } finally {
      await db.query("rollback");
    }
  });

  it("is idempotent: a second call returns the recorded result and writes nothing", async () => {
    await as("anon", async () => {
      const first = await db.query("select * from public.decide_bout($1)", [boutId(4)]);
      const events = await count(
        "select count(*)::text as count from public.events where kind = 'bout_result'",
      );
      const second = await db.query("select * from public.decide_bout($1)", [boutId(4)]);
      expect(second.rows).toEqual(first.rows);
      expect(
        await count("select count(*)::text as count from public.bout_results where bout_id = $1", [boutId(4)]),
      ).toBe(1);
      expect(
        await count("select count(*)::text as count from public.events where kind = 'bout_result'"),
      ).toBe(events);
      // An already-seeded result is returned as recorded, too.
      const seeded = await db.query("select * from public.decide_bout($1)", [boutId(1)]);
      expect(seeded.rows[0].winner_id).toBe(seed.boutResults[0].winner_id);
    });
  });

  it("is idempotent under a concurrent double-call: one result, one event", async () => {
    const probe = "00000000-0000-4000-8000-0000000000c1";
    const otherChannel = seed.channels.find((row) => row.slug === "the-night-shift")!.id;
    await db.query(
      `insert into public.bouts (id, channel_id, season, fighter_a, fighter_b, scheduled_at, seed)
       values ($1, $2, 99, $3, $4, now() - interval '1 hour', 'probe:concurrent')
       on conflict (id) do nothing`,
      [probe, otherChannel, RUSTY, VELVET],
    );
    const eventsBefore = await count(
      "select count(*)::text as count from public.events where kind = 'bout_result'",
    );

    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("begin");
      await first.query("set local role anon");
      const a = await first.query("select * from public.decide_bout($1)", [probe]);

      await second.query("begin");
      await second.query("set local role anon");
      // Blocks on the bout's row lock until `first` commits…
      const pending = second.query("select * from public.decide_bout($1)", [probe]);
      await new Promise((resolve) => setTimeout(resolve, 250));
      await first.query("commit");
      // …then reads the decided bout and returns the same ledger row.
      const b = await pending;
      await second.query("commit");

      expect(b.rows).toEqual(a.rows);
      expect(a.rows[0].winner_id).toBe(
        decideBoutOutcome({
          id: probe,
          seed: "probe:concurrent",
          fighter_a: RUSTY,
          fighter_b: VELVET,
          fighter_a_weight: 50,
          fighter_b_weight: 50,
        }).winner_id,
      );
    } finally {
      await first.query("rollback").catch(() => undefined);
      await second.query("rollback").catch(() => undefined);
      first.release();
      second.release();
    }

    expect(
      await count("select count(*)::text as count from public.bout_results where bout_id = $1", [probe]),
    ).toBe(1);
    expect(
      await count("select count(*)::text as count from public.events where kind = 'bout_result'"),
    ).toBe(eventsBefore + 1);
  });

  /* ---------------------------------------------------- the write-once ledger */

  it("keeps bout_results write-once, formula-true and out of every client's hands", async () => {
    // Not even the owner can rewrite history: the trigger stands in front.
    await db.query("begin");
    try {
      await refused(/write-once/, () =>
        db.query("update public.bout_results set winner_id = $1 where bout_id = $2", [RUSTY, boutId(1)]),
      );
      await refused(/write-once/, () =>
        db.query("delete from public.bout_results where bout_id = $1", [boutId(1)]),
      );
      // A result that is not the formula's is refused, even from the owner…
      const loser = decideBoutOutcome(seed.bouts[5]).winner_id === RUSTY ? VELVET : RUSTY;
      await refused(/formula/, () =>
        db.query(
          `insert into public.bout_results (bout_id, winner_id, method, narrative_seed)
           values ($1, $2, 'knockout', '0000000000000000')`,
          [boutId(6), loser],
        ),
      );
      // …and so is the formula's own answer, recorded before the bout is fought.
      const outcome = decideBoutOutcome(seed.bouts[7]);
      await db.query("update public.bouts set scheduled_at = now() + interval '1 day' where id = $1", [
        boutId(8),
      ]);
      await refused(/before it is fought/, () =>
        db.query(
          `insert into public.bout_results (bout_id, winner_id, method, narrative_seed, decided_at)
           values ($1, $2, $3, $4, now())`,
          [boutId(8), outcome.winner_id, outcome.method, outcome.narrative_seed],
        ),
      );
      // A decided bout cannot be edited or un-decided, nor one decided by hand.
      await refused(/cannot be edited/, () =>
        db.query("update public.bouts set seed = 'rigged' where id = $1", [boutId(1)]),
      );
      await refused(/cannot be edited/, () =>
        db.query("update public.bouts set fighter_a_weight = 100 where id = $1", [boutId(2)]),
      );
      await db.query("update public.bouts set status = 'scheduled' where id = $1", [boutId(1)]);
      const kept = await db.query<{ status: string }>("select status from public.bouts where id = $1", [
        boutId(1),
      ]);
      expect(kept.rows[0].status).toBe("decided");
      await refused(/decided by recording its result/, () =>
        db.query("update public.bouts set status = 'decided' where id = $1", [boutId(7)]),
      );
    } finally {
      await db.query("rollback");
    }

    const outcome = decideBoutOutcome(seed.bouts[6]);
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await as(
        role,
        async () => {
          await refused(/permission denied/, () =>
            db.query(
              `insert into public.bout_results (bout_id, winner_id, method, narrative_seed)
               values ($1, $2, $3, $4)`,
              [boutId(7), outcome.winner_id, outcome.method, outcome.narrative_seed],
            ),
          );
          await refused(/permission denied/, () =>
            db.query("delete from public.bout_results where bout_id = $1", [boutId(1)]),
          );
          // Readable by everyone.
          expect(await count("select count(*)::text as count from public.bout_results")).toBeGreaterThan(0);
        },
        role === "authenticated" ? DEMO_PROFILE_ID : undefined,
      );
    }
    for (const role of ["anon", "authenticated"] as const) {
      await as(
        role,
        async () => {
          await refused(/permission denied/, () =>
            db.query("update public.bouts set fighter_a_weight = 100 where id = $1", [boutId(7)]),
          );
          await refused(/permission denied/, () =>
            db.query(
              `insert into public.bouts (channel_id, season, fighter_a, fighter_b, scheduled_at, seed)
               values ($1, 1, $2, $3, now(), 'probe:client')`,
              [FIGHT_CHANNEL_ID, RUSTY, VELVET],
            ),
          );
          expect(await count("select count(*)::text as count from public.bouts")).toBeGreaterThanOrEqual(8);
        },
        role === "authenticated" ? DEMO_PROFILE_ID : undefined,
      );
    }
    // The formula is an internal; only decide_bout() is the public door.
    const grants = await db.query<Record<string, boolean>>(
      `select has_function_privilege('anon', 'public.decide_bout(uuid)', 'EXECUTE') as decide_anon,
              has_function_privilege('authenticated', 'public.decide_bout(uuid)', 'EXECUTE') as decide_auth,
              has_function_privilege('anon', 'public.bout_outcome(public.bouts)', 'EXECUTE') as formula_anon,
              has_function_privilege('authenticated', 'public.bout_outcome(public.bouts)', 'EXECUTE') as formula_auth`,
    );
    expect(grants.rows[0]).toEqual({
      decide_anon: true,
      decide_auth: true,
      formula_anon: false,
      formula_auth: false,
    });
  });

  /* ------------------------------------------------------------ the roster */

  it("enrols exactly the fighters isLeagueFighter knows, and only the owner can enrol", async () => {
    const { rows } = await db.query<{ handle: string }>(
      `select a.handle from public.league_fighters f
         join public.agents a on a.id = f.agent_id order by a.handle`,
    );
    expect(rows.map((row) => row.handle)).toEqual([...FIGHTER_HANDLES].sort());
    for (const row of rows) expect(isLeagueFighter(row.handle)).toBe(true);

    await db.query("begin");
    try {
      // Even the owner cannot enrol a marketplace agent: Scout sells, NightOwl
      // is offline but has a track record.
      for (const handle of ["scout", "nightowl"]) {
        await refused(/is a marketplace agent .* cannot be enrolled as a fictional fighter/, () =>
          db.query("insert into public.league_fighters (agent_id) values ($1)", [agentId(handle)]),
        );
      }
      // Enrolment is never re-pointed or re-dated, and a fighter with bouts
      // cannot be struck off.
      await refused(/enrol-only/, () =>
        db.query("update public.league_fighters set agent_id = $1 where agent_id = $2", [
          agentId("scout"),
          RUSTY,
        ]),
      );
      await refused(/enrol-only/, () =>
        db.query("update public.league_fighters set created_at = now() where agent_id = $1", [RUSTY]),
      );
      await refused(/foreign key/, () =>
        db.query("delete from public.league_fighters where agent_id = $1", [RUSTY]),
      );
    } finally {
      await db.query("rollback");
    }

    // No client, and not the service role, can write the roster at all.
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await as(
        role,
        async () => {
          await refused(/permission denied/, () =>
            db.query("insert into public.league_fighters (agent_id) values ($1)", [agentId("scout")]),
          );
          await refused(/permission denied/, () =>
            db.query("update public.league_fighters set created_at = now()"),
          );
          await refused(/permission denied/, () => db.query("delete from public.league_fighters"));
          expect(await count("select count(*)::text as count from public.league_fighters")).toBe(
            FIGHTER_HANDLES.length,
          );
        },
        role === "authenticated" ? DEMO_PROFILE_ID : undefined,
      );
    }
  });

  it("refuses a bout between real agents — as the owner and as the service role", async () => {
    const SCOUT = agentId("scout");
    const OTTO = agentId("otto");
    const schedule = (a: string, b: string, probe: string) =>
      db.query(
        `insert into public.bouts (channel_id, season, fighter_a, fighter_b, scheduled_at, seed)
         values ($1, 1, $2, $3, now() + interval '1 day', $4)`,
        [FIGHT_CHANNEL_ID, a, b, probe],
      );

    for (const role of ["postgres", "service_role"] as const) {
      await db.query("begin");
      try {
        await db.query(`set local role ${role}`);
        // "Scout vs Otto": neither corner is on the roster.
        await refused(/bouts_fighter_a_fkey/, () => schedule(SCOUT, OTTO, "probe:real-vs-real"));
        // Half a fiction is no fiction: one real corner is refused too.
        await refused(/bouts_fighter_b_fkey/, () => schedule(RUSTY, SCOUT, "probe:half"));
        await refused(/bouts_fighter_a_fkey/, () => schedule(OTTO, VELVET, "probe:other-half"));
        // Nor can an undecided bout be re-pointed at a real agent.
        await refused(/bouts_fighter_a_fkey/, () =>
          db.query("update public.bouts set fighter_a = $1 where id = $2", [SCOUT, boutId(7)]),
        );
        // A result can only name a roster member (and the service role cannot
        // write one at all).
        await refused(role === "postgres" ? /formula/ : /permission denied/, () =>
          db.query(
            `insert into public.bout_results (bout_id, winner_id, method, narrative_seed)
             values ($1, $2, 'knockout', '0000000000000000')`,
            [boutId(7), SCOUT],
          ),
        );
        // The card the service role is there to schedule still schedules.
        await schedule(RUSTY, VELVET, `probe:legit-${role}`);
        expect(
          await count("select count(*)::text as count from public.bouts where seed = $1", [
            `probe:legit-${role}`,
          ]),
        ).toBe(1);
      } finally {
        await db.query("rollback");
      }
    }
    expect(
      await count(
        "select count(*)::text as count from public.bouts where fighter_a = any($1::uuid[]) or fighter_b = any($1::uuid[])",
        [[SCOUT, OTTO]],
      ),
    ).toBe(0);
  });

  /* --------------------------------------------- the ledger's remaining doors */

  it("refuses TRUNCATE of the ledger and of the card, which no row trigger would see", async () => {
    const results = await count("select count(*)::text as count from public.bout_results");
    const bouts = await count("select count(*)::text as count from public.bouts");

    await db.query("begin");
    try {
      await refused(/bout_results is part of the Fight League record and cannot be truncated/, () =>
        db.query("truncate public.bout_results"),
      );
      await refused(/is part of the Fight League record and cannot be truncated/, () =>
        db.query("truncate public.bouts, public.bout_results"),
      );
      await refused(/is part of the Fight League record and cannot be truncated/, () =>
        db.query("truncate public.bouts cascade"),
      );
      // Cascading from the roster reaches both tables, and is refused there.
      await refused(/is part of the Fight League record and cannot be truncated/, () =>
        db.query("truncate public.league_fighters cascade"),
      );
      const triggers = await db.query<{ tgname: string }>(
        `select tgname from pg_trigger
          where tgrelid in ('public.bouts'::regclass, 'public.bout_results'::regclass)
            and tgtype & 32 = 32 order by tgname`,
      );
      expect(triggers.rows.map((row) => row.tgname)).toEqual([
        "bout_results_no_truncate",
        "bouts_no_truncate",
      ]);

      // The service role holds TRUNCATE on `bouts` (it is granted ALL to
      // schedule the card): every spelling of it is refused.
      await db.query("set local role service_role");
      for (const statement of [
        "truncate public.bouts",
        "truncate public.bouts cascade",
        "truncate public.bouts, public.bout_results",
        "truncate public.bout_results",
      ]) {
        await refused(/truncated|permission denied|referenced in a foreign key/, () =>
          db.query(statement),
        );
      }
    } finally {
      await db.query("rollback");
    }
    expect(await count("select count(*)::text as count from public.bout_results")).toBe(results);
    expect(await count("select count(*)::text as count from public.bouts")).toBe(bouts);
  });

  it("refuses a formula-correct result dated after the moment it is recorded", async () => {
    // Bout 7 is due and undecided: its formula outcome is a valid row today…
    const bout = seed.bouts.find((row) => row.id === boutId(7))!;
    const outcome = decideBoutOutcome(bout);
    const record = (decidedAt: string) =>
      db.query(
        `insert into public.bout_results (bout_id, winner_id, method, narrative_seed, decided_at)
         values ($1, $2, $3, $4, ${decidedAt})`,
        [bout.id, outcome.winner_id, outcome.method, outcome.narrative_seed],
      );

    await db.query("begin");
    try {
      // …but not stamped next month, nor a second ahead of the clock. The
      // owner is refused: this is the trigger, not a privilege.
      await refused(/cannot be dated in the future/, () => record("now() + interval '30 days'"));
      await refused(/cannot be dated in the future/, () => record("now() + interval '1 second'"));
      // An upcoming bout's result, future-dated to "after the bout", is the
      // shape the guard exists for: refused, for the future date alone.
      await db.query("update public.bouts set scheduled_at = now() + interval '7 days' where id = $1", [
        bout.id,
      ]);
      await refused(/cannot be dated in the future/, () => record("now() + interval '8 days'"));
      await refused(/before it is fought/, () => record("now()"));
    } finally {
      await db.query("rollback");
    }

    // Stamped now — what decide_bout() writes — it records.
    await db.query("begin");
    try {
      await record("now()");
      expect(
        await count("select count(*)::text as count from public.bout_results where bout_id = $1", [
          bout.id,
        ]),
      ).toBe(1);
    } finally {
      await db.query("rollback");
    }
  });

  it("answers a decided bout from the ledger without taking the bout's row lock", async () => {
    // What this backend holds on `bouts` after a call, inside its transaction.
    const boutLocks = async () =>
      (
        await db.query<{ mode: string }>(
          `select mode from pg_locks
            where pid = pg_backend_pid() and locktype = 'relation'
              and relation = 'public.bouts'::regclass`,
        )
      ).rows.map((row) => row.mode);

    const events = () =>
      count("select count(*)::text as count from public.events where kind = 'bout_result'");
    await as("anon", async () => {
      const before = await events();
      const decided = await db.query("select * from public.decide_bout($1)", [boutId(1)]);
      expect(decided.rows[0].winner_id).toBe(seed.boutResults[0].winner_id);
      // A plain read: ACCESS SHARE, never the ROW SHARE a FOR UPDATE takes,
      // and nothing written.
      expect(await boutLocks()).not.toContain("RowShareLock");
      expect(await events()).toBe(before);
    });
    // The undecided path still locks (the positive control for the probe).
    await as("anon", async () => {
      await db.query("select * from public.decide_bout($1)", [boutId(6)]);
      expect(await boutLocks()).toContain("RowShareLock");
    });

    // And behaviourally: with another transaction holding both bouts' row
    // locks, the decided one answers at once and the undecided one waits.
    const holder = await pool.connect();
    const caller = await pool.connect();
    try {
      await holder.query("begin");
      await holder.query("select id from public.bouts where id = any($1::uuid[]) for update", [
        [boutId(2), boutId(7)],
      ]);

      await caller.query("begin");
      await caller.query("set local role anon");
      await caller.query("set local lock_timeout = '400ms'");
      const repeat = await caller.query("select * from public.decide_bout($1)", [boutId(2)]);
      expect(repeat.rows[0].winner_id).toBe(seed.boutResults[1].winner_id);
      await expect(caller.query("select * from public.decide_bout($1)", [boutId(7)])).rejects.toThrow(
        /lock timeout/,
      );
    } finally {
      await caller.query("rollback").catch(() => undefined);
      await holder.query("rollback").catch(() => undefined);
      caller.release();
      holder.release();
    }
    expect(
      await count("select count(*)::text as count from public.bout_results where bout_id = $1", [boutId(7)]),
    ).toBe(0);
  });

  /* ---------------------------------------- fiction stays out of the marketplace */

  it("refuses any gig, bid or order naming a fighter, whoever writes it", async () => {
    const job = seed.jobs.find((row) => row.status === "open" && row.poster_id !== DEMO_PROFILE_ID)!;
    const buyer = seed.profiles.find((row) => row.id !== DEMO_PROFILE_ID)!.id;
    const gig = (agent: string, slug: string) =>
      db.query(
        `insert into public.gigs (agent_id, slug, title, category)
         values ($1, $2, 'I will box for you', 'entertainment')`,
        [agent, slug],
      );
    const bid = (agent: string) =>
      db.query(
        `insert into public.bids (job_id, agent_id, amount_cents, eta_seconds, note)
         values ($1, $2, 100, 60, 'A fighter bidding')`,
        [job.id, agent],
      );
    const order = (agent: string) =>
      db.query(
        `insert into public.orders (buyer_id, agent_id, brief, amount_cents)
         values ($1, $2, 'Box for me', 100)`,
        [buyer, agent],
      );

    // The demo owner, through RLS — which would let him: he owns both.
    await as(
      "authenticated",
      async () => {
        await refused(/fictional Fight League character.*no gigs row may name it/, () =>
          gig(RUSTY, "rusty-gig-auth"),
        );
        await refused(/fictional Fight League character.*no bids row may name it/, () => bid(VELVET));
      },
      DEMO_PROFILE_ID,
    );
    // The service role and the owner, past RLS entirely.
    for (const role of ["service_role", "postgres"] as const) {
      await db.query("begin");
      try {
        await db.query(`set local role ${role}`);
        await refused(/no gigs row may name it/, () => gig(VELVET, `velvet-gig-${role}`));
        await refused(/no bids row may name it/, () => bid(RUSTY));
        await refused(/no orders row may name it/, () => order(RUSTY));
        // Re-pointing an existing row at a fighter is the same row.
        await refused(/no gigs row may name it/, () =>
          db.query("update public.gigs set agent_id = $1 where id = $2", [RUSTY, seed.gigs[0].id]),
        );
        await refused(/no orders row may name it/, () =>
          db.query("update public.orders set agent_id = $1 where id = $2", [VELVET, seed.orders[0].id]),
        );
        // Everyone else is untouched by the guard.
        await gig(agentId("scout"), `scout-probe-${role}`);
      } finally {
        await db.query("rollback");
      }
    }
    for (const table of ["gigs", "bids", "orders"]) {
      expect(
        await count(`select count(*)::text as count from public.${table} where agent_id = any($1::uuid[])`, [
          [RUSTY, VELVET],
        ]),
        table,
      ).toBe(0);
    }
  });

  it("keeps fighters offline in agents and in presence, whoever writes the status", async () => {
    for (const role of ["authenticated", "service_role", "postgres"] as const) {
      await as(
        role === "postgres" ? "service_role" : role,
        async () => {
          if (role === "postgres") await db.query("set local role postgres");
          for (const status of ["available", "live", "working"]) {
            await refused(/stays offline and never takes work/, () =>
              db.query(`update public.agents set status = $1 where id = $2`, [status, RUSTY]),
            );
            await refused(/stays offline and never takes work/, () =>
              db.query(`update public.presence set status = $1 where agent_id = $2`, [status, VELVET]),
            );
          }
          // Offline is what they are, so writing it passes.
          await db.query("update public.agents set status = 'offline' where id = $1", [RUSTY]);
          // A real agent's owner still flips presence freely.
          await db.query("update public.agents set status = 'available' where id = $1", [agentId("scout")]);
        },
        role === "authenticated" ? DEMO_PROFILE_ID : undefined,
      );
    }
    // A fresh presence row for a fighter cannot be seated online either.
    await db.query("begin");
    try {
      await db.query("delete from public.presence where agent_id = $1", [RUSTY]);
      await refused(/stays offline/, () =>
        db.query(
          `insert into public.presence (agent_id, room_slug, status) values ($1, 'creator-loft', 'available')`,
          [RUSTY],
        ),
      );
      await db.query(
        `insert into public.presence (agent_id, room_slug, status) values ($1, 'creator-loft', 'offline')`,
        [RUSTY],
      );
    } finally {
      await db.query("rollback");
    }
    const statuses = await db.query<{ agent: string; seat: string }>(
      `select a.status::text as agent, p.status::text as seat
         from public.agents a join public.presence p on p.agent_id = a.id
        where a.id = any($1::uuid[])`,
      [[RUSTY, VELVET]],
    );
    expect(statuses.rows).toEqual([
      { agent: "offline", seat: "offline" },
      { agent: "offline", seat: "offline" },
    ]);
  });

  it("leaves the fighters out of hire discovery through the real Supabase adapter", async () => {
    // `listAgents({ excludeLeagueFighters })` as anon over PostgREST: the SQL
    // path (`not.in`, before the range) and the search_agents RPC path.
    const everyone = await supabase.listAgents({ limit: 200, sort: "newest" });
    expect(everyone.map((agent) => agent.handle)).toEqual(expect.arrayContaining([...FIGHTER_HANDLES]));

    for (const sort of ["trending", "rating", "price", "newest"] as AgentSort[]) {
      const listed = await supabase.listAgents({ sort, limit: 200, excludeLeagueFighters: true });
      expect(listed.filter((agent) => isLeagueFighter(agent)), sort).toEqual([]);
      expect(listed, sort).toHaveLength(everyone.length - FIGHTER_HANDLES.length);
      const page = await supabase.listAgents({ sort, limit: 5, excludeLeagueFighters: true });
      expect(page, sort).toHaveLength(5);
      expect(page.filter((agent) => isLeagueFighter(agent)), sort).toEqual([]);
    }
    const searched = await supabase.listAgents({ q: "fictional robot boxer", excludeLeagueFighters: true });
    expect(searched.filter((agent) => isLeagueFighter(agent))).toEqual([]);
    const unfiltered = await supabase.listAgents({ q: "fictional robot boxer" });
    expect(unfiltered.map((agent) => agent.handle)).toEqual(expect.arrayContaining([...FIGHTER_HANDLES]));

    // Existence is untouched: the Passport still resolves.
    expect((await supabase.getAgentByHandle("rusty-knuckles"))!.handle).toBe("rusty-knuckles");
  });

  /* ------------------------------------------------------ integrity fixes */

  it("refuses every direct client write to events, and keeps the app's own path open", async () => {
    const scout = agentId("scout");
    await as(
      "authenticated",
      async () => {
        const insert = (actorType: string, actorId: string | null, kind = "available") =>
          db.query(
            `insert into public.events (kind, actor_type, actor_id, actor_name, headline, body)
             values ($1::public.event_kind, $2::public.author_type, $3, 'Probe', 'Probe', 'Probe')`,
            [kind, actorType, actorId],
          );
        // The hole: a District-bylined row from any signed-in session.
        await refused(/permission denied/, () => insert("system", null));
        // An agent the caller does not own, and — since nothing in the app
        // inserts directly — even the caller's own identities.
        await refused(/permission denied/, () => insert("agent", agentId("deepresearch")));
        await refused(/permission denied/, () => insert("agent", scout));
        await refused(/permission denied/, () => insert("human", DEMO_PROFILE_ID));
        await refused(/permission denied/, () => insert("system", null, "bout_result"));
        await refused(/permission denied/, () =>
          db.query("update public.events set headline = 'Rewritten'"),
        );
        await refused(/permission denied/, () => db.query("delete from public.events"));

        // What the app does — `publishEvent()` → `publish_event()` — still works,
        // for the agent the caller owns and for the caller themself…
        const agentEvent = await db.query<{ actor_id: string }>(
          `select actor_id from public.publish_event('available', 'agent', $1, 'Scout',
             'Capacity open', 'Two slots this hour.', 'Hire', '/agents/scout')`,
          [scout],
        );
        expect(agentEvent.rows[0].actor_id).toBe(scout);
        const post = await db.query<{ kind: string }>(
          `select kind::text from public.publish_event('post', 'human', $1, 'Austin',
             'Hello District', '', null, null)`,
          [DEMO_PROFILE_ID],
        );
        expect(post.rows[0].kind).toBe("post");

        // …but never as the District, and never as the league.
        await refused(/system events/, () =>
          db.query(
            `select public.publish_event('live', 'system', null, 'AgentDistrict', 'Hi', 'Hi')`,
          ),
        );
        await refused(/recorded by decide_bout/, () =>
          db.query(
            `select public.publish_event('bout_result', 'human', $1, 'Austin',
               'Fight League (fiction): Rusty Knuckles def. Velvet Voltage by knockout', 'Forged')`,
            [DEMO_PROFILE_ID],
          ),
        );
      },
      DEMO_PROFILE_ID,
    );

    // The anon door the app also walks through writes its event as before.
    await as("anon", async () => {
      const agent = await db.query<{ id: string }>(
        `select id from public.register_agent(
           p_handle => 'league-probe', p_name => 'Probe', p_tagline => 'Event path probe.',
           p_description => '', p_avatar_emoji => '🤖',
           p_avatar_gradient => 'linear-gradient(135deg,#297dff,#7559ff)',
           p_category => 'research', p_skills => array['probing']::text[],
           p_regions => array['US']::text[], p_room_slug => 'research-pit',
           p_pricing_model => 'per_run', p_starting_price_cents => 0,
           p_endpoints => '{}'::jsonb, p_mcp_tools => '{}'::text[],
           p_key_hash => $1, p_key_prefix => 'ad_live_lgue',
           p_scopes => array['agents:read']::text[], p_token_hash => $2
         )`,
        [`sha256$${"7".repeat(64)}`, "8".repeat(64)],
      );
      expect(
        await count(
          "select count(*)::text as count from public.events where kind = 'discovered' and actor_id = $1",
          [agent.rows[0].id],
        ),
      ).toBe(1);
    });
  });

  it("stops an entrant rewriting their own race score, and keeps the scores readable", async () => {
    // Austin owns Scout (in the live Research Race) and QuickPDF (the winner
    // of the finished Permit Pull Classic) — the exact self-scoring shape.
    const live = seed.competitions.find((row) => row.status === "live")!;
    const finished = seed.competitions.find((row) => row.status === "finished")!;
    const quickpdf = agentId("quickpdf");
    const scout = agentId("scout");
    expect(seed.agents.find((agent) => agent.id === quickpdf)!.owner_id).toBe(DEMO_PROFILE_ID);

    await as(
      "authenticated",
      async () => {
        await refused(/permission denied/, () =>
          db.query(
            `update public.competition_entries set progress = 100, accuracy = 1
              where competition_id = $1 and agent_id = $2`,
            [finished.id, quickpdf],
          ),
        );
        await refused(/permission denied/, () =>
          db.query(
            `update public.competition_entries set progress = 100
              where competition_id = $1 and agent_id = $2`,
            [live.id, scout],
          ),
        );
        await refused(/permission denied/, () =>
          db.query(
            `insert into public.competition_entries (competition_id, agent_id, progress, accuracy)
             values ($1, $2, 100, 1)`,
            [live.id, agentId("roofintel")],
          ),
        );
        await refused(/permission denied/, () =>
          db.query("delete from public.competition_entries where agent_id = $1", [scout]),
        );
        expect(
          await count("select count(*)::text as count from public.competition_entries"),
        ).toBe(seedCounts.competitionEntries);
      },
      DEMO_PROFILE_ID,
    );

    // What the app does with entries is read them: as anon, through the adapter.
    const races = await supabase.listCompetitions();
    const winner = races
      .find((race) => race.id === finished.id)!
      .entries.find((entry) => entry.agent_id === quickpdf)!;
    const seeded = seed.competitionEntries.find(
      (entry) => entry.competition_id === finished.id && entry.agent_id === quickpdf,
    )!;
    expect([winner.progress, winner.accuracy]).toEqual([seeded.progress, seeded.accuracy]);
    expect(races.reduce((total, race) => total + race.entries.length, 0)).toBe(
      seedCounts.competitionEntries,
    );
  });

  /* -------------------------------------------- the two adapters, one result */

  it("decides the season identically through the Supabase adapter and the demo adapter", async () => {
    const before = await db.query<{ status: string }>(
      "select status from public.bouts where channel_id = $1 and status = 'scheduled'",
      [FIGHT_CHANNEL_ID],
    );
    // Every seeded bout is in the past on the real clock; earlier tests
    // rolled theirs back, so six of the eight are still waiting.
    expect(before.rows).toHaveLength(6);
    reputationBefore = await reputationSnapshot();

    const demo = createDemoRepository({ now: () => Date.now() });

    // Before deciding: the same card, read-only on both sides.
    const project = async (repo: Repository) =>
      (await repo.listBouts({ channelId: FIGHT_CHANNEL_ID, season: 1 })).map((bout) => ({
        id: bout.id,
        fighters: [bout.fighterA.handle, bout.fighterB.handle],
        result: bout.result
          ? [bout.result.winner_id, bout.result.method, bout.result.narrative_seed]
          : null,
      }));
    expect(await project(supabase)).toEqual(await project(demo));

    // Advance on read, on both. The real adapter calls decide_bout() as anon.
    const [live, local] = [
      await supabase.decideDueBouts(FIGHT_CHANNEL_ID),
      await demo.decideDueBouts(FIGHT_CHANNEL_ID),
    ];
    expect(live.map((row) => row.bout_id)).toEqual(local.map((row) => row.bout_id));
    expect(live).toHaveLength(6);
    expect(live.map(outcomeOf)).toEqual(local.map(outcomeOf));
    for (const result of live) {
      expect(outcomeOf(result)).toEqual({
        bout_id: result.bout_id,
        ...decideBoutOutcome(seed.bouts.find((bout) => bout.id === result.bout_id)!),
      });
    }
    // Done once: the second read decides nothing on either side.
    expect(await supabase.decideDueBouts(FIGHT_CHANNEL_ID)).toEqual([]);
    expect(await demo.decideDueBouts(FIGHT_CHANNEL_ID)).toEqual([]);

    expect(await project(supabase)).toEqual(await project(demo));
    const single = await supabase.getBout(boutId(8));
    expect(single!.result!.winner_id).toBe((await demo.getBout(boutId(8)))!.result!.winner_id);

    const standings = async (repo: Repository) =>
      (await repo.leagueStandings({ channelId: FIGHT_CHANNEL_ID, season: 1 })).map((row) => [
        row.fighter.handle,
        row.wins,
        row.losses,
      ]);
    expect(await standings(supabase)).toEqual(await standings(demo));
    expect(await standings(supabase)).toEqual([
      ["rusty-knuckles", 5, 3],
      ["velvet-voltage", 3, 5],
    ]);

    // The feed rows the two adapters wrote say the same thing. (The
    // concurrency probe above fought on another channel; its row is not
    // Bot Brawl's.)
    const copy = async (repo: Repository) =>
      (await repo.listEvents({ kind: "bout_result", limit: 50 }))
        .filter((event) => event.cta_href === "/tv/bot-brawl")
        .map((event) => [event.headline, event.body, event.cta_label, event.actor_type, event.actor_name])
        .sort();
    const liveCopy = await copy(supabase);
    expect(liveCopy).toEqual(await copy(demo));
    expect(liveCopy).toHaveLength(8);
  });

  it("moved no marketplace number while it decided the season", async () => {
    // The previous test decided six bouts for real, through the adapter, as
    // anon. Every reputation-bearing value is byte-for-byte what it was.
    expect(reputationBefore).toBeDefined();
    expect(await reputationSnapshot()).toEqual(reputationBefore);
    expect(
      await count("select count(*)::text as count from public.reviews where agent_id = any($1::uuid[])", [
        [RUSTY, VELVET],
      ]),
    ).toBe(0);
    const fighters = await db.query<{ rating_count: number; jobs_completed: number }>(
      "select rating_count, jobs_completed from public.agents where id = any($1::uuid[])",
      [[RUSTY, VELVET]],
    );
    expect(fighters.rows).toEqual([
      { rating_count: 0, jobs_completed: 0 },
      { rating_count: 0, jobs_completed: 0 },
    ]);
  });

  it("takes the seed again after the season is decided, and changes no result", async () => {
    const results = await db.query("select * from public.bout_results order by bout_id");
    const events = await count("select count(*)::text as count from public.events where kind = 'bout_result'");

    await apply(await readFile(SEED_FILE, "utf8"), "seed.sql (after the season)");

    expect((await db.query("select * from public.bout_results order by bout_id")).rows).toEqual(results.rows);
    expect(
      await count(
        "select count(*)::text as count from public.bouts where channel_id = $1 and status = 'decided'",
        [FIGHT_CHANNEL_ID],
      ),
    ).toBe(8);
    expect(
      await count("select count(*)::text as count from public.events where kind = 'bout_result'"),
    ).toBe(events);
  });
});
