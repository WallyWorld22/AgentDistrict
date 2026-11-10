import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoRepository } from "@/lib/data/demo";
import { SupabaseRepository } from "@/lib/data/supabase";
import { DEMO_PROFILE_ID, seed } from "@/lib/seed";
import { MIGRATIONS_DIR, SEED_FILE, SUPABASE_BOOTSTRAP } from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * The honesty pass (site audit section 4) on a REAL Postgres, through the REAL
 * Supabase adapter.
 *
 * - Owner decision 14: messaging an agent you already wrote to continues that
 *   thread, in this adapter exactly as in the demo one.
 * - 0015 rewrites the seeded rows production already holds: the two top-ups
 *   that said a card was charged (economy-07), and the feed events whose
 *   buttons pointed at the viewer's own Command Center or Wallet, or promised
 *   a feature that was only a Passport (social-media-06, social-media-14).
 *
 * The database is built the way production gets it: 0001–0014, seeded, the
 * seeded rows put back to the text production holds, then 0015 (and anything
 * after it) — twice.
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const HONESTY_MIGRATION = "0015_honest_labels.sql";
const OLD_TOPUP_MEMO = "Added credits — card ending 4242";
const TOPUP_IDS = ["4e63b5d6-22b9-56be-affc-f38b20743cde", "c0de34a9-b10b-5697-aff6-532386948c96"];

/** What production holds for the events 0015 rewrites. */
const OLD_EVENT_CTAS: Array<[id: string, label: string, href: string]> = [
  ["51625b41-9656-5001-89ef-e2da40b300d3", "Review", "/command"],
  ["9451e938-cff3-5ab1-8e58-60bf924e4e01", "Watch the run", "/command"],
  ["d4ba39c9-24c8-50df-a910-cd4529c152b0", "Open wallet", "/wallet"],
  ["dfab24d9-8d4e-5d1d-9ec5-30645303c9dd", "Open wallet", "/wallet"],
  ["6422aa98-79a6-56e3-97b5-3763203f8c04", "Query data", "/agents/scout"],
  ["1c1732ee-d11e-5a1f-b248-f901c840b4a9", "See the data", "/agents/localintel"],
  ["481d2f14-4897-5343-ab91-2882a7a5d43d", "Try it", "/agents/csv-cleaner"],
  ["6d0912af-27a0-55f2-b0ac-e8592f66fac4", "Message", "/agents/parcelpro"],
  ["48e02e57-d8df-5456-8d41-4ca96b6e6181", "Message", "/agents/adpilot"],
  ["734995a1-4df4-5637-839a-d2ff08e55782", "Message", "/agents/builderbot"],
];

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
let files: string[];
let asDemo: SupabaseRepository;
/** What the database held before 0015 ran. */
const before = { oldMemos: 0, oldCtas: 0 };

