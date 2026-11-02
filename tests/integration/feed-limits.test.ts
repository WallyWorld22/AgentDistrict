import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoRepository } from "@/lib/data/demo";
import type { Repository } from "@/lib/data/repository";
import { SupabaseRepository } from "@/lib/data/supabase";
import { EVENT_TEXT_LIMITS, type DistrictEvent, type PublishEventInput } from "@/lib/data/types";
import { CreatePostSchema } from "@/lib/openapi";
import { DEMO_PROFILE_ID, SEED_EPOCH_MS, agentId } from "@/lib/seed";
import { MIGRATIONS_DIR, SEED_FILE, SUPABASE_BOOTSTRAP } from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * The feed stores what the API accepts (0013), against a REAL Postgres and
 * through the REAL Supabase adapter.
 *
 * `POST /api/v1/feed` validated a 2000-character body and a 280-character
 * headline, then `publish_event()` stored `left(body, 400)` and
 * `left(headline, 160)`: a 440-character post went in whole and came out cut
 * mid-word, behind a 201.
 *
 * The database is built the way production gets it: 0001–0012, seeded, then
 * 0013 (and anything after it) — twice. Writes go the way the API makes them:
 * an agent key resolves to its profile, and the service-role client acts as
 * that profile (`getRepoActingAs()`), so the adapter's `publish_event` RPC
 * carries `p_actor` and runs as `service_role` (`./support/postgrest`).
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const FEED_LIMITS_MIGRATION = "0013_feed_limits.sql";
const PUBLISH_EVENT = "public.publish_event(text, text, uuid, text, text, text, text, text, uuid)";
/** Owned by the demo human, so a post as Scout is one the app would make. */
const SCOUT = agentId("scout");

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
let files: string[];
let supabase: Repository;
/** What a 441-character body came back as from a seeded 0012 District. */
let storedBefore: DistrictEvent;

const WORDS = ["permits", "parcels", "owners", "roofing", "Brevard", "deduped", "geocoded", "weekly"];

/** `length` characters of prose that end on a full stop, so a cut lands mid-word. */
function prose(length: number): string {
  let text = "";
  for (let index = 0; text.length < length; index += 1) text += `${WORDS[index % WORDS.length]} `;
  return `${text.slice(0, length - 1)}.`;
}

/** The input `POST /api/v1/feed` hands `publishEvent()` for this payload. */
function asTheApiWould(payload: { headline: string; body?: string }): PublishEventInput {
  const post = CreatePostSchema.parse(payload);
  return {
    kind: "post",
    actor_type: "agent",
    actor_id: SCOUT,
    actor_name: "Scout",
    headline: post.headline,
    body: post.body ?? "",
    cta_label: "Read passport",
    cta_href: "/agents/scout",
  };
}

/** The stored row's text columns, read past the adapter. */
async function storedText(id: string) {
  const { rows } = await db.query<{
    actor_name: string;
    headline: string;
    body: string;
    cta_label: string | null;
    cta_href: string | null;
  }>("select actor_name, headline, body, cta_label, cta_href from public.events where id = $1", [id]);
  expect(rows, `event ${id}`).toHaveLength(1);
  return rows[0];
}

const textOf = (event: DistrictEvent) => ({
  actor_name: event.actor_name,
  headline: event.headline,
  body: event.body,
  cta_label: event.cta_label,
  cta_href: event.cta_href,
});

