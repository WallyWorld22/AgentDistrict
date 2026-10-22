import { randomBytes } from "node:crypto";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoRepository } from "@/lib/data/demo";
import { relatedChannels } from "@/lib/data/ext/lounge";
import { SupabaseRepository } from "@/lib/data/supabase";
import type { Repository } from "@/lib/data/repository";
import { SEED_EPOCH_MS, seed } from "@/lib/seed";
import { loadDistrict } from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * District TV's channel pages through the REAL Supabase adapter, on the real
 * seed.
 *
 * Every `/tv/<slug>` in production returned a 500: Research Race carries two
 * `competitions` rows (a live race and a finished one), `getChannelBySlug` read
 * the channel's race with a bare `.maybeSingle()`, and PostgREST refuses that
 * for more than one row ("JSON object requested, multiple (or no) rows
 * returned"). Research Race sits in every other channel's "More like this" row,
 * and the page fetched each tile's detail, so every channel page failed with
 * it. The demo adapter used `.find()`, which takes the first match, and the
 * unit and e2e suites run on the demo adapter — nothing ran the Supabase path
 * against the seed.
 *
 * This suite does. It builds a database of its own on the `LOCAL_PG_URL`
 * server (so it never races `schema.test.ts`, which rebuilds its schema in
 * place), loads the migrations and seed, and serves the adapter's PostgREST
 * requests from it as `anon` (`./support/postgrest`).
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const RESEARCH_RACE = "research-race";

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
let supabase: Repository;
let demo: Repository;

/** The pick `ChannelDetail.competition` defines, straight from SQL. */
async function expectedRaceId(channelId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `select id from public.competitions where channel_id = $1
      order by ends_at desc, id asc limit 1`,
    [channelId],
  );
  return rows[0]?.id ?? null;
}

const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

suite("District TV channel pages on the Supabase adapter", () => {
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
    database = `agentdistrict_tv_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);

    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();
    await loadDistrict(db);

    pool = new Pool({ connectionString: url.href, max: 4 });
    const client = createPostgrestClient(pool);
    supabase = new SupabaseRepository(async () => client);
    demo = createDemoRepository({ now: () => SEED_EPOCH_MS });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await db?.end();
    if (database) await admin?.query(`drop database if exists ${database} with (force)`);
    await admin?.end();
  });

  it("opens Research Race, which runs two races, on the defined pick", async () => {
    const { rows } = await db.query<{ count: string }>(
      `select count(*)::text as count from public.competitions c
         join public.channels ch on ch.id = c.channel_id
        where ch.slug = $1`,
      [RESEARCH_RACE],
    );
    // The shape production broke on. If the seed stops carrying it, this test
    // stops guarding anything — fail loudly rather than pass quietly.
    expect(Number(rows[0].count)).toBeGreaterThanOrEqual(2);

    const channel = await supabase.getChannelBySlug(RESEARCH_RACE);
    expect(channel).not.toBeNull();
    expect(channel!.hosts.length).toBeGreaterThan(0);
    expect(channel!.chat.length).toBeGreaterThan(0);
    expect(channel!.competition?.id).toBe(await expectedRaceId(channel!.id));
    // Latest `ends_at` is the live race, not the finished Permit Pull Classic.
    expect(channel!.competition?.title).toBe("LIVE: The Research Race");
    expect(channel!.competition?.status).toBe("live");

    // The page draws the race panel from `listCompetitions()`; it must find it.
    const races = await supabase.listCompetitions();
    const race = races.find((entry) => entry.id === channel!.competition?.id);
    expect(race?.entries.length).toBeGreaterThan(0);
  });

  it("opens a channel whose related row includes Research Race, and every tile's page", async () => {
    const channel = await supabase.getChannelBySlug("build-battle");
    expect(channel).not.toBeNull();
    expect(channel!.competition?.id).toBe(await expectedRaceId(channel!.id));

    // The page's own selection, on the page's own `listChannels()` call.
    const related = relatedChannels(channel!, await supabase.listChannels({ limit: 40 }));
    expect(related.map((entry) => entry.slug)).toContain(RESEARCH_RACE);

    for (const tile of related) {
      // Each tile links to `/tv/<slug>`, which must load — and the hosts the
      // tile draws from `listChannels()` are the ones that page shows.
      const detail = await supabase.getChannelBySlug(tile.slug);
      expect(detail, tile.slug).not.toBeNull();
      expect(ids(tile.hosts), tile.slug).toEqual(ids(detail!.hosts));
    }
  });

  it("opens every seeded channel, and both adapters pick the same race", async () => {
    expect(seed.channels.length).toBeGreaterThanOrEqual(8);
    for (const { slug } of seed.channels) {
      const [live, local] = await Promise.all([
        supabase.getChannelBySlug(slug),
        demo.getChannelBySlug(slug),
      ]);
      expect(live, slug).not.toBeNull();
      expect(live!.competition?.id ?? null, slug).toBe(await expectedRaceId(live!.id));
      expect(local!.competition?.id ?? null, slug).toBe(live!.competition?.id ?? null);
      expect(ids(local!.hosts), slug).toEqual(ids(live!.hosts));
    }
  });
});
