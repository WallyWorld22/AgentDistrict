import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/data/errors";
import { SupabaseRepository } from "@/lib/data/supabase";
import { inboxThreadDetail, inboxThreadSummary } from "@/lib/data/ext/inbox";
import { PRE_MESSAGING_AGENT_SCOPES, REGISTERED_AGENT_SCOPES } from "@/lib/data/types";
import { DEMO_PROFILE_ID, REGISTRY_PROFILE_ID, profileId } from "@/lib/seed";
import { MIGRATIONS_DIR, SEED_FILE, SUPABASE_BOOTSTRAP } from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * Agents read and answer their inbox (0020), against a REAL Postgres and
 * through the REAL Supabase adapter, on the path an agent key takes in
 * production: the service role, acting as the key's profile
 * (`getRepoActingAs`).
 *
 * A thread is one human and one agent; a human opens it. So "agents talking"
 * here is: two registered agents, each with a thread a human opened; each
 * reads and answers its own, and neither can read or write the other's.
 * Agents cannot open a thread (no such primitive exists, and this batch adds
 * none).
 *
 * Also the database's own fences, for a signed-in caller writing straight
 * through PostgREST: before 0020 it could post a message **as the agent** (or
 * under any name) in a thread it could see, and re-point a thread at another
 * agent; both are measured before 0020 and refused after it.
 *
 * Built the way production gets it: 0001–0019, seeded, residents registered
 * through the old front door (the old 7-scope key), a narrow hand-bound key,
 * then 0020 — twice.
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const INBOX_MIGRATION = "0020_agent_inbox.sql";
const RESIDENTS = ["naif-gravity", "duami"];
const JESS = profileId("buildwithjess");

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
let serviceClient: ReturnType<typeof createPostgrestClient>;
/** `getRepoActingAs(REGISTRY_PROFILE_ID)`: what an unclaimed agent's key gets. */
let asRegistry: SupabaseRepository;
/** The demo human, through the service role (the app's API-key path). */
let asHuman: SupabaseRepository;
let residentsBefore: unknown[] = [];
let narrowKeyId = "";

/** What a signed-in caller could do straight through PostgREST before 0020. */
const before = { forgedAgentReply: false, forgedName: false, repointed: false };

