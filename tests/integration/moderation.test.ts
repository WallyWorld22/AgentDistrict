import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireAuth } from "@/lib/auth";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/data/errors";
import { SupabaseRepository } from "@/lib/data/supabase";
import { OPERATORS_ONLY, suspendedKeyRefusal } from "@/lib/data/ext/moderation";
import { PRE_MESSAGING_AGENT_SCOPES } from "@/lib/data/types";
import { DEMO_PROFILE_ID, REGISTRY_PROFILE_ID, profileId } from "@/lib/seed";
import {
  MIGRATIONS_DIR,
  SEED_FILE,
  SUPABASE_BOOTSTRAP,
  withoutLaterNulls,
} from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * Hand moderation (0021), against a REAL Postgres and through the REAL
 * Supabase adapter.
 *
 * - An operator's session (`profiles.is_admin`; the seed's demo human) hides a
 *   post and suspends an agent through the adapter, exactly as the Server
 *   Actions do; a non-operator's session is refused by the database, and so
 *   is anon.
 * - A hidden post leaves every read: the anon client (RLS), the service-role
 *   client an API key reaches Postgres through (the adapter's filter), and a
 *   direct PostgREST select.
 * - A suspended agent's key is refused by the app's key check over this
 *   adapter, and the database refuses a post or a bid in its name from any
 *   caller, the service role included.
 * - Nobody flips either flag except through the two functions.
 *
 * Built the way production gets it: 0001–0020, seeded, residents registered
 * through the old front door, one stranger's post, then 0021 — twice. Nothing
 * pre-existing is hidden or suspended by the migration.
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const MODERATION_MIGRATION = "0021_moderation.sql";
const RESIDENTS = ["naif-gravity", "duami"];
const JESS = profileId("buildwithjess");

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
/** The public anon-key client: what `/feed` and `GET /api/v1/feed` read through. */
let anon: SupabaseRepository;
/** The service role: what an API-key caller reaches Postgres through. */
let service: SupabaseRepository;
/** The same, acting as the registry: an unclaimed agent's own key (`getRepoActingAs`). */
let asRegistry: SupabaseRepository;
/** A signed-in operator's session (the seed's one `is_admin` profile). */
let operator: SupabaseRepository;
/** A signed-in person who is not an operator. */
let jess: SupabaseRepository;
let residentsBefore: unknown[] = [];
let eventsBefore = 0;
let strangerPostId = "";

async function apply(sql: string, label: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`);
  }
}

/** As `sub` (or anon), rolled back whatever happens: rows touched, or null on an error. */
async function probe(sub: string | null, sql: string, params: unknown[] = []): Promise<number | null> {
  await db.query("begin");
  try {
    await db.query(`set local role ${sub ? "authenticated" : "anon"}`);
    if (sub) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
    const result = await db.query(sql, params);
    return result.rowCount ?? 0;
  } catch {
    return null;
  } finally {
    await db.query("rollback");
  }
}

async function registerOld(handle: string): Promise<void> {
  await db.query(
    "select id from public.register_agent(p_handle => $1, p_name => $2, " +
      "p_tagline => 'A real resident.', p_description => '', p_avatar_emoji => '🤖', " +
      "p_avatar_gradient => '', p_category => 'research', p_skills => array['x']::text[], " +
      "p_regions => array['US']::text[], p_room_slug => 'research-pit', p_pricing_model => 'per_run', " +
      "p_starting_price_cents => 0, p_endpoints => '{}'::jsonb, p_mcp_tools => '{}'::text[], " +
      "p_key_hash => $3, p_key_prefix => 'ad_live_res0', p_scopes => $4::text[], " +
      "p_token_hash => $5)",
    [
      handle,
      `Resident ${handle}`,
      `sha256$${randomBytes(32).toString("hex")}`,
      [...PRE_MESSAGING_AGENT_SCOPES],
      randomBytes(32).toString("hex"),
    ],
  );
}

async function agentId(handle: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>("select id from public.agents where handle = $1", [handle]);
  return rows[0].id;
}

/** An open bounty nobody in this test owns an agent of. */
async function openJob(): Promise<{ id: string; budget_cents: number; deadline_seconds: number }> {
  const { rows } = await db.query<{ id: string; budget_cents: number; deadline_seconds: number }>(
    `select j.id, j.budget_cents, j.deadline_seconds from public.jobs j
      where j.status = 'open' and j.poster_id <> $1 order by j.created_at limit 1`,
    [REGISTRY_PROFILE_ID],
  );
  return rows[0];
}

suite("hand moderation (0021) on a real Postgres", () => {
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
    database = `agentdistrict_moderation_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);
    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();

    await apply(SUPABASE_BOOTSTRAP, "bootstrap");
    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files.filter((file) => file < MODERATION_MIGRATION)) {
      await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), name);
    }
    await apply(await readFile(SEED_FILE, "utf8"), "seed.sql");

    // Production as it stands: real residents, and a stranger's post on the feed.
    for (const handle of RESIDENTS) await registerOld(handle);
    const stranger = await db.query<{ id: string }>(
      `insert into public.events (kind, actor_type, actor_id, actor_name, headline, body)
       select 'post', 'agent', a.id, a.name, 'Join my token presale, 100x', '' from public.agents a
        where a.handle = $1 returning id`,
      [RESIDENTS[1]],
    );
    strangerPostId = stranger.rows[0].id;
    residentsBefore = (
      await db.query("select a.* from public.agents a where a.handle = any($1::text[]) order by a.id", [
        RESIDENTS,
      ])
    ).rows;
    eventsBefore = Number((await db.query("select count(*) from public.events")).rows[0].count);

    for (const pass of ["first", "again"]) {
      for (const name of files.filter((file) => file >= MODERATION_MIGRATION)) {
        await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), `${name} (${pass})`);
      }
    }

    pool = new Pool({ connectionString: url.href, max: 4 });
    const anonClient = createPostgrestClient(pool);
    const serviceClient = createPostgrestClient(pool, { role: "service_role" });
    const asService = async () => serviceClient;
    anon = new SupabaseRepository(async () => anonClient, { serviceClient: asService });
    service = new SupabaseRepository(asService, { serviceClient: asService });
    asRegistry = new SupabaseRepository(asService, { actAs: REGISTRY_PROFILE_ID, serviceClient: asService });
    const operatorClient = createPostgrestClient(pool, { role: "authenticated", sub: DEMO_PROFILE_ID });
    operator = new SupabaseRepository(async () => operatorClient);
    const jessClient = createPostgrestClient(pool, { role: "authenticated", sub: JESS });
    jess = new SupabaseRepository(async () => jessClient);
  });

  afterAll(async () => {
    await pool?.end();
    await db?.end();
    if (database) await admin?.query(`drop database if exists ${database} with (force)`);
    await admin?.end();
  });

  it("ships the capability only: nothing hidden, nobody suspended, residents untouched", async () => {
    const flagged = await db.query<{ hidden: string; suspended: string }>(
      `select (select count(*) from public.events where hidden_at is not null)::text as hidden,
              (select count(*) from public.agents where suspended_at is not null)::text as suspended`,
    );
    expect(flagged.rows[0]).toEqual({ hidden: "0", suspended: "0" });
    expect(Number((await db.query("select count(*) from public.events")).rows[0].count)).toBe(eventsBefore);
    const after = (
      await db.query("select a.* from public.agents a where a.handle = any($1::text[]) order by a.id", [
        RESIDENTS,
      ])
    ).rows as Array<Record<string, unknown>>;
    expect(after.map(withoutLaterNulls)).toEqual(residentsBefore);
    expect(after.every((row) => row.suspended_at === null)).toBe(true);
  });

  it("lets an operator hide a post from every read, and bring it back", async () => {
    const postIds = async (repo: SupabaseRepository) =>
      (await repo.listEvents({ kinds: ["post"], limit: 200 })).map((row) => row.id);
    expect(await postIds(anon)).toContain(strangerPostId);

    const hidden = await operator.setEventHidden(strangerPostId, true);
    expect(hidden.hidden_at).toBeTruthy();
    try {
      expect(await postIds(anon)).not.toContain(strangerPostId);
      expect(await postIds(service)).not.toContain(strangerPostId);
      expect((await anon.listEvents({ limit: 500 })).map((row) => row.id)).not.toContain(strangerPostId);
      // RLS, not only the adapter: a direct anon or signed-in select sees nothing.
      expect(await probe(null, "select 1 from public.events where id = $1", [strangerPostId])).toBe(0);
      expect(await probe(JESS, "select 1 from public.events where id = $1", [strangerPostId])).toBe(0);
      // Kept, and on the operator's list.
      expect((await operator.listHiddenPosts()).map((row) => row.id)).toEqual([strangerPostId]);
    } finally {
      const shown = await operator.setEventHidden(strangerPostId, false);
      expect(shown.hidden_at).toBeUndefined();
    }
    expect(await postIds(anon)).toContain(strangerPostId);
    expect(await operator.listHiddenPosts()).toEqual([]);
  });

  it("hides posts only", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.events where kind = 'hired' limit 1");
    await expect(operator.setEventHidden(rows[0].id, true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a non-operator, and anon, in the database", async () => {
    await expect(jess.setEventHidden(strangerPostId, true)).rejects.toThrow(OPERATORS_ONLY);
    await expect(jess.listHiddenPosts()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(jess.setAgentSuspended(RESIDENTS[0], true)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(anon.setEventHidden(strangerPostId, true)).rejects.toBeInstanceOf(ForbiddenError);

    // No privilege at all for anon.
    expect(
      await probe(null, "select public.set_event_hidden($1, true)", [strangerPostId]),
    ).toBeNull();
    expect(await probe(null, "select public.set_agent_suspended($1, true)", [RESIDENTS[0]])).toBeNull();

    const flagged = await db.query<{ n: string }>(
      `select ((select count(*) from public.events where hidden_at is not null)
             + (select count(*) from public.agents where suspended_at is not null))::text as n`,
    );
    expect(flagged.rows[0].n).toBe("0");
  });

  it("never lets a signed-in caller write either flag directly", async () => {
    // Jess owns agents; she may edit their name, never their standing.
    const { rows } = await db.query<{ handle: string }>(
      "select handle from public.agents where owner_id = $1 limit 1",
      [JESS],
    );
    const own = rows[0].handle;
    expect(
      await probe(JESS, "update public.agents set tagline = tagline where handle = $1", [own]),
    ).toBe(1);
    expect(
      await probe(JESS, "update public.agents set suspended_at = now() where handle = $1", [own]),
    ).toBeNull();
    // `events` has no client UPDATE at all any more.
    expect(
      await probe(JESS, "update public.events set hidden_at = now() where id = $1", [strangerPostId]),
    ).toBeNull();
    expect(
      await probe(DEMO_PROFILE_ID, "update public.events set hidden_at = now() where id = $1", [
        strangerPostId,
      ]),
    ).toBeNull();
    const privileges = await db.query<Record<string, boolean>>(
      `select has_column_privilege('authenticated','public.agents','suspended_at','UPDATE') as agents,
              has_table_privilege('authenticated','public.events','UPDATE')               as events`,
    );
    expect(privileges.rows[0]).toEqual({ agents: false, events: false });
  });

  it("suspends an agent: its key is refused, and nobody can post or bid in its name", async () => {
    const { agent, rawApiKey } = await service.registerAgent({
      handle: "token-shill",
      name: "TokenShill",
      tagline: "Registered here only to be suspended by a test.",
      category: "research",
      skills: ["shilling"],
    });
    const bearer = () =>
      new Request("https://district.test/api/v1/agents/me", {
        headers: { authorization: `Bearer ${rawApiKey}` },
      });
    const job = await openJob();
    const postAsAgent = (repo: SupabaseRepository) =>
      repo.publishEvent({
        kind: "post",
        actor_type: "agent",
        actor_id: agent.id,
        actor_name: agent.name,
        headline: "Still shilling",
        body: "",
      });

    const suspended = await operator.setAgentSuspended("token-shill", true);
    expect(suspended.suspended_at).toBeTruthy();
    expect((await anon.getAgentByHandle("token-shill"))?.suspended_at).toBeTruthy();
    expect((await anon.listSuspendedAgents()).map((row) => row.handle)).toEqual(["token-shill"]);

    // The app's key check, over this adapter.
    await expect(requireAuth(bearer(), { repo: anon })).rejects.toThrow(
      suspendedKeyRefusal({ handle: "token-shill" }),
    );

    // The adapter refuses in words…
    await expect(postAsAgent(asRegistry)).rejects.toBeInstanceOf(ForbiddenError);
    // …and the database refuses whoever writes: the service role directly,
    // a post and a bid alike.
    const id = await agentId("token-shill");
    await expect(
      db.query(
        `insert into public.events (kind, actor_type, actor_id, actor_name, headline, body)
         values ('post', 'agent', $1, 'TokenShill', 'Direct insert', '')`,
        [id],
      ),
    ).rejects.toThrow(/suspended by the District/);
    await expect(
      db.query(
        `insert into public.bids (job_id, agent_id, amount_cents, eta_seconds, note, status)
         values ($1, $2, $3, $4, 'probe', 'pending')`,
        [job.id, id, Math.min(500, job.budget_cents), Math.min(900, job.deadline_seconds)],
      ),
    ).rejects.toThrow(/suspended by the District/);
    // A record about it is not it speaking.
    await db.query(
      `insert into public.events (kind, actor_type, actor_id, actor_name, headline, body)
       values ('discovered', 'agent', $1, 'TokenShill', 'A lifecycle row', '')`,
      [id],
    );

    const back = await operator.setAgentSuspended("token-shill", false);
    expect(back.suspended_at).toBeUndefined();
    await expect(requireAuth(bearer(), { repo: anon })).resolves.toMatchObject({ via: "api_key" });
    await expect(postAsAgent(asRegistry)).resolves.toMatchObject({ kind: "post" });
    await db.query(
      `insert into public.bids (job_id, agent_id, amount_cents, eta_seconds, note, status)
       values ($1, $2, $3, $4, 'probe', 'pending')`,
      [job.id, id, Math.min(500, job.budget_cents), Math.min(900, job.deadline_seconds)],
    );
    expect(await anon.listSuspendedAgents()).toEqual([]);
  });

  it("never suspends the District Desk, and 404s an unknown handle", async () => {
    await expect(operator.setAgentSuspended("district-desk", true)).rejects.toBeInstanceOf(ValidationError);
    await expect(operator.setAgentSuspended("nobody-here", true)).rejects.toBeInstanceOf(NotFoundError);
    // The database refuses the Desk without the app's help.
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [DEMO_PROFILE_ID]);
      await expect(db.query("select public.set_agent_suspended('district-desk', true)")).rejects.toThrow(
        /cannot be suspended/,
      );
    } finally {
      await db.query("rollback");
    }
  });
});
