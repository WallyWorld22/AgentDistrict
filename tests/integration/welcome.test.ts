import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoRepository } from "@/lib/data/demo";
import { ConflictError } from "@/lib/data/errors";
import { SupabaseRepository } from "@/lib/data/supabase";
import type { DistrictEvent, RegisterAgentInput } from "@/lib/data/types";
import {
  DISTRICT_DESK_HANDLE,
  DISTRICT_DESK_NAME,
  INTRODUCE_HREF,
  WELCOME_CAP,
  WELCOME_CTA_LABEL,
  welcomeBody,
  welcomeHeadline,
} from "@/lib/data/ext/welcome";
import { SEED_EPOCH_MS } from "@/lib/seed";
import {
  MIGRATIONS_DIR,
  SEED_FILE,
  SUPABASE_BOOTSTRAP,
  withoutLaterNulls,
} from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * The District welcomes its own (0019), against a REAL Postgres and through the
 * REAL Supabase adapter.
 *
 * `register_agent()` now ends with the District Desk's welcome post instead of
 * a bare 'discovered' event: personal, signed by the Desk (its Passport when
 * the database has one, else a `system` actor of the same name), linking to the
 * introduce-yourself how-to, at most `WELCOME_CAP.limit` per rolling window.
 * The text must be exactly what the demo adapter writes for the same
 * registration, and a direct service-role RPC — not only the app — gets it.
 *
 * Built the way production gets it: 0001–0018, seeded, residents registered
 * through the old front door, then 0019 — twice.
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const WELCOME_MIGRATION = "0019_welcome.sql";
/** Real residents production holds, registered before 0019. Never touched. */
const RESIDENTS = ["naif-gravity", "duami"];

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
let app: SupabaseRepository;
let serviceClient: ReturnType<typeof createPostgrestClient>;
let residentEventsBefore: unknown[] = [];
let probeNumber = 0;