async function apply(sql: string, label: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`);
  }
}

/** As `sub`, rolled back whatever happens: did the statement go through? */
async function probe(sub: string, sql: string, params: unknown[] = []): Promise<number | null> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
    const result = await db.query(sql, params);
    return result.rowCount ?? 0;
  } catch {
    return null;
  } finally {
    await db.query("rollback");
  }
}

/** Jess's seeded thread, its agent, and her display name. */
async function jessThread() {
  const { rows } = await db.query<{ id: string; agent_id: string; agent_name: string; display_name: string }>(
    `select t.id, t.agent_id, a.name as agent_name, p.display_name
       from public.threads t join public.agents a on a.id = t.agent_id
       join public.profiles p on p.id = t.profile_id
      where t.profile_id = $1 order by t.created_at limit 1`,
    [JESS],
  );
  expect(rows[0], "a seeded thread of Jess's").toBeDefined();
  return rows[0];
}

const INSERT_MESSAGE =
  "insert into public.messages (thread_id, sender_type, sender_id, sender_name, body) values ($1, $2, $3, $4, 'probe')";

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

async function scopesOf(handle: string): Promise<string[][]> {
  const { rows } = await db.query<{ scopes: string[] }>(
    `select k.scopes from public.api_keys k join public.agents a on a.id = k.agent_id
      where a.handle = $1 order by k.created_at, k.id`,
    [handle],
  );
  return rows.map((row) => row.scopes);
}

suite("agents read and answer their inbox (0020) on a real Postgres", () => {
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
    database = `agentdistrict_inbox_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);
    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();

    await apply(SUPABASE_BOOTSTRAP, "bootstrap");
    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files.filter((file) => file < INBOX_MIGRATION)) {
      await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), name);
    }
    await apply(await readFile(SEED_FILE, "utf8"), "seed.sql");

    // Production as it stands: residents with the old self-registered key…
    for (const handle of RESIDENTS) await registerOld(handle);
    // …and one agent-bound key somebody minted narrower, which must stay so.
    const narrow = await db.query<{ id: string }>(
      `insert into public.api_keys (profile_id, label, key_hash, key_prefix, scopes, agent_id)
       select $1, 'narrow', $2, 'ad_live_nrw0', array['agents:read','events:write']::text[], a.id
         from public.agents a where a.handle = $3 returning id`,
      [REGISTRY_PROFILE_ID, `sha256$${randomBytes(32).toString("hex")}`, RESIDENTS[0]],
    );
    narrowKeyId = narrow.rows[0].id;
    residentsBefore = (
      await db.query(
        `select a.* from public.agents a where a.handle = any($1::text[]) order by a.id`,
        [RESIDENTS],
      )
    ).rows;

    // The doors 0020 closes, measured open.
    const jess = await jessThread();
    before.forgedAgentReply =
      (await probe(JESS, INSERT_MESSAGE, [jess.id, "agent", jess.agent_id, jess.agent_name])) === 1;
    before.forgedName =
      (await probe(JESS, INSERT_MESSAGE, [jess.id, "human", JESS, jess.agent_name])) === 1;
    before.repointed =
      (await probe(
        JESS,
        "update public.threads set agent_id = (select id from public.agents where handle = $2) where id = $1",
        [jess.id, RESIDENTS[1]],
      )) === 1;

    for (const pass of ["first", "again"]) {
      for (const name of files.filter((file) => file >= INBOX_MIGRATION)) {
        await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), `${name} (${pass})`);
      }
    }

    pool = new Pool({ connectionString: url.href, max: 4 });
    serviceClient = createPostgrestClient(pool, { role: "service_role" });
    const service = async () => serviceClient;
    asRegistry = new SupabaseRepository(service, { actAs: REGISTRY_PROFILE_ID, serviceClient: service });
    asHuman = new SupabaseRepository(service, { actAs: DEMO_PROFILE_ID, serviceClient: service });
  });

  afterAll(async () => {
    await pool?.end();
    await db?.end();
    if (database) await admin?.query(`drop database if exists ${database} with (force)`);
    await admin?.end();
  });

  it("gives the residents' self-registered keys the inbox scopes, once, and nothing else", async () => {
    for (const handle of RESIDENTS) {
      const [own] = await scopesOf(handle);
      expect([...own].sort()).toEqual([...REGISTERED_AGENT_SCOPES].sort());
      expect(own).toHaveLength(REGISTERED_AGENT_SCOPES.length); // not appended twice
    }
    const narrow = await db.query<{ scopes: string[] }>("select scopes from public.api_keys where id = $1", [
      narrowKeyId,
    ]);
    expect(narrow.rows[0].scopes).toEqual(["agents:read", "events:write"]);
    // Human keys (no agent) are untouched.
    const human = await db.query<{ count: string }>(
      "select count(*)::text as count from public.api_keys where agent_id is null and 'messages:read' = any(scopes)",
    );
    expect(human.rows[0].count).toBe("0");
    // The residents themselves are exactly as they were.
    const after = (
      await db.query(`select a.* from public.agents a where a.handle = any($1::text[]) order by a.id`, [
        RESIDENTS,
      ])
    ).rows;
    expect(after).toEqual(residentsBefore);
  });

  it("registers new agents with the inbox scopes, and still refuses anything wider", async () => {
    const { rawApiKey } = await asRegistry.registerAgent({
      handle: "fresh-inbox",
      name: "FreshInbox",
      tagline: "Registered after 0020, with a key that reads its inbox.",
      category: "research",
      skills: ["answering"],
    });
    const key = await asRegistry.verifyApiKey(rawApiKey);
    expect([...key!.scopes].sort()).toEqual([...REGISTERED_AGENT_SCOPES].sort());

    const { error } = await serviceClient.rpc("register_agent", {
      p_handle: "too-wide",
      p_name: "TooWide",
      p_tagline: "Asks for orders:write.",
      p_description: "",
      p_avatar_emoji: "🤖",
      p_avatar_gradient: "",
      p_category: "research",
      p_skills: ["x"],
      p_regions: ["US"],
      p_room_slug: "research-pit",
      p_pricing_model: "per_run",
      p_starting_price_cents: 0,
      p_endpoints: {},
      p_mcp_tools: [],
      p_key_hash: `sha256$${randomBytes(32).toString("hex")}`,
      p_key_prefix: "ad_live_wide",
      p_scopes: ["messages:write", "orders:write"],
      p_token_hash: randomBytes(32).toString("hex"),
    });
    expect(error?.message).toMatch(/cannot carry that scope/);
  });

  it("two agents each read and answer their own thread, and never the other's", async () => {
    const { agent: alpha } = await asRegistry.registerAgent({
      handle: "inbox-alpha",
      name: "InboxAlpha",
      tagline: "Answers Brevard questions from its inbox.",
      category: "research",
      skills: ["permits"],
    });
    const { agent: bravo } = await asRegistry.registerAgent({
      handle: "inbox-bravo",
      name: "InboxBravo",
      tagline: "Answers Martin County questions from its inbox.",
      category: "research",
      skills: ["parcels"],
    });
    // A human opens a thread with each, as the Passport's Message button does.
    const forAlpha = await asHuman.createThread({
      profileId: DEMO_PROFILE_ID,
      agentHandle: alpha.handle,
      subject: "Brevard pull",
      body: "Alpha, can you take 200 Brevard roofers today?",
    });
    const forBravo = await asHuman.createThread({
      profileId: DEMO_PROFILE_ID,
      agentHandle: bravo.handle,
      subject: "Martin parcels",
      body: "Bravo, this one is just for you.",
    });
    await asHuman.markThreadRead(forAlpha.id, DEMO_PROFILE_ID);

    // Each lists exactly its own, with the human on the other side.
    const alphaInbox = await asRegistry.listAgentThreads(alpha.id);
    expect(alphaInbox.map((thread) => thread.id)).toEqual([forAlpha.id]);
    expect(inboxThreadSummary(alphaInbox[0], alpha.id)).toMatchObject({
      with: { type: "human", handle: "austin" },
      awaiting_reply: true,
    });
    expect((await asRegistry.listAgentThreads(bravo.id)).map((thread) => thread.id)).toEqual([
      forBravo.id,
    ]);

    // Reading the other's thread is a miss, exactly like a thread that does not exist.
    expect(await asRegistry.getAgentThread(alpha.id, forBravo.id)).toBeNull();
    expect(await asRegistry.getAgentThread(alpha.id, "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await asRegistry.getAgentThread(alpha.id, "not-a-uuid")).toBeNull();

    // Alpha answers its own; the human sees it under Alpha's name, unread.
    await asRegistry.sendMessage({
      threadId: forAlpha.id,
      senderType: "agent",
      senderId: alpha.id,
      body: "Yes — starting now, CSV within the hour.",
    });
    const seen = (await asHuman.getThread(forAlpha.id))!;
    expect(seen.messages.at(-1)).toMatchObject({
      sender_type: "agent",
      sender_id: alpha.id,
      sender_name: "InboxAlpha",
      body: "Yes — starting now, CSV within the hour.",
    });
    expect(seen.unread_count).toBe(1);
    const alphaView = inboxThreadDetail((await asRegistry.getAgentThread(alpha.id, forAlpha.id))!, alpha.id);
    expect(alphaView.awaiting_reply).toBe(false);
    expect(alphaView.messages.map((message) => message.mine)).toEqual([false, true]);

    // Alpha writing into Bravo's thread is refused, and nothing lands there.
    await expect(
      asRegistry.sendMessage({
        threadId: forBravo.id,
        senderType: "agent",
        senderId: alpha.id,
        body: "Not my thread.",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await asHuman.getThread(forBravo.id))!.messages).toHaveLength(1);

    // Bravo answers its own just the same.
    await asRegistry.sendMessage({
      threadId: forBravo.id,
      senderType: "agent",
      senderId: bravo.id,
      body: "Got it, Bravo here.",
    });
    expect((await asHuman.getThread(forBravo.id))!.messages.at(-1)?.sender_name).toBe("InboxBravo");
  });

  it("measured the doors open before 0020", () => {
    expect(before).toEqual({ forgedAgentReply: true, forgedName: true, repointed: true });
  });

  it("refuses a signed-in caller posting as the agent, or under someone else's name", async () => {
    const jess = await jessThread();
    expect(await probe(JESS, INSERT_MESSAGE, [jess.id, "agent", jess.agent_id, jess.agent_name])).toBeNull();
    expect(await probe(JESS, INSERT_MESSAGE, [jess.id, "human", JESS, jess.agent_name])).toBeNull();
    expect(await probe(JESS, INSERT_MESSAGE, [jess.id, "human", DEMO_PROFILE_ID, jess.display_name])).toBeNull();
    // As herself, in her own thread: still fine.
    expect(await probe(JESS, INSERT_MESSAGE, [jess.id, "human", JESS, jess.display_name])).toBe(1);
    // A stranger to the thread: refused.
    expect(await probe(DEMO_PROFILE_ID, INSERT_MESSAGE, [jess.id, "human", DEMO_PROFILE_ID, "Austin"])).toBeNull();
  });

  it("lets an agent's owner answer as that agent, under its own name only", async () => {
    const { rows } = await db.query<{ id: string; name: string }>(
      "select id, name from public.agents where owner_id = $1 order by handle limit 1",
      [DEMO_PROFILE_ID],
    );
    const owned = rows[0];
    expect(owned, "an agent the demo human owns").toBeDefined();
    const thread = await db.query<{ id: string }>(
      "insert into public.threads (profile_id, agent_id, subject) values ($1, $2, 'owner probe') returning id",
      [JESS, owned.id],
    );
    const threadId = thread.rows[0].id;
    expect(await probe(DEMO_PROFILE_ID, INSERT_MESSAGE, [threadId, "agent", owned.id, owned.name])).toBe(1);
    expect(await probe(DEMO_PROFILE_ID, INSERT_MESSAGE, [threadId, "agent", owned.id, "Someone Else"])).toBeNull();
    // Jess is the human here, not the agent's owner.
    expect(await probe(JESS, INSERT_MESSAGE, [threadId, "agent", owned.id, owned.name])).toBeNull();
  });

  it("refuses re-pointing a thread, and still allows marking it read", async () => {
    const jess = await jessThread();
    expect(
      await probe(
        JESS,
        "update public.threads set agent_id = (select id from public.agents where handle = $2) where id = $1",
        [jess.id, RESIDENTS[1]],
      ),
    ).toBeNull();
    expect(await probe(JESS, "update public.threads set profile_id = $2 where id = $1", [jess.id, DEMO_PROFILE_ID])).toBeNull();
    expect(await probe(JESS, "update public.threads set unread_count = 0, updated_at = now() where id = $1", [jess.id])).toBe(1);
  });

  it("still lets no session mint a key with the inbox scopes (agent keys only)", async () => {
    const { rows } = await db.query<{ id: string }>(
      "select id from public.agents where owner_id = $1 order by handle limit 1",
      [DEMO_PROFILE_ID],
    );
    const insertKey = (scopes: string[], agentId: string | null) =>
      probe(
        DEMO_PROFILE_ID,
        `insert into public.api_keys (profile_id, label, key_hash, key_prefix, scopes, agent_id)
         values ($1, 'inbox', $2, 'ad_live_inb0', $3::text[], $4)`,
        [DEMO_PROFILE_ID, `sha256$${randomBytes(32).toString("hex")}`, scopes, agentId],
      );
    expect(await insertKey(["agents:read"], null)).toBe(1);
    expect(await insertKey(["messages:read"], null)).toBeNull();
    expect(await insertKey(["messages:read", "messages:write"], rows[0].id)).toBeNull();
  });
});
