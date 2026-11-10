import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseRepository } from "@/lib/data/supabase";
import { DEMO_PROFILE_ID, seed } from "@/lib/seed";
import { MIGRATIONS_DIR, SEED_FILE, SUPABASE_BOOTSTRAP } from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * 0017 (owner decision 1, site audit brand-07) on a REAL Postgres, read back
 * through the REAL Supabase adapter.
 *
 * The seed's fictional store and founder were renamed so a real "Built by
 * Wally Works" credit can never be read as vouching for invented numbers.
 * Production holds the old text, so the database is built the way production
 * got it: 0001-0016, seeded, the renamed rows put back to the text production
 * holds, then 0017 (and anything after it) — twice.
 *
 * The real resident agents and anything a person wrote must come through
 * untouched, even where their text names the old store.
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const RENAME_MIGRATION = "0017_harborline_rename.sql";
const STORE_ID = "eb4ead9c-bac9-51e7-be76-c756904dc888";
const JOB_ID = "40ed5bfe-805e-5a75-b74e-77237e8e67d6";
const THREAD_ID = "69234ce4-006b-512a-aeb5-aac98e60b098";
const OLD_BRIEFS: Array<[id: string, brief: string]> = [
  [
    "7278a1fc-137e-543e-986c-0fd9eba3c07c",
    "Thirty days of posts for WallyWorks Labs. Audience is home-services owners in Florida who already use one piece of software and hate it.",
  ],
  [
    "5e1d6e21-20b4-5f6a-a16d-ce8149359811",
    "Six WallyWorks location pages: new copy, refreshed schema, mobile pass. Same URLs, no redirects.",
  ],
  [
    "32d1d454-b65b-524c-bca1-76b11c30c0d5",
    "Smoke pass on the new WallyWorks quote flow at 390px and 1440px.",
  ],
];
/** The production residents: registered, not seeded. 0017 must not touch them. */
const RESIDENTS = ["naif-gravity", "district-desk", "proyectoayuda-data-api", "vault-keeper"];

const SEEDED_MESSAGE_IDS = seed.messages
  .filter((row) => row.sender_id === DEMO_PROFILE_ID)
  .map((row) => row.id);
const SEEDED_EVENT_IDS = seed.events
  .filter((row) => row.actor_id === DEMO_PROFILE_ID)
  .map((row) => row.id);

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
let files: string[];
let asDemo: SupabaseRepository;
let residentsBefore: string[] = [];
let otherThreadId = "";
let laterMessageId = "";

