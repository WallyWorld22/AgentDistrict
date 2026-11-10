import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoRepository } from "@/lib/data/demo";
import { isDistrictError } from "@/lib/data/errors";
import type { Repository } from "@/lib/data/repository";
import { SupabaseRepository } from "@/lib/data/supabase";
import { DEMO_PROFILE_ID, HOME_JOB_SLUGS, boutId, jobId } from "@/lib/seed";
import { MIGRATIONS_DIR, SEED_FILE, SUPABASE_BOOTSTRAP } from "./support/district-db";
import { createPostgrestClient } from "./support/postgrest";

/**
 * A malformed id is "not found", in both adapters (prod-01, jobs-01,
 * machine-surface-01, prod-03).
 *
 * Every id column is a Postgres `uuid`. Before the fix the Supabase adapter
 * sent `/jobs/not-a-uuid`'s id straight into `.eq("id", …)`; Postgres refused
 * the cast (`22P02`), `one()` rethrew it as an `UpstreamError`, and the page
 * was a 500 — while the demo adapter, which just finds no row, gave a 404. The
 * API went further and echoed the raw database message to the caller.
 *
 * This runs the same calls against the REAL Supabase adapter on a REAL
 * Postgres (through the PostgREST stand-in, as `anon` — a signed-out visitor,
 * the case production crashed on) and against the demo adapter, and requires
 * the two to agree: a read returns `null` (or an empty page), a write throws
 * `not_found`. Real ids still resolve, so the guard is not a blanket refusal.
 *
 * SKIPPED unless `LOCAL_PG_URL` is set:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

/** What production actually logged, plus the obvious probes. */
const MALFORMED = [
  "not-a-uuid",
  // Every id the District hands out is lower case; the demo adapter compares
  // strings, so an upper-case spelling must not resolve in one adapter only.
  "545F4024-15F0-573B-B645-CB63A2AFBC75",
  "does-not-exist",
  "545f4024-15f0-573b-b645-cb63a2afbc75\\",
  "545f4024-15f0-573b-b645-cb63a2afbc75%5C",
  "new\\",
  "",
];

let admin: Client;
let db: Client;
let pool: Pool;
let database: string;
let supabase: Repository;
let demo: Repository;

/** An open bounty both adapters seed, and the profile that posted it. */
const OPEN_JOB = jobId(HOME_JOB_SLUGS[0]);
let openJobPoster: string;

type Outcome = { value: unknown } | { code: string };

/** Run `call`, and report either what it returned or the error code it threw. */
async function outcome(call: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { value: await call() };
  } catch (error) {
    if (isDistrictError(error)) return { code: error.code };
    throw error;
  }
}

async function apply(sql: string, label: string): Promise<void> {
  try {
    await db.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${message}`);
  }
}

suite("malformed ids on a real Postgres", () => {
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
    database = `agentdistrict_ids_${randomBytes(4).toString("hex")}`;
    await admin.query(`create database ${database}`);

    const url = new URL(CONNECTION!);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.href });
    await db.connect();

    await apply(SUPABASE_BOOTSTRAP, "bootstrap");
    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files) {
      await apply(await readFile(path.join(MIGRATIONS_DIR, name), "utf8"), name);
    }
    await apply(await readFile(SEED_FILE, "utf8"), "seed.sql");

    pool = new Pool({ connectionString: url.href, max: 4 });
    // `anon`: what a signed-out visitor's page render reaches Postgres as.
    supabase = new SupabaseRepository(async () => createPostgrestClient(pool));
    demo = createDemoRepository();

    const { rows } = await db.query<{ poster_id: string; status: string }>(
      "select poster_id, status from public.jobs where id = $1",
      [OPEN_JOB],
    );
    expect(rows[0]?.status, "the control bounty is open").toBe("open");
    openJobPoster = rows[0].poster_id;
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await db?.end();
    if (database) await admin?.query(`drop database if exists ${database} with (force)`);
    await admin?.end();
  });

  /** Both adapters, the same call, the same answer. */
  async function both(call: (repo: Repository) => Promise<unknown>): Promise<Outcome> {
    const fromSupabase = await outcome(() => call(supabase));
    const fromDemo = await outcome(() => call(demo));
    expect(fromSupabase).toEqual(fromDemo);
    return fromSupabase;
  }

  it("still finds real rows by id (the guard is not a blanket refusal)", async () => {
    const job = await supabase.getJob(OPEN_JOB);
    expect(job?.id).toBe(OPEN_JOB);
    expect((await demo.getJob(OPEN_JOB))?.id).toBe(OPEN_JOB);
    expect((await supabase.getBout(boutId(1)))?.id).toBe(boutId(1));
  });

  it("reads a well-formed id that matches nothing as null", async () => {
    const nil = "00000000-0000-0000-0000-000000000000";
    expect(await both((repo) => repo.getJob(nil))).toEqual({ value: null });
    expect(await both((repo) => repo.getOrder(nil))).toEqual({ value: null });
    expect(await both((repo) => repo.getThread(nil))).toEqual({ value: null });
  });

  it.each(MALFORMED)("reads %j as not found instead of throwing", async (id) => {
    expect(await both((repo) => repo.getJob(id))).toEqual({ value: null });
    expect(await both((repo) => repo.getOrder(id))).toEqual({ value: null });
    expect(await both((repo) => repo.getThread(id))).toEqual({ value: null });
    expect(await both((repo) => repo.getBout(id))).toEqual({ value: null });
    // An empty `jobId` is "no filter" to both adapters, not a malformed one.
    if (id !== "") {
      expect(await both((repo) => repo.listOrders({ jobId: id }))).toEqual({ value: [] });
      expect(await both((repo) => repo.countOrders({ jobId: id }))).toEqual({ value: 0 });
    }
    expect(await both((repo) => repo.listBidsForJobs([id]))).toEqual({ value: { [id]: [] } });
  });

  it.each(MALFORMED)("refuses a write against %j with not_found", async (id) => {
    const notFound = { code: "not_found" };
    expect(
      await both((repo) =>
        repo.placeBid({
          jobId: id,
          agentHandle: "scout",
          amountCents: 500,
          etaSeconds: 600,
          note: "",
        }),
      ),
    ).toEqual(notFound);
    expect(
      await both((repo) => repo.acceptBid({ jobId: id, bidId: id, buyerId: DEMO_PROFILE_ID })),
    ).toEqual(notFound);
    // A real, open bounty and its real poster: only the bid id is bad.
    expect(
      await both((repo) => repo.acceptBid({ jobId: OPEN_JOB, bidId: id, buyerId: openJobPoster })),
    ).toEqual(notFound);
    expect(await both((repo) => repo.refreshOrder(id))).toEqual(notFound);
    expect(await both((repo) => repo.approveOrder(id, DEMO_PROFILE_ID))).toEqual(notFound);
    expect(await both((repo) => repo.disputeOrder(id, DEMO_PROFILE_ID, "never ran"))).toEqual(
      notFound,
    );
    expect(
      await both((repo) => repo.createReview({ orderId: id, rating: 4, body: "" }, DEMO_PROFILE_ID)),
    ).toEqual(notFound);
    expect(await both((repo) => repo.markThreadRead(id, DEMO_PROFILE_ID))).toEqual(notFound);
    expect(
      await both((repo) =>
        repo.sendMessage({
          threadId: id,
          senderType: "human",
          senderId: DEMO_PROFILE_ID,
          body: "hello",
        }),
      ),
    ).toEqual(notFound);
  });
});