async function apply(sql: string, label: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`);
  }
}

function input(handle: string, extra: Partial<RegisterAgentInput> = {}): RegisterAgentInput {
  return {
    handle,
    name: "TideReader",
    tagline: "Coastal permit and parcel research for Florida contractors — it's what I do.",
    category: "research",
    skills: ["permit data", "parcel matching"],
    ...extra,
  };
}

/** The 18 arguments the adapter sends, as PostgREST JSON. */
function rpcArgs(handle: string) {
  const n = String((probeNumber += 1) % 10);
  return {
    p_handle: handle,
    p_name: "Direct Probe",
    p_tagline: "Called the function straight through PostgREST.",
    p_description: "",
    p_avatar_emoji: "🤖",
    p_avatar_gradient: "linear-gradient(135deg,#297dff,#7559ff)",
    p_category: "research",
    p_skills: ["probing"],
    p_regions: ["US"],
    p_room_slug: "research-pit",
    p_pricing_model: "per_run",
    p_starting_price_cents: 0,
    p_endpoints: {},
    p_mcp_tools: [],
    p_key_hash: `sha256$${randomBytes(32).toString("hex")}`,
    p_key_prefix: `ad_live_prb${n}`,
    p_scopes: ["agents:read", "events:write"],
    p_token_hash: randomBytes(32).toString("hex"),
  };
}

async function eventsFor(agentId: string): Promise<DistrictEvent[]> {
  const { rows } = await db.query<DistrictEvent>(
    `select kind::text as kind, actor_type::text as actor_type, actor_id, actor_name,
            headline, body, cta_label, cta_href
       from public.events where actor_id = $1`,
    [agentId],
  );
  return rows;
}

/** The newest event, as the feed reads it. */
async function newest(): Promise<DistrictEvent> {
  const { rows } = await db.query<DistrictEvent>(
    `select kind::text as kind, actor_type::text as actor_type, actor_id, actor_name,
            headline, body, cta_label, cta_href
       from public.events order by created_at desc, id desc limit 1`,
  );
  return rows[0];
}

async function welcomesInWindow(): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `select count(*)::text as count from public.events
      where kind = 'post' and cta_href = $1 and created_at > now() - interval '60 minutes'`,
    [INTRODUCE_HREF],
  );
  return Number(rows[0].count);
}

function content(event: Pick<DistrictEvent, "kind" | "headline" | "body" | "cta_label" | "cta_href">) {
  return {
    kind: event.kind,
    headline: event.headline,
    body: event.body,
    cta_label: event.cta_label,
    cta_href: event.cta_href,
  };
}

suite("the District Desk's welcome (0019) on a real Postgres", () => {
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
    database = `agentdistrict_welcome_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);

    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();

    await apply(SUPABASE_BOOTSTRAP, "bootstrap");
    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files.filter((file) => file < WELCOME_MIGRATION)) {
      await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), name);
    }
    await apply(await readFile(SEED_FILE, "utf8"), "seed.sql");

    // Residents registered through the pre-0019 front door.
    for (const handle of RESIDENTS) {
      await db.query("select id from public.register_agent(p_handle => $1, p_name => $2, " +
        "p_tagline => 'A real resident.', p_description => '', p_avatar_emoji => '🤖', " +
        "p_avatar_gradient => '', p_category => 'research', p_skills => array['x']::text[], " +
        "p_regions => array['US']::text[], p_room_slug => 'research-pit', p_pricing_model => 'per_run', " +
        "p_starting_price_cents => 0, p_endpoints => '{}'::jsonb, p_mcp_tools => '{}'::text[], " +
        "p_key_hash => $3, p_key_prefix => 'ad_live_res0', p_scopes => array['agents:read']::text[], " +
        "p_token_hash => $4)", [
        handle,
        `Resident ${handle}`,
        `sha256$${randomBytes(32).toString("hex")}`,
        randomBytes(32).toString("hex"),
      ]);
    }
    residentEventsBefore = (
      await db.query(
        `select e.* from public.events e join public.agents a on a.id = e.actor_id
          where a.handle = any($1::text[]) order by e.id`,
        [RESIDENTS],
      )
    ).rows;

    for (const pass of ["first", "again"]) {
      for (const name of files.filter((file) => file >= WELCOME_MIGRATION)) {
        await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), `${name} (${pass})`);
      }
    }

    pool = new Pool({ connectionString: url.href, max: 4 });
    const anonClient = createPostgrestClient(pool);
    serviceClient = createPostgrestClient(pool, { role: "service_role" });
    app = new SupabaseRepository(async () => anonClient, {
      serviceClient: async () => serviceClient,
    });
  });

  afterAll(async () => {
    await pool?.end();
    await db?.end();
    if (database) await admin?.query(`drop database if exists ${database} with (force)`);
    await admin?.end();
  });

  it("leaves the residents registered before it exactly as they were", async () => {
    const after = (
      await db.query(
        `select e.* from public.events e join public.agents a on a.id = e.actor_id
          where a.handle = any($1::text[]) order by e.id`,
        [RESIDENTS],
      )
    ).rows.map(withoutLaterNulls);
    expect(after).toEqual(residentEventsBefore);
    expect(after).toHaveLength(RESIDENTS.length);
  });

  it("welcomes a registrant as the District, with the demo adapter's exact words, once", async () => {
    const registration = input("tide-reader");
    const { agent } = await app.registerAgent(registration);

    const welcome = await newest();
    expect(welcome).toMatchObject({
      kind: "post",
      actor_type: "system",
      actor_id: null,
      actor_name: DISTRICT_DESK_NAME,
      headline: welcomeHeadline(agent),
      body: welcomeBody(agent),
      cta_label: WELCOME_CTA_LABEL,
      cta_href: INTRODUCE_HREF,
    });
    // The welcome replaced the bare arrival: nothing signed by the newcomer.
    expect(await eventsFor(agent.id)).toEqual([]);

    // Identical in both adapters.
    const demo = createDemoRepository({ now: () => SEED_EPOCH_MS });
    await demo.registerAgent(registration);
    const [demoWelcome] = await demo.listEvents({ limit: 1 });
    expect(content(welcome)).toEqual(content(demoWelcome));
    expect(demoWelcome.actor_name).toBe(welcome.actor_name);
    expect(demoWelcome.actor_type).toBe(welcome.actor_type);

    // And it is what the feed (posts only) serves first.
    const [first] = await app.listEvents({ kinds: ["post"], limit: 1 });
    expect(first.headline).toBe(welcomeHeadline(agent));
  });

  it("welcomes a direct service-role RPC caller too, not only the app", async () => {
    const { data, error } = await serviceClient.rpc("register_agent", rpcArgs("direct-probe"));
    expect(error).toBeNull();
    const row = (Array.isArray(data) ? data[0] : data) as { id: string; name: string };
    const welcome = await newest();
    expect(welcome.kind).toBe("post");
    expect(welcome.headline).toBe("Welcome to the District, Direct Probe!");
    expect(welcome.body).toContain("@direct-probe");
    expect(await eventsFor(row.id)).toEqual([]);
  });

  it("refuses @district-desk at the front door, in SQL and in the adapter", async () => {
    const { error } = await serviceClient.rpc("register_agent", rpcArgs(DISTRICT_DESK_HANDLE));
    expect(error?.message).toMatch(/reserved for the District/);
    await expect(app.registerAgent(input(DISTRICT_DESK_HANDLE))).rejects.toBeInstanceOf(ConflictError);
    const { rows } = await db.query("select 1 from public.agents where handle = $1", [
      DISTRICT_DESK_HANDLE,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("signs as the @district-desk Passport where the database has one, as production does", async () => {
    // Production's Desk predates the reservation; stand one up the same way.
    const { agent: desk } = await app.registerAgent(input("desk-to-be", { name: "District Desk" }));
    await db.query("update public.agents set handle = $1 where id = $2", [DISTRICT_DESK_HANDLE, desk.id]);

    const { agent } = await app.registerAgent(input("reef-watch", { name: "ReefWatch" }));
    const welcome = await newest();
    expect(welcome).toMatchObject({
      kind: "post",
      actor_type: "agent",
      actor_id: desk.id,
      actor_name: "District Desk",
      headline: welcomeHeadline(agent),
    });
  });

  it("caps the welcomes per rolling hour, then records arrivals plainly, then welcomes again", async () => {
    const room = WELCOME_CAP.limit - (await welcomesInWindow());
    expect(room).toBeGreaterThan(0);
    for (let i = 0; i < room; i += 1) {
      await app.registerAgent(input(`burst-${i}`, { name: `Burst ${i}` }));
      expect((await newest()).kind).toBe("post");
    }
    expect(await welcomesInWindow()).toBe(WELCOME_CAP.limit);

    const { agent: over } = await app.registerAgent(input("burst-over", { name: "Burst Over" }));
    expect(await welcomesInWindow()).toBe(WELCOME_CAP.limit);
    expect(await eventsFor(over.id)).toEqual([
      {
        kind: "discovered",
        actor_type: "agent",
        actor_id: over.id,
        actor_name: "Burst Over",
        headline: "Burst Over joined the District",
        body: over.tagline,
        cta_label: "View passport",
        cta_href: "/agents/burst-over",
      },
    ]);

    // An hour on, the Desk welcomes again.
    await db.query(
      "update public.events set created_at = created_at - interval '61 minutes' where cta_href = $1",
      [INTRODUCE_HREF],
    );
    const { agent: later } = await app.registerAgent(input("after-the-burst", { name: "Later" }));
    expect((await newest()).headline).toBe(welcomeHeadline(later));
  });
});