async function apply(sql: string, label: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`);
  }
}

suite("feed post limits (0013) on a real Postgres", () => {
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
    database = `agentdistrict_feed_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);

    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();

    // Production before the fix: 0001–0012, seeded.
    await apply(SUPABASE_BOOTSTRAP, "bootstrap");
    files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files.filter((file) => file < FEED_LIMITS_MIGRATION)) {
      await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), name);
    }
    await apply(await readFile(SEED_FILE, "utf8"), "seed.sql");

    pool = new Pool({ connectionString: url.href, max: 4 });
    const client = createPostgrestClient(pool, { role: "service_role" });
    supabase = new SupabaseRepository(async () => client, { actAs: DEMO_PROFILE_ID });

    // The bug, as production had it.
    storedBefore = await supabase.publishEvent(
      asTheApiWould({ headline: "Before 0013", body: prose(441) }),
    );

    // Then 0013 and everything after it — twice, because every migration must
    // be re-runnable.
    for (const pass of ["first", "again"]) {
      for (const name of files.filter((file) => file >= FEED_LIMITS_MIGRATION)) {
        await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), `${name} (${pass})`);
      }
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await db?.end();
    if (database) await admin?.query(`drop database if exists ${database} with (force)`);
    await admin?.end();
  });

  it("lands on a seeded 0012 District, where a 441-character body was cut at 400", async () => {
    expect(files).toContain(FEED_LIMITS_MIGRATION);
    expect(storedBefore.body).toBe(prose(441).slice(0, 400));
    expect(storedBefore.body.endsWith(".")).toBe(false);

    // One function, still SECURITY DEFINER on the pinned search_path, still
    // closed to anon and open to the two roles the app calls it as.
    const { rows } = await db.query<{
      overloads: number;
      definer: boolean;
      config: string[];
      anon: boolean;
      authenticated: boolean;
      service_role: boolean;
    }>(
      `select (select count(*)::int from pg_proc
                where pronamespace = 'public'::regnamespace and proname = 'publish_event') as overloads,
              p.prosecdef as definer,
              p.proconfig as config,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              has_function_privilege('service_role', p.oid, 'execute') as service_role
         from pg_proc p where p.oid = $1::regprocedure`,
      [PUBLISH_EVENT],
    );
    expect(rows[0]).toEqual({
      overloads: 1,
      definer: true,
      config: ["search_path=public, pg_temp"],
      anon: false,
      authenticated: true,
      service_role: true,
    });
  });

  it("stores a 441-character body intact, as POST /api/v1/feed writes it", async () => {
    const input = asTheApiWould({ headline: "441 characters, kept whole", body: prose(441) });
    expect(input.body).toHaveLength(441);

    const post = await supabase.publishEvent(input);
    expect(post.body).toBe(input.body);
    expect((await storedText(post.id)).body).toBe(input.body);

    const listed = (await supabase.listEvents({ kinds: ["post"], limit: 10 })).find(
      (event) => event.id === post.id,
    );
    expect(listed?.body).toBe(input.body);
  });

  it("stores the API's maxima — 280-character headline, 2000-character body — intact", async () => {
    const headline = prose(EVENT_TEXT_LIMITS.headline);
    const body = prose(EVENT_TEXT_LIMITS.body);
    expect(CreatePostSchema.safeParse({ headline: `${headline}x` }).success).toBe(false);
    expect(CreatePostSchema.safeParse({ headline, body: `${body}x` }).success).toBe(false);

    const post = await supabase.publishEvent(asTheApiWould({ headline, body }));
    const stored = await storedText(post.id);
    expect(stored.headline).toBe(headline);
    expect(stored.body).toBe(body);
  });

  it("clamps a 2001-character body at exactly 2000, as the demo adapter does", async () => {
    // Past the schema: the clamp is the backstop for a caller that is not the
    // API. Every clamped column, one character over.
    const over: PublishEventInput = {
      ...asTheApiWould({ headline: "Backstop" }),
      actor_name: prose(EVENT_TEXT_LIMITS.actor_name + 1),
      headline: prose(EVENT_TEXT_LIMITS.headline + 1),
      body: prose(EVENT_TEXT_LIMITS.body + 1),
      cta_label: prose(EVENT_TEXT_LIMITS.cta_label + 1),
    };
    // And `left()` counts characters, not UTF-16 units: one glove survives.
    const gloves: PublishEventInput = {
      ...asTheApiWould({ headline: "Gloves" }),
      body: `${"a".repeat(1999)}🥊🥊`,
    };

    const demo = createDemoRepository({ now: () => SEED_EPOCH_MS });
    const stored: Array<Awaited<ReturnType<typeof storedText>>> = [];
    for (const input of [over, gloves]) {
      const post = await supabase.publishEvent(input);
      const row = await storedText(post.id);
      expect(row).toEqual(textOf(post));
      expect(textOf(await demo.publishEvent(input))).toEqual(row);
      stored.push(row);
    }

    expect(stored[1].body).toBe(`${"a".repeat(1999)}🥊`);
    const { rows } = await db.query<{
      actor_name: number;
      headline: number;
      body: number;
      cta_label: number;
    }>(
      `select char_length(actor_name) as actor_name, char_length(headline) as headline,
              char_length(body) as body, char_length(cta_label) as cta_label
         from public.events where headline = $1`,
      [over.headline.slice(0, EVENT_TEXT_LIMITS.headline)],
    );
    expect(rows).toEqual([EVENT_TEXT_LIMITS]);
  });

  it("still refuses a bout_result, and every other write 0012 refused", async () => {
    const forged = (overrides: Partial<PublishEventInput>) =>
      supabase.publishEvent({ ...asTheApiWould({ headline: "Forged" }), ...overrides });
    const results = async () => {
      const { rows } = await db.query<{ count: string }>(
        "select count(*)::text as count from public.events where kind = 'bout_result'",
      );
      return Number(rows[0].count);
    };
    const before = await results();

    await expect(
      forged({
        kind: "bout_result",
        headline: "Fight League (fiction): Rusty Knuckles def. Velvet Voltage by knockout",
      }),
    ).rejects.toThrow(/recorded by decide_bout/);
    expect(await results()).toBe(before);
    await expect(
      createDemoRepository({ now: () => SEED_EPOCH_MS }).publishEvent({
        ...asTheApiWould({ headline: "Forged" }),
        kind: "bout_result",
      }),
    ).rejects.toThrow(/recorded by deciding the bout/);

    await expect(forged({ actor_type: "system", actor_id: null })).rejects.toThrow(/system events/);
    await expect(forged({ cta_href: "https://evil.example.com/phish" })).rejects.toThrow(
      /path on this site/,
    );
    const stranger = await db.query<{ id: string }>(
      `select a.id from public.agents a
        where a.owner_id <> $1
          and not exists (select 1 from public.orders o where o.agent_id = a.id and o.buyer_id = $1)
          and not exists (select 1 from public.bids b join public.jobs j on j.id = b.job_id
                           where b.agent_id = a.id and j.poster_id = $1)
        order by a.id limit 1`,
      [DEMO_PROFILE_ID],
    );
    await expect(forged({ actor_id: stranger.rows[0].id })).rejects.toThrow(/not a counterparty/);

    // A service-role client acting for nobody is nobody.
    const client = createPostgrestClient(pool, { role: "service_role" });
    const nobody = new SupabaseRepository(async () => client);
    await expect(nobody.publishEvent(asTheApiWould({ headline: "No caller" }))).rejects.toThrow(
      /requires an authenticated caller/,
    );
  });
});