async function apply(sql: string, label: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`);
  }
}

suite("the honesty pass on a real Postgres", () => {
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
    database = `agentdistrict_honesty_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);

    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();

    await apply(SUPABASE_BOOTSTRAP, "bootstrap");
    files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files.filter((file) => file < HONESTY_MIGRATION)) {
      await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), name);
    }
    await apply(await readFile(SEED_FILE, "utf8"), "seed.sql");

    // Production was seeded before the new seed text: put those rows back.
    await db.query("update public.wallet_transactions set memo = $1 where id = any($2::uuid[])", [
      OLD_TOPUP_MEMO,
      TOPUP_IDS,
    ]);
    for (const [id, label, href] of OLD_EVENT_CTAS) {
      await db.query("update public.events set cta_label = $2, cta_href = $3 where id = $1", [
        id,
        label,
        href,
      ]);
    }
    before.oldMemos = Number(
      (
        await db.query<{ n: string }>(
          "select count(*) as n from public.wallet_transactions where memo = $1",
          [OLD_TOPUP_MEMO],
        )
      ).rows[0].n,
    );
    before.oldCtas = Number(
      (
        await db.query<{ n: string }>(
          "select count(*) as n from public.events where cta_href in ('/command', '/wallet')",
        )
      ).rows[0].n,
    );

    // A row nobody seeded, with the same text: 0015 must leave it alone.
    await db.query(
      `insert into public.events (kind, actor_type, actor_name, headline, body, cta_label, cta_href)
       values ('post', 'human', 'Somebody', 'Mine', '', 'Open wallet', '/wallet')`,
    );

    for (const pass of ["first", "again"]) {
      for (const name of files.filter((file) => file >= HONESTY_MIGRATION)) {
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

  it("lands on a District holding production's old text", () => {
    expect(files).toContain(HONESTY_MIGRATION);
    expect(before.oldMemos).toBe(2);
    expect(before.oldCtas).toBe(4);
  });

  it("0015 says no card was charged on the seeded top-ups", async () => {
    const { rows } = await db.query<{ memo: string }>(
      "select memo from public.wallet_transactions where id = any($1::uuid[])",
      [TOPUP_IDS],
    );
    expect(rows.map((row) => row.memo)).toEqual([
      "Demo credits added — not real money",
      "Demo credits added — not real money",
    ]);
    const { rows: left } = await db.query(
      "select 1 from public.wallet_transactions where memo like '%card ending%'",
    );
    expect(left).toHaveLength(0);
  });

  it("0015 points every seeded event's button at what the event is about, as the seed does", async () => {
    const { rows } = await db.query<{ id: string; cta_label: string; cta_href: string }>(
      "select id, cta_label, cta_href from public.events where id = any($1::uuid[])",
      [OLD_EVENT_CTAS.map(([id]) => id)],
    );
    expect(rows).toHaveLength(OLD_EVENT_CTAS.length);
    const fresh = new Map(seed.events.map((event) => [event.id, event]));
    for (const row of rows) {
      const seeded = fresh.get(row.id)!;
      expect({ label: row.cta_label, href: row.cta_href }).toEqual({
        label: seeded.cta_label,
        href: seeded.cta_href,
      });
      expect(row.cta_href).not.toMatch(/^\/(command|wallet)$/);
    }
    // The row nobody seeded keeps what its author wrote.
    const { rows: mine } = await db.query<{ cta_href: string }>(
      "select cta_href from public.events where headline = 'Mine'",
    );
    expect(mine.map((row) => row.cta_href)).toEqual(["/wallet"]);
  });

  it("continues the existing thread when the same person messages the same agent (decision 14)", async () => {
    const first = await asDemo.createThread({
      profileId: DEMO_PROFILE_ID,
      agentHandle: "mapfox",
      subject: "Territory question",
      body: "Can you map the Treasure Coast?",
    });
    const count = async () =>
      Number(
        (
          await db.query<{ n: string }>(
            "select count(*) as n from public.threads where profile_id = $1",
            [DEMO_PROFILE_ID],
          )
        ).rows[0].n,
      );
    const threadsBefore = await count();

    const second = await asDemo.createThread({
      profileId: DEMO_PROFILE_ID,
      agentHandle: "mapfox",
      subject: "Part two",
      body: "And Palm Beach, please.",
    });

    expect(second.id).toBe(first.id);
    expect(await count()).toBe(threadsBefore);
    expect(second.messages.at(-1)!.body).toBe("And Palm Beach, please.");
    expect(second.messages.map((message) => message.body)).toContain(
      "Can you map the Treasure Coast?",
    );

    // The demo adapter does the same.
    const demo = createDemoRepository();
    const a = await demo.createThread({
      profileId: DEMO_PROFILE_ID,
      agentHandle: "mapfox",
      subject: "Territory question",
      body: "Can you map the Treasure Coast?",
    });
    const b = await demo.createThread({
      profileId: DEMO_PROFILE_ID,
      agentHandle: "mapfox",
      subject: "Part two",
      body: "And Palm Beach, please.",
    });
    expect(b.id).toBe(a.id);
  });
});
