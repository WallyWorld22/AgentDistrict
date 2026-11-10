import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoRepository } from "@/lib/data/demo";
import {
  ConflictError,
  ForbiddenError,
  RateLimitError,
  UpstreamError,
  ValidationError,
} from "@/lib/data/errors";
import { FREE_ORDERS_PER_HOUR, MAX_JOB_BUDGET_CENTS, TOPUP_MEMO } from "@/lib/data/limits";
import { SupabaseRepository } from "@/lib/data/supabase";
import { DEMO_PROFILE_ID, REGISTRY_PROFILE_ID, SEED_EPOCH_MS, agentId, profileId } from "@/lib/seed";
import { MIGRATIONS_DIR, SEED_FILE, SUPABASE_BOOTSTRAP } from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * Limits and abuse guards (0014), against a REAL Postgres and through the REAL
 * Supabase adapter.
 *
 * - sec-03: `register_agent()` was callable straight through PostgREST with
 *   the public anon key, skipping the app's per-IP rate limit. 0014 makes it
 *   server-only; the adapter calls it through the service-role client.
 * - economy-01: `top_up_wallet()` took any amount and any memo. 0014 caps it
 *   at $100 per top-up and $500 per profile per UTC day, with a fixed memo.
 * - gigs-orders-03: `increment_gig_runs()` counted every order. 0014 counts
 *   approved runs only.
 * - The top-up cap reads the ledger, so 0014 takes the ledger's write
 *   privileges away from a session: back-dating the day's `topup` rows used
 *   to reopen the cap, and an inserted row could say anything.
 * - The bid caps, one live bid per agent per bounty and the budget ceiling
 *   hold in the database too, against a direct write and a race.
 * - The adapter-level guards that come before any write (bid caps, one live
 *   bid, self-orders, the free-order allowance, the budget ceiling) behave as
 *   the demo adapter's do.
 *
 * The database is built the way production gets it: 0001–0013, seeded, then
 * 0014 (and anything after it) — twice.
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const LIMITS_MIGRATION = "0014_abuse_limits.sql";
const REGISTER_AGENT =
  "public.register_agent(text, text, text, text, text, text, text, text[], text[], " +
  "text, text, integer, jsonb, text[], text, text, text[], text, text)";
const DEVDAN = profileId("devdan");
/** Owns FlowForge; touched by no other test here. */
const JESS = profileId("buildwithjess");
const FLOWFORGE = agentId("flowforge");

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
let files: string[];
/** The cookie-bound client of a visitor with no session. */
let anonClient: ReturnType<typeof createPostgrestClient>;
let serviceClient: ReturnType<typeof createPostgrestClient>;
/** `getRepoActingAs(DEMO_PROFILE_ID)`: the service role, acting as the demo human. */
let asDemo: SupabaseRepository;

/** What production allowed before 0014. */
const before = {
  anonRegistered: false,
  topUp: { amount: 0, memo: "" },
  /** A session rewrote its own ledger rows. */
  ledgerRewritten: 0,
  /** A session inserted a ledger row of its own wording. */
  ledgerForged: false,
  /** A bid over the bounty's budget and deadline went in straight. */
  bidOverCap: false,
  /** A second pending bid from the same agent on the same bounty went in. */
  secondLiveBid: false,
  /** A $20,000,000 bounty went in straight. */
  jobOverCeiling: false,
};

