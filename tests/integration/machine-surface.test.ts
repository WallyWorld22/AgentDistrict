import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseRepository } from "@/lib/data/supabase";
import { isLeagueFighter } from "@/lib/data/league";
import { DEMO_PROFILE_ID, seed } from "@/lib/seed";
import { MIGRATIONS_DIR, SEED_FILE, SUPABASE_BOOTSTRAP } from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * Batch 8 of the site audit on a REAL Postgres, read back through the REAL
 * Supabase adapter:
 *
 * - **0018** (owner decision 10, machine-surface-04). Production's founding
 *   cast holds one "MCP tool" per skill, which the District's MCP server never
 *   served. The database is built the way production got it — 0001-0017,
 *   seeded, the old tool lists put back — then 0018 runs twice. An agent whose
 *   owner set its own tools, and a registered resident, keep theirs.
 * - **`free=false`** (machine-surface-10) is the Supabase adapter's
 *   `paidOnly`, on both of its read paths (SQL, and the full-text search that
 *   filters in memory), agreeing with the demo adapter.
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const MIGRATION = "0018_drop_seeded_mcp_tools.sql";
/** A seeded agent whose owner has since declared tools of its own. */
const CUSTOMISED = "copycat";
const CUSTOM_TOOLS = ["draft_landing_copy"];
const RESIDENT = "tool-owner";
const RESIDENT_TOOLS = ["parse_permits", "geocode"];

/** The rule the seed used to name a skill's "tool": `Lead research` → `lead_research`. */
function oldToolName(skill: string): string {
  return skill
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** What production holds for each seeded agent, worked out independently of 0018. */
const PRODUCTION_TOOLS = seed.agents
  .filter((agent) => !isLeagueFighter(agent))
  .map((agent) => ({ id: agent.id, handle: agent.handle, tools: agent.skills.map(oldToolName) }));

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
let repo: SupabaseRepository;

async function apply(sql: string, label: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`);
  }
}

async function toolsOf(handle: string): Promise<string[]> {
  const { rows } = await db.query<{ mcp_tools: string[] }>(
    "select mcp_tools from public.agents where handle = $1",
    [handle],
  );
  return rows[0].mcp_tools;
}

suite("batch 8 machine surface on a real Postgres", () => {
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
    database = `agentdistrict_machine_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);

    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();

    await apply(SUPABASE_BOOTSTRAP, "bootstrap");
    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    expect(files).toContain(MIGRATION);
    for (const name of files.filter((file) => file < MIGRATION)) {
      await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), name);
    }
    await apply(await readFile(SEED_FILE, "utf8"), "seed.sql");

    // Production was seeded with a tool per skill: put those lists back.
    for (const row of PRODUCTION_TOOLS) {
      await db.query("update public.agents set mcp_tools = $2::text[] where id = $1", [
        row.id,
        row.tools,
      ]);
    }
    // Since then, one owner declared tools of their own…
    await db.query("update public.agents set mcp_tools = $2::text[] where handle = $1", [
      CUSTOMISED,
      CUSTOM_TOOLS,
    ]);
    // …and a resident registered with its own MCP server and tools.
    await db.query(
      `select id from public.register_agent(
         p_handle => $1, p_name => 'Tool Owner', p_tagline => 'Runs its own MCP server.',
         p_description => '', p_avatar_emoji => '🤖',
         p_avatar_gradient => 'linear-gradient(135deg,#297dff,#7559ff)',
         p_category => 'research', p_skills => array['permits']::text[],
         p_regions => array['US']::text[], p_room_slug => 'research-pit',
         p_pricing_model => 'per_run', p_starting_price_cents => 0,
         p_endpoints => '{"mcp":"https://tools.example.com/mcp"}'::jsonb,
         p_mcp_tools => $2::text[],
         p_key_hash => $3, p_key_prefix => 'ad_live_tool',
         p_scopes => array['agents:read']::text[], p_token_hash => $4
       )`,
      [RESIDENT, RESIDENT_TOOLS, `sha256$${"7".repeat(64)}`, "8".repeat(64)],
    );
    expect(await toolsOf("scout")).toEqual(
      PRODUCTION_TOOLS.find((row) => row.handle === "scout")!.tools,
    );

    for (const pass of ["first", "again"]) {
      for (const name of files.filter((file) => file >= MIGRATION)) {
        await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), `${name} (${pass})`);
      }
    }

    pool = new Pool({ connectionString: url.href, max: 4 });
    const serviceClient = createPostgrestClient(pool, { role: "service_role" });
    repo = new SupabaseRepository(async () => serviceClient, {
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

  it("0018 clears every seeded tool list production holds, as the seed now writes it", async () => {
    for (const row of PRODUCTION_TOOLS.filter((entry) => entry.handle !== CUSTOMISED)) {
      expect(await toolsOf(row.handle), row.handle).toEqual([]);
    }
    for (const agent of seed.agents) expect(agent.mcp_tools).toEqual([]);
    const scout = await repo.getAgentByHandle("scout");
    expect(scout?.mcp_tools).toEqual([]);
  });

  it("0018 leaves tools an owner or a resident declared", async () => {
    expect(await toolsOf(CUSTOMISED)).toEqual(CUSTOM_TOOLS);
    expect(await toolsOf(RESIDENT)).toEqual(RESIDENT_TOOLS);
  });

  it("paidOnly lists exactly the agents that charge, on both read paths", async () => {
    const all = await repo.listAgents({ limit: 200, excludeLeagueFighters: true });
    const paid = await repo.listAgents({ limit: 200, paidOnly: true, excludeLeagueFighters: true });
    const free = await repo.listAgents({ limit: 200, freeOnly: true, excludeLeagueFighters: true });
    expect(paid.length).toBeGreaterThan(0);
    expect(free.length).toBeGreaterThan(0);
    expect(paid.every((agent) => !agent.is_free)).toBe(true);
    expect(paid.length + free.length).toBe(all.length);

    const searched = await repo.listAgents({ q: "research", limit: 50, paidOnly: true });
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.every((agent) => !agent.is_free)).toBe(true);
  });
});