async function apply(sql: string, label: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`);
  }
}

async function residents(): Promise<string[]> {
  const { rows } = await db.query<{ row: string }>(
    "select to_jsonb(a)::text as row from public.agents a where handle = any($1) order by handle",
    [RESIDENTS],
  );
  return rows.map((row) => row.row);
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ n: string }>(sql, params);
  return Number(rows[0].n);
}

suite("0017 renames the fictional demo store on a real Postgres", () => {
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
    database = `agentdistrict_harborline_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);

    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();

    await apply(SUPABASE_BOOTSTRAP, "bootstrap");
    files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files.filter((file) => file < RENAME_MIGRATION)) {
      await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), name);
    }
    await apply(await readFile(SEED_FILE, "utf8"), "seed.sql");

    // Production was seeded with the old names: put those rows back.
    await db.query(
      `update public.profiles
          set display_name = 'Austin',
              bio = 'Human founder • WallyWorks Labs. Building the place for agents.'
        where id = $1`,
      [DEMO_PROFILE_ID],
    );
    await db.query(
      `update public.stores
          set slug = 'wallyworks-labs', name = 'WallyWorks Labs',
              tagline = 'Local-business intelligence agents, built on the Treasure Coast.'
        where id = $1`,
      [STORE_ID],
    );
    await db.query("update public.jobs set title = 'Refresh 6 WallyWorks location pages' where id = $1", [
      JOB_ID,
    ]);
    await db.query("update public.threads set subject = 'WallyWorks location page refresh' where id = $1", [
      THREAD_ID,
    ]);
    for (const [id, brief] of OLD_BRIEFS) {
      await db.query("update public.orders set brief = $2 where id = $1", [id, brief]);
    }
    await db.query("update public.messages set sender_name = 'Austin' where id = any($1::uuid[])", [
      SEEDED_MESSAGE_IDS,
    ]);
    await db.query("update public.events set actor_name = 'Austin' where id = any($1::uuid[])", [
      SEEDED_EVENT_IDS,
    ]);

    // The residents production holds, registered through the front door. One
    // of them mentions the old store in its own words.
    for (const [index, handle] of RESIDENTS.entries()) {
      await db.query(
        `select id from public.register_agent(
           p_handle => $1, p_name => $2, p_tagline => 'A real resident.',
           p_description => $3, p_avatar_emoji => '🤖',
           p_avatar_gradient => 'linear-gradient(135deg,#297dff,#7559ff)',
           p_category => 'research', p_skills => array['probing']::text[],
           p_regions => array['US']::text[], p_room_slug => 'research-pit',
           p_pricing_model => 'per_run', p_starting_price_cents => 0,
           p_endpoints => '{}'::jsonb, p_mcp_tools => '{}'::text[],
           p_key_hash => $4, p_key_prefix => $5,
           p_scopes => array['agents:read']::text[], p_token_hash => $6
         )`,
        [
          handle,
          `Resident ${index}`,
          index === 0 ? "Compared notes with WallyWorks Labs once." : "",
          `sha256$${String(index).repeat(64)}`,
          `ad_live_res${index}`,
          String(index + 1).repeat(64),
        ],
      );
    }
    residentsBefore = await residents();

    // Rows a person wrote with the old text: someone else's thread, and a
    // message the demo human typed after seeding (its name was a snapshot).
    const other = await db.query<{ id: string }>(
      `insert into public.threads (profile_id, subject)
       select id, 'WallyWorks location page refresh' from public.profiles
        where handle = 'buildwithjess' returning id`,
    );
    otherThreadId = other.rows[0].id;
    const later = await db.query<{ id: string }>(
      `insert into public.messages (thread_id, sender_type, sender_id, sender_name, body)
       values ($1, 'human', $2, 'Austin', 'Typed later.') returning id`,
      [THREAD_ID, DEMO_PROFILE_ID],
    );
    laterMessageId = later.rows[0].id;

    for (const pass of ["first", "again"]) {
      for (const name of files.filter((file) => file >= RENAME_MIGRATION)) {
        await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), `${name} (${pass})`);
      }
    }

    pool = new Pool({ connectionString: url.href, max: 4 });
    const serviceClient = createPostgrestClient(pool, { role: "service_role" });
    asDemo = new SupabaseRepository(async () => serviceClient, {
      actAs: DEMO_PROFILE_ID,
      serviceClient: async () => serviceClient,
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await db?.end();
    if (database) await admin?.query(`drop database if exists ${database} with (force)`);
    await admin?.end();
  });

  it("ran on a District holding production's old names", () => {
    expect(files).toContain(RENAME_MIGRATION);
    expect(SEEDED_MESSAGE_IDS).toHaveLength(11);
    expect(SEEDED_EVENT_IDS).toHaveLength(2);
    expect(residentsBefore).toHaveLength(RESIDENTS.length);
  });

  it("renames the store, keeping its id, exactly as the seed now writes it", async () => {
    const { rows } = await db.query("select id, slug, name, tagline from public.stores where id = $1", [
      STORE_ID,
    ]);
    const seeded = seed.stores.find((row) => row.id === STORE_ID)!;
    expect(rows).toEqual([
      { id: STORE_ID, slug: seeded.slug, name: seeded.name, tagline: seeded.tagline },
    ]);
    expect(seeded.slug).toBe("harborline-labs");
  });

  it("renames the demo human and every seeded row that named the old store", async () => {
    const profile = await db.query("select handle, display_name, bio from public.profiles where id = $1", [
      DEMO_PROFILE_ID,
    ]);
    const seededProfile = seed.profiles.find((row) => row.id === DEMO_PROFILE_ID)!;
    expect(profile.rows).toEqual([
      { handle: "austin", display_name: "Demo Founder", bio: seededProfile.bio },
    ]);

    const job = await db.query<{ title: string }>("select title from public.jobs where id = $1", [JOB_ID]);
    expect(job.rows[0].title).toBe(seed.jobs.find((row) => row.id === JOB_ID)!.title);
    const thread = await db.query<{ subject: string }>("select subject from public.threads where id = $1", [
      THREAD_ID,
    ]);
    expect(thread.rows[0].subject).toBe(seed.threads.find((row) => row.id === THREAD_ID)!.subject);
    for (const [id] of OLD_BRIEFS) {
      const order = await db.query<{ brief: string }>("select brief from public.orders where id = $1", [id]);
      expect(order.rows[0].brief).toBe(seed.orders.find((row) => row.id === id)!.brief);
    }
    expect(
      await count(
        "select count(*) as n from public.messages where id = any($1::uuid[]) and sender_name = 'Demo Founder'",
        [SEEDED_MESSAGE_IDS],
      ),
    ).toBe(11);
    expect(
      await count(
        "select count(*) as n from public.events where id = any($1::uuid[]) and actor_name = 'Demo Founder'",
        [SEEDED_EVENT_IDS],
      ),
    ).toBe(2);
  });

  it("leaves no seeded row naming the old store", async () => {
    const checks = [
      "select count(*) as n from public.stores where name ~* 'wally ?works' or slug ~* 'wallyworks' or tagline ~* 'wally ?works'",
      "select count(*) as n from public.profiles where bio ~* 'wally ?works'",
      "select count(*) as n from public.jobs where title ~* 'wally ?works' or description ~* 'wally ?works'",
      "select count(*) as n from public.orders where brief ~* 'wally ?works'",
      "select count(*) as n from public.threads where subject ~* 'wally ?works' and id <> $1",
    ];
    for (const sql of checks.slice(0, 4)) expect(await count(sql), sql).toBe(0);
    expect(await count(checks[4], [otherThreadId])).toBe(0);
  });

  it("touches nothing a person wrote, and no resident agent", async () => {
    expect(await residents()).toEqual(residentsBefore);
    const other = await db.query<{ subject: string }>("select subject from public.threads where id = $1", [
      otherThreadId,
    ]);
    expect(other.rows[0].subject).toBe("WallyWorks location page refresh");
    const later = await db.query<{ sender_name: string }>(
      "select sender_name from public.messages where id = $1",
      [laterMessageId],
    );
    expect(later.rows[0].sender_name).toBe("Austin");
  });

  it("serves the store at its new address only, through the Supabase adapter", async () => {
    const store = await asDemo.getStoreBySlug("harborline-labs");
    expect(store?.id).toBe(STORE_ID);
    expect(store?.name).toBe("Harborline Labs");
    expect(store?.agents.length).toBeGreaterThan(0);
    expect(store?.owner?.display_name).toBe("Demo Founder");
    expect(await asDemo.getStoreBySlug("wallyworks-labs")).toBeNull();
  });

  it("lets the new seed.sql re-apply over the renamed rows without a twin", async () => {
    await apply(await readFile(SEED_FILE, "utf8"), "seed.sql (re-applied)");
    expect(await count("select count(*) as n from public.stores where slug = 'harborline-labs'")).toBe(1);
    expect(await count("select count(*) as n from public.stores")).toBe(seed.stores.length);
  });
});
