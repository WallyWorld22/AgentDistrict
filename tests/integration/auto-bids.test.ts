import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isAutoBid } from "@/lib/data/ext/cast";
import { inviteBidsFor } from "@/lib/data/ext/invite-bids";
import { SupabaseRepository } from "@/lib/data/supabase";
import { DEMO_PROFILE_ID, seed } from "@/lib/seed";
import { agentId } from "@/lib/seed/agents";
import { profileId } from "@/lib/seed/profiles";
import { MIGRATIONS_DIR, loadDistrict } from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * 0016 on a REAL Postgres, through the REAL Supabase adapter.
 *
 * - A bid is an auto-bid because it was written as one, not because of whose
 *   agent placed it: an owner bidding by hand as a founding-cast agent gets no
 *   label (the reviewer's probe: austin bidding as @scout), and only the
 *   service role can set or change the flag.
 * - The rows production already holds are backfilled: the seeded bids, and
 *   the auto-bids `inviteBidsFor` wrote before the flag existed.
 * - `network_stats().agentsOnline` counts what the Lounge counts.
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const MIGRATION = "0016_auto_bid_flag.sql";
const JESS = profileId("buildwithjess");
const FLOWFORGE = agentId("flowforge");
const DATAFOX = agentId("datafox");

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
let service: ReturnType<typeof createPostgrestClient>;
/** Rows written before 0016, the way production holds them. */
const before = { handTyped: "", invited: "" };

async function apply(sql: string, label: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`);
  }
}

/** Runs `sql` as Jess's signed-in session, rolled back; null when refused. */
async function asJess(sql: string, params: unknown[] = []): Promise<number | null> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [JESS]);
    const result = await db.query(sql, params);
    return result.rowCount ?? 0;
  } catch {
    return null;
  } finally {
    await db.query("rollback");
  }
}

/** An open bounty `agent` may bid on: not its owner's, no live bid from it yet. */
async function openJobFor(agent: string, owner: string, offset = 0): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `select id from public.jobs j
      where status = 'open' and poster_id <> $2
        and not exists (select 1 from public.bids b
                         where b.job_id = j.id and b.agent_id = $1 and b.status = 'pending')
      order by created_at desc, id offset $3 limit 1`,
    [agent, owner, offset],
  );
  if (!rows[0]) throw new Error("no open bounty to bid on");
  return rows[0].id;
}

async function autoBidOf(id: string): Promise<boolean> {
  const { rows } = await db.query<{ auto_bid: boolean }>(
    "select auto_bid from public.bids where id = $1",
    [id],
  );
  return rows[0].auto_bid;
}

function repoActingAs(profile: string): SupabaseRepository {
  return new SupabaseRepository(async () => service, {
    actAs: profile,
    serviceClient: async () => service,
  });
}

suite("auto-bids and the online count (0016) on a real Postgres", () => {
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
    database = `agentdistrict_autobid_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);

    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();
    await loadDistrict(db);

    // Production before 0016: no bid carries the flag yet.
    await db.query("update public.bids set auto_bid = false");
    // A bid an owner typed by hand as a founding-cast agent, and one
    // `inviteBidsFor` placed, word for word what `planAutoBids` writes.
    const handTyped = await db.query<{ id: string }>(
      `insert into public.bids (job_id, agent_id, amount_cents, eta_seconds, note)
       values ($1, $2, 100, 60, 'I typed this offer myself') returning id`,
      [await openJobFor(FLOWFORGE, JESS), FLOWFORGE],
    );
    before.handTyped = handTyped.rows[0].id;
    const invited = await db.query<{ id: string }>(
      `insert into public.bids (job_id, agent_id, amount_cents, eta_seconds, note)
       values ($1, $2, 100, 60,
               'Priced for the whole batch. csv + dedupe, plus a QA pass before delivery.')
       returning id`,
      [await openJobFor(DATAFOX, "00000000-0000-0000-0000-000000000000"), DATAFOX],
    );
    before.invited = invited.rows[0].id;

    // Then 0016 again — twice: every migration re-runs.
    const sql = await readFile(path.join(MIGRATIONS_DIR, MIGRATION), "utf8");
    await apply(sql, `${MIGRATION} (again)`);
    await apply(sql, `${MIGRATION} (third time)`);

    pool = new Pool({ connectionString: url.href, max: 4 });
    service = createPostgrestClient(pool, { role: "service_role" });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await db?.end();
    if (database) await admin?.query(`drop database if exists ${database} with (force)`);
    await admin?.end();
  });

  it("backfills the seeded bids and the auto-bids already placed, and nothing a person typed", async () => {
    const seeded = seed.bids.filter((bid) => bid.auto_bid).map((bid) => bid.id);
    expect(seeded.length).toBeGreaterThan(0);
    const { rows } = await db.query<{ n: string }>(
      "select count(*) as n from public.bids where auto_bid and id = any($1::uuid[])",
      [seeded],
    );
    expect(Number(rows[0].n)).toBe(seeded.length);

    expect(await autoBidOf(before.invited)).toBe(true);
    expect(await autoBidOf(before.handTyped)).toBe(false);
  });

  it("does not label a bid an owner types by hand as a founding-cast agent", async () => {
    // The reviewer's probe: austin owns @scout and bids as it on someone
    // else's open bounty.
    const asDemo = repoActingAs(DEMO_PROFILE_ID);
    const jobId = await openJobFor(agentId("scout"), DEMO_PROFILE_ID);
    const bid = await asDemo.placeBid({
      jobId,
      agentHandle: "scout",
      amountCents: 100,
      etaSeconds: 60,
      note: "I typed this offer myself",
    });
    expect(bid.auto_bid).toBe(false);
    expect(await autoBidOf(bid.id)).toBe(false);

    const read = (await asDemo.getJob(jobId))!.bids.find((row) => row.id === bid.id)!;
    expect(isAutoBid(read)).toBe(false);
  });

  it("labels the bids the District places when a bounty goes up", async () => {
    const asJessRepo = repoActingAs(JESS);
    const job = await asJessRepo.createJob(
      {
        title: "Find 200 roofing companies in Tampa",
        description: "Lead research: owner contact where public, deduped, one CSV.",
        category: "research",
        budget_cents: 2000,
        deadline_seconds: 3600,
        required_output: { format: "csv" },
        data_policy: { pii: "none", retention_days: 0, allow_subcontracting: false },
      },
      JESS,
    );
    await inviteBidsFor(asJessRepo, job.id, JESS);
    const bids = (await asJessRepo.getJob(job.id))!.bids;
    expect(bids.length).toBeGreaterThan(0);
    for (const bid of bids) expect(isAutoBid(bid)).toBe(true);
  });

  it("refuses a person's session setting or changing the flag", async () => {
    const jobId = await openJobFor(FLOWFORGE, JESS, 1);
    const insert = `insert into public.bids (job_id, agent_id, amount_cents, eta_seconds, note, auto_bid)
                    values ($1, $2, 100, 60, 'Direct PostgREST probe.', $3)`;
    // The same insert without the flag goes in, so the refusal is the flag's.
    expect(await asJess(insert, [jobId, FLOWFORGE, false])).toBe(1);
    expect(await asJess(insert, [jobId, FLOWFORGE, true])).toBeNull();
    expect(
      await asJess("update public.bids set auto_bid = true where id = $1", [before.handTyped]),
    ).toBeNull();
    expect(await autoBidOf(before.handTyped)).toBe(false);
  });

  it("counts an agent online only if the Lounge would: seen in the last half hour", async () => {
    const stats = async () => (await repoActingAs(DEMO_PROFILE_ID).getNetworkStats()).agentsOnline;

    // `set_updated_at` (0001) stamps now() on every update; this test sets
    // the stamp itself, the way weeks without a heartbeat would.
    await db.query("alter table public.presence disable trigger set_updated_at");
    await db.query("update public.presence set updated_at = now() - interval '18 days'");
    expect(await stats()).toBe(0);

    const { rows } = await db.query<{ agent_id: string }>(
      "select agent_id from public.presence where status <> 'offline' order by agent_id limit 3",
    );
    expect(rows).toHaveLength(3);
    await db.query("update public.presence set updated_at = now() where agent_id = any($1::uuid[])", [
      rows.map((row) => row.agent_id),
    ]);
    expect(await stats()).toBe(3);

    // Offline is never online, however recently it was seen.
    await db.query("update public.presence set status = 'offline' where agent_id = $1", [
      rows[0].agent_id,
    ]);
    expect(await stats()).toBe(2);
    await db.query("alter table public.presence enable trigger set_updated_at");
  });
});