async function apply(sql: string, label: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`);
  }
}

/** The 18 arguments the adapter sends, as PostgREST JSON. */
function registerArgs(handle: string, n: string) {
  return {
    p_handle: handle,
    p_name: "Probe",
    p_tagline: "Direct PostgREST probe.",
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
    p_key_hash: `sha256$${n.repeat(64)}`,
    p_key_prefix: "ad_live_prbe",
    p_scopes: ["agents:read", "bids:write"],
    p_token_hash: n.repeat(64).replace(/./, "f"),
  };
}

async function agentCount(handle: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    "select count(*)::text as count from public.agents where handle = $1",
    [handle],
  );
  return Number(rows[0].count);
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

/** An open bounty FlowForge can bid on and has no bid on yet. */
async function openJobForFlowForge(offset: number) {
  const { rows } = await db.query<{ id: string; budget_cents: number; deadline_seconds: number }>(
    `select id, budget_cents, deadline_seconds from public.jobs j
      where status = 'open' and poster_id not in ($1, $2)
        and not exists (select 1 from public.bids b where b.job_id = j.id and b.agent_id = $3)
      order by created_at desc, id offset $4 limit 1`,
    [DEMO_PROFILE_ID, JESS, FLOWFORGE, offset],
  );
  expect(rows[0], "an open bounty for FlowForge").toBeDefined();
  return rows[0];
}

const INSERT_BID =
  `insert into public.bids (job_id, agent_id, amount_cents, eta_seconds, note, status)
   values ($1, $2, $3, $4, 'Direct PostgREST probe.', 'pending')`;
const INSERT_JOB =
  `insert into public.jobs (title, description, category, budget_cents, deadline_seconds, poster_id, status)
   values ('Direct probe', 'Over the ceiling.', 'research', $1, 3600, $2, 'open')`;

/** A run of `as` with a JWT subject, committed or rolled back. */
async function asUser<T>(sub: string, work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
    const result = await work();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function gigRow(slug: string) {
  const { rows } = await db.query<{ id: string; agent_id: string; runs_count: number }>(
    "select id, agent_id, runs_count from public.gigs where slug = $1",
    [slug],
  );
  return rows[0];
}

suite("limits and abuse guards (0014) on a real Postgres", () => {
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
    database = `agentdistrict_limits_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);

    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();

    // Production before the fix: 0001–0013, seeded.
    await apply(SUPABASE_BOOTSTRAP, "bootstrap");
    files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files.filter((file) => file < LIMITS_MIGRATION)) {
      await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), name);
    }
    await apply(await readFile(SEED_FILE, "utf8"), "seed.sql");

    pool = new Pool({ connectionString: url.href, max: 4 });
    anonClient = createPostgrestClient(pool);
    serviceClient = createPostgrestClient(pool, { role: "service_role" });

    // The holes, as production had them.
    const direct = await anonClient.rpc("register_agent", registerArgs("anon-before", "1"));
    before.anonRegistered = !direct.error && (await agentCount("anon-before")) === 1;
    const topped = await asUser(DEVDAN, () =>
      db.query<{ balance_cents: number }>("select balance_cents from public.top_up_wallet($1, $2)", [
        100_000_000,
        "Wire from the bank",
      ]),
    );
    before.topUp.amount = topped.rows.length ? 100_000_000 : 0;
    const memo = await db.query<{ memo: string }>(
      "select memo from public.wallet_transactions where profile_id = $1 and kind = 'topup' order by created_at desc limit 1",
      [DEVDAN],
    );
    before.topUp.memo = memo.rows[0]?.memo ?? "";

    // The ledger the cap reads, and the limits the data layer alone enforced.
    before.ledgerRewritten =
      (await probe(
        DEVDAN,
        "update public.wallet_transactions set created_at = now() - interval '2 days' where kind = 'topup'",
      )) ?? 0;
    before.ledgerForged =
      (await probe(
        DEVDAN,
        `insert into public.wallet_transactions (profile_id, kind, amount_cents, memo)
         values ($1, 'topup', 100, 'Wire from Chase Bank')`,
        [DEVDAN],
      )) === 1;
    {
      const job = await openJobForFlowForge(0);
      before.bidOverCap =
        (await probe(JESS, INSERT_BID, [job.id, FLOWFORGE, 99_999_999, 99_999_999])) === 1;
      before.secondLiveBid =
        (await probe(
          JESS,
          `with first as (${INSERT_BID} returning 1) ${INSERT_BID}`,
          [job.id, FLOWFORGE, 1, 60],
        )) === 1;
    }
    before.jobOverCeiling = (await probe(JESS, INSERT_JOB, [2_000_000_000, JESS])) === 1;

    // Then 0014 and everything after it — twice: every migration re-runs.
    for (const pass of ["first", "again"]) {
      for (const name of files.filter((file) => file >= LIMITS_MIGRATION)) {
        await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), `${name} (${pass})`);
      }
    }

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

  it("lands on a seeded 0013 District with both holes open", () => {
    expect(files).toContain(LIMITS_MIGRATION);
    expect(before.anonRegistered).toBe(true);
    expect(before.topUp).toEqual({ amount: 100_000_000, memo: "Wire from the bank" });
    expect(before.ledgerRewritten).toBeGreaterThan(0);
    expect(before.ledgerForged).toBe(true);
    expect(before.bidOverCap).toBe(true);
    expect(before.secondLiveBid).toBe(true);
    expect(before.jobOverCeiling).toBe(true);
  });

  /* --------------------------------------------------------------- sec-03 */

  it("closes register_agent() to anon and authenticated, and keeps it for the service role", async () => {
    const { rows } = await db.query(
      `select has_function_privilege('anon', $1::regprocedure, 'execute') as anon,
              has_function_privilege('authenticated', $1::regprocedure, 'execute') as authenticated,
              has_function_privilege('service_role', $1::regprocedure, 'execute') as service_role,
              (select count(*)::int from pg_proc
                where pronamespace = 'public'::regnamespace and proname = 'register_agent') as overloads`,
      [REGISTER_AGENT],
    );
    expect(rows[0]).toEqual({ anon: false, authenticated: false, service_role: true, overloads: 1 });
  });

  it("refuses a direct PostgREST call with the anon key", async () => {
    const { data, error } = await anonClient.rpc("register_agent", registerArgs("anon-after", "2"));
    expect(data).toBeNull();
    expect(error?.message).toMatch(/permission denied for function register_agent/);
    expect(await agentCount("anon-after")).toBe(0);
  });

  it("registers through the adapter, server-side, exactly as before", async () => {
    // The app's own repository: the anon-key client for everything else, the
    // service role for registration.
    const app = new SupabaseRepository(async () => anonClient, {
      serviceClient: async () => serviceClient,
    });
    const { agent, rawApiKey, claimToken } = await app.registerAgent({
      handle: "tide-reader",
      name: "TideReader",
      tagline: "Coastal permit research for Florida contractors.",
      category: "research",
      skills: ["permit data", "parcel matching"],
    });
    expect(agent.handle).toBe("tide-reader");
    expect(agent.owner_id).toBe(REGISTRY_PROFILE_ID);
    expect(rawApiKey).toMatch(/^ad_live_/);
    expect(claimToken.length).toBeGreaterThan(20);

    const key = await db.query<{ agent_id: string; profile_id: string }>(
      "select agent_id, profile_id from public.api_keys where agent_id = $1",
      [agent.id],
    );
    expect(key.rows).toEqual([{ agent_id: agent.id, profile_id: REGISTRY_PROFILE_ID }]);

    await expect(
      app.registerAgent({
        handle: "tide-reader",
        name: "Again",
        tagline: "A taken handle is a conflict.",
        category: "research",
        skills: ["x"],
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // No service role configured: refused, never attempted as anon.
    const anonOnly = new SupabaseRepository(async () => anonClient);
    await expect(
      anonOnly.registerAgent({
        handle: "no-service-role",
        name: "Nope",
        tagline: "Should never land.",
        category: "research",
        skills: ["x"],
      }),
    ).rejects.toBeInstanceOf(UpstreamError);
    expect(await agentCount("no-service-role")).toBe(0);
  });

  /* ------------------------------------------------------------ economy-01 */

  it("caps top-ups in the database, with the demo adapter's words", async () => {
    const demo = createDemoRepository({ now: () => SEED_EPOCH_MS });
    const both = async (amount: number) => {
      const results: string[] = [];
      for (const repo of [asDemo, demo]) {
        try {
          await repo.topUp(DEMO_PROFILE_ID, amount);
          results.push("ok");
        } catch (error) {
          expect(error).toBeInstanceOf(ValidationError);
          results.push((error as Error).message);
        }
      }
      expect(results[0], `top-up of ${amount}`).toBe(results[1]);
      return results[0];
    };

    expect(await both(100_000_000)).toBe("Each top-up is capped at $100.00 of demo credits.");
    expect(await both(10_001)).toBe("Each top-up is capped at $100.00 of demo credits.");
    for (let index = 0; index < 4; index += 1) expect(await both(10_000)).toBe("ok");
    expect(await both(9_000)).toBe("ok");
    expect(await both(1_500)).toBe(
      "Demo top-ups are capped at $500.00 a day. You can add up to $10.00 more today.",
    );
    expect(await both(1_000)).toBe("ok");
    expect(await both(1)).toBe(
      "Demo top-ups are capped at $500.00 a day. You have reached today's cap — try again tomorrow (UTC).",
    );

    const memos = await db.query<{ memo: string; total: string }>(
      `select memo, sum(amount_cents)::text as total from public.wallet_transactions
        where profile_id = $1 and kind = 'topup'
          and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
        group by memo`,
      [DEMO_PROFILE_ID],
    );
    expect(memos.rows).toEqual([{ memo: TOPUP_MEMO, total: "50000" }]);
  });

  it("ignores a caller-chosen memo and refuses an over-cap amount from a session", async () => {
    const maria = profileId("maria-work");
    await asUser(maria, () => db.query("select public.top_up_wallet($1, $2)", [500, "Wire from the bank"]));
    const { rows } = await db.query<{ memo: string }>(
      "select memo from public.wallet_transactions where profile_id = $1 and kind = 'topup' order by created_at desc limit 1",
      [maria],
    );
    expect(rows[0].memo).toBe(TOPUP_MEMO);

    await expect(
      asUser(maria, () => db.query("select public.top_up_wallet($1)", [100_000_000])),
    ).rejects.toThrow(/top-up cap: per top-up/);
  });

  it("keeps the ledger the cap reads out of a session's hands", async () => {
    const { rows: grants } = await db.query(
      `select has_table_privilege('authenticated', 'public.wallet_transactions', 'insert') as insert,
              has_table_privilege('authenticated', 'public.wallet_transactions', 'update') as update,
              has_table_privilege('authenticated', 'public.wallet_transactions', 'delete') as delete,
              has_table_privilege('authenticated', 'public.wallet_transactions', 'select') as select,
              (select count(*)::int from pg_policies
                where schemaname = 'public' and tablename = 'wallet_transactions'
                  and cmd <> 'SELECT') as write_policies`,
    );
    expect(grants[0]).toEqual({ insert: false, update: false, delete: false, select: true, write_policies: 0 });

    // The reviewer's reproduction: reach the cap, back-date the day's rows,
    // forge a ledger line, delete the rows — each refused, and the cap holds.
    for (let index = 0; index < 5; index += 1) {
      await asUser(JESS, () => db.query("select public.top_up_wallet($1)", [10_000]));
    }
    await expect(
      asUser(JESS, () => db.query("select public.top_up_wallet($1)", [1])),
    ).rejects.toThrow(/top-up cap: daily, 0 left/);

    await expect(
      asUser(JESS, () =>
        db.query(
          "update public.wallet_transactions set created_at = now() - interval '2 days' where kind = 'topup'",
        ),
      ),
    ).rejects.toThrow(/permission denied for table wallet_transactions/);
    await expect(
      asUser(JESS, () =>
        db.query(
          `insert into public.wallet_transactions (profile_id, kind, amount_cents, memo)
           values ($1, 'topup', 100, 'Wire from Chase Bank')`,
          [JESS],
        ),
      ),
    ).rejects.toThrow(/permission denied for table wallet_transactions/);
    await expect(
      asUser(JESS, () => db.query("delete from public.wallet_transactions where kind = 'topup'")),
    ).rejects.toThrow(/permission denied for table wallet_transactions/);

    await expect(
      asUser(JESS, () => db.query("select public.top_up_wallet($1)", [10_000])),
    ).rejects.toThrow(/top-up cap: daily, 0 left/);
    const { rows } = await db.query<{ forged: number; total: string }>(
      `select count(*) filter (where memo <> $2)::int as forged, sum(amount_cents)::text as total
         from public.wallet_transactions
        where profile_id = $1 and kind = 'topup'
          and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')`,
      [JESS, TOPUP_MEMO],
    );
    expect(rows[0]).toEqual({ forged: 0, total: "50000" });

    // A session still reads its own ledger.
    const own = await asUser(JESS, () =>
      db.query("select count(*)::int as n from public.wallet_transactions"),
    );
    expect(own.rows[0].n).toBeGreaterThanOrEqual(5);
  });

  /* -------------------------------------------------------- gigs-orders-03 */

  it("counts a gig run only once the order is approved", async () => {
    const gig = await gigRow("double-sourced-contact-verification");
    const { rows } = await db.query<{ id: string }>(
      `insert into public.orders
         (buyer_id, agent_id, gig_id, package_tier, brief, amount_cents, status, eta_seconds)
       values ($1, $2, $3, 'basic', 'Runs probe', 45, 'queued', 30) returning id`,
      [DEVDAN, gig.agent_id, gig.id],
    );
    const orderId = rows[0].id;

    await expect(
      asUser(DEVDAN, () => db.query("select public.increment_gig_runs($1, $2)", [gig.id, orderId])),
    ).rejects.toThrow(/has been approved/);
    expect((await gigRow("double-sourced-contact-verification")).runs_count).toBe(gig.runs_count);

    await db.query("update public.orders set status = 'approved' where id = $1", [orderId]);
    for (let call = 0; call < 2; call += 1) {
      await asUser(DEVDAN, () =>
        db.query("select public.increment_gig_runs($1, $2)", [gig.id, orderId]),
      );
    }
    expect((await gigRow("double-sourced-contact-verification")).runs_count).toBe(
      gig.runs_count + 1,
    );
  });

  /* ------------------------------------- the adapter's guards, as the demo's */

  it("refuses an owner's order of their own gig", async () => {
    const order = asDemo.orderGig({
      gigSlug: "find-100-qualified-local-businesses",
      tier: "basic",
      brief: "Buying from myself.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });
    await expect(order).rejects.toBeInstanceOf(ForbiddenError);
    await expect(order).rejects.toThrow(/This is your gig/);
  });

  it("limits free orders per buyer per hour", async () => {
    const gig = await gigRow("normalize-and-dedupe-csv");
    for (let index = 0; index < FREE_ORDERS_PER_HOUR; index += 1) {
      await db.query(
        `insert into public.orders
           (buyer_id, agent_id, gig_id, package_tier, brief, amount_cents, status, eta_seconds)
         values ($1, $2, $3, 'basic', 'Free probe', 0, 'queued', 21)`,
        [DEMO_PROFILE_ID, gig.agent_id, gig.id],
      );
    }
    const order = asDemo.orderGig({
      gigSlug: "normalize-and-dedupe-csv",
      tier: "basic",
      brief: "One more free run.",
      buyerId: DEMO_PROFILE_ID,
      approved: true,
    });
    await expect(order).rejects.toBeInstanceOf(RateLimitError);
    await expect(order).rejects.toThrow(/Free gigs are limited to 10 orders an hour/);
  });

  it("caps a bid at the budget and the deadline, and allows one live bid per agent", async () => {
    const { rows } = await db.query<{ id: string; budget_cents: number; deadline_seconds: number }>(
      `select id, budget_cents, deadline_seconds from public.jobs
        where status = 'open' and poster_id <> $1 order by created_at limit 1`,
      [DEMO_PROFILE_ID],
    );
    const job = rows[0];
    const base = { jobId: job.id, agentHandle: "scout", note: "Probe." };

    await expect(
      asDemo.placeBid({ ...base, amountCents: job.budget_cents + 1, etaSeconds: 600 }),
    ).rejects.toThrow(/at most the bounty's/);
    await expect(
      asDemo.placeBid({ ...base, amountCents: 100, etaSeconds: job.deadline_seconds + 1 }),
    ).rejects.toThrow(/fit the bounty's .* deadline/);

    await db.query(
      `insert into public.bids (job_id, agent_id, amount_cents, eta_seconds, note, status)
       values ($1, $2, 100, 600, 'Already here.', 'pending')`,
      [job.id, agentId("scout")],
    );
    await expect(
      asDemo.placeBid({ ...base, amountCents: 100, etaSeconds: 600 }),
    ).rejects.toThrow("Scout already has a live bid on this bounty.");
  });

  it("refuses a direct bid over the bounty's budget or deadline", async () => {
    const job = await openJobForFlowForge(0);
    await expect(
      asUser(JESS, () => db.query(INSERT_BID, [job.id, FLOWFORGE, job.budget_cents + 1, 60])),
    ).rejects.toThrow(/bid cap: a bid can be at most the bounty's budget/);
    await expect(
      asUser(JESS, () =>
        db.query(INSERT_BID, [job.id, FLOWFORGE, 1, job.deadline_seconds + 1]),
      ),
    ).rejects.toThrow(/bid cap: delivery has to fit the bounty's deadline/);
    // At the limits exactly, it lands.
    await asUser(JESS, () =>
      db.query(INSERT_BID, [job.id, FLOWFORGE, job.budget_cents, job.deadline_seconds]),
    );
  });

  it("allows one live bid per agent per bounty, even when two race", async () => {
    // The bounty the last test bid on: a second pending bid is refused…
    const { rows } = await db.query<{ job_id: string }>(
      "select job_id from public.bids where agent_id = $1 and status = 'pending' and note = 'Direct PostgREST probe.'",
      [FLOWFORGE],
    );
    expect(rows).toHaveLength(1);
    await expect(
      asUser(JESS, () => db.query(INSERT_BID, [rows[0].job_id, FLOWFORGE, 1, 60])),
    ).rejects.toThrow(/one live bid/);

    // …and so is the loser of two concurrent first bids on a fresh bounty.
    const job = await openJobForFlowForge(0);
    const [first, second] = [await pool.connect(), await pool.connect()];
    try {
      for (const client of [first, second]) {
        await client.query("begin");
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [JESS]);
      }
      await first.query(INSERT_BID, [job.id, FLOWFORGE, 1, 60]);
      const racing = second.query(INSERT_BID, [job.id, FLOWFORGE, 2, 60]).then(
        () => "landed",
        (error: Error) => error.message,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await first.query("commit");
      expect(await racing).toMatch(/one live bid/);
      await second.query("rollback");
    } finally {
      first.release();
      second.release();
    }
    const live = await db.query<{ n: number }>(
      "select count(*)::int as n from public.bids where job_id = $1 and agent_id = $2 and status = 'pending'",
      [job.id, FLOWFORGE],
    );
    expect(live.rows[0].n).toBe(1);
  });

  it("refuses a direct bounty over the budget ceiling", async () => {
    await expect(
      asUser(JESS, () => db.query(INSERT_JOB, [2_000_000_000, JESS])),
    ).rejects.toThrow(/jobs_budget_ceiling/);
    await expect(
      asUser(JESS, () => db.query(INSERT_JOB, [MAX_JOB_BUDGET_CENTS + 1, JESS])),
    ).rejects.toThrow(/jobs_budget_ceiling/);
    const { rowCount } = await asUser(JESS, () =>
      db.query(`${INSERT_JOB} returning id`, [MAX_JOB_BUDGET_CENTS, JESS]),
    );
    expect(rowCount).toBe(1);
  });

  it("refuses a bounty budget over the ceiling before touching the database", async () => {
    await expect(
      asDemo.createJob(
        {
          title: "A billion-dollar bounty",
          description: "Over the ceiling.",
          category: "research",
          budget_cents: 100_000_000_000,
          deadline_seconds: 3600,
          required_output: { format: "csv" },
          data_policy: { pii: "none", retention_days: 0, allow_subcontracting: false },
        },
        DEMO_PROFILE_ID,
      ),
    ).rejects.toThrow("Budgets top out at $100,000.00 per bounty.");
  });
});
