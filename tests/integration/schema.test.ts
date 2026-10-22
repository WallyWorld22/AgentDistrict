import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PROFILE_ID, profileId, seedCounts } from "@/lib/seed";
import { analyticsDates } from "@/lib/data/analytics";
import { ANALYTICS_DAYS, type DistrictAnalytics } from "@/lib/data/types";

/**
 * Schema validation against a REAL Postgres.
 *
 * `supabase/migrations/*.sql` and `supabase/seed.sql` are the deployment
 * artefacts nothing else in the test suite executes: the unit tests parse the
 * DDL as text and the app never touches it in demo mode. This suite applies
 * them for real — every migration in filename order, then the seed — and then
 * asserts the things a broken migration would silently take away:
 *
 *   1. every table BUILD_SPEC §2 requires exists and carries at least the
 *      seeded number of rows (and exactly the rows `lib/seed` emits);
 *   2. row-level security is enabled on **every** table in `public`;
 *   3. RLS behaviour as real `anon` and `authenticated` sessions;
 *   4. the money path — `hold_funds()` → `settle_hold()` — moves the wallet and
 *      the ledger the way the app assumes it does;
 *   5. the privilege fences: money, reputation, pricing, events, reviews,
 *      self-bids, the spend day, the service-role `p_actor` path and GUC
 *      escalation;
 *   6. the entrance (`register_agent()`, `claim_agent()`, registry pinning,
 *      forged-key inserts), `search_district()`, the `is_admin` fence,
 *      `district_analytics()`, channel follows, and re-runnability.
 *
 * It is SKIPPED unless `LOCAL_PG_URL` is set, so `npm run test` stays hermetic:
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 *   bash scripts/db-local.sh stop
 */

const CONNECTION = process.env.LOCAL_PG_URL;
const suite = CONNECTION ? describe : describe.skip;

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const SEED_FILE = path.join(process.cwd(), "supabase", "seed.sql");

/**
 * What a Supabase project provides before any of our migrations run.
 *
 * Reproduced rather than mocked, because the migrations genuinely depend on it:
 * `profiles.id` has a foreign key to `auth.users`, every RLS policy is written
 * against `auth.uid()`, and the `anon` / `authenticated` roles are the ones the
 * policies name. The default privileges are set **before** the migrations so
 * that 0005's column-level `revoke`s land on top of real grants, exactly as
 * they do on a live project.
 */
const SUPABASE_BOOTSTRAP = `
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- The subset of auth.users the seed writes. A real project has many more
-- columns; every one referenced by supabase/seed.sql is here.
create table if not exists auth.users (
  instance_id             uuid,
  id                      uuid primary key,
  aud                     text,
  role                    text,
  email                   text unique,
  encrypted_password      text,
  email_confirmed_at      timestamptz,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),
  raw_app_meta_data       jsonb,
  raw_user_meta_data      jsonb,
  is_super_admin          boolean,
  confirmation_token      text,
  email_change            text,
  email_change_token_new  text,
  recovery_token          text
);

-- The one function every policy in 0002 is written against.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
`;

/** BUILD_SPEC §2 "Seed content" minimums, per table. */
const MINIMUM_ROWS: Record<string, number> = {
  profiles: 1,
  stores: 5,
  agents: 24,
  rooms: 6,
  presence: 24,
  guilds: 6,
  guild_members: 12,
  gigs: 30,
  jobs: 12,
  bids: 12,
  market_items: 12,
  channels: 8,
  channel_hosts: 8,
  channel_chat: 12,
  competitions: 3,
  competition_entries: 6,
  lounge_messages: 40,
  threads: 6,
  messages: 12,
  wallets: 1,
  orders: 3,
  wallet_transactions: 12,
  reviews: 40,
  events: 30,
  api_keys: 1,
};

let client: Client;

async function applyFile(file: string): Promise<void> {
  const sql = await readFile(file, "utf8");
  try {
    await client.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path.basename(file)} failed: ${message}`);
  }
}

/** Run `work` as `authenticated` with `sub` as `auth.uid()`, then roll back. */
async function asAuthenticated<T>(sub: string, work: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
    return await work();
  } finally {
    await client.query("rollback");
  }
}

async function asAnon<T>(work: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query("set local role anon");
    return await work();
  } finally {
    await client.query("rollback");
  }
}

suite("supabase schema against a real Postgres", () => {
  beforeAll(async () => {
    client = new Client({ connectionString: CONNECTION });
    try {
      await client.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Cannot reach ${CONNECTION}: ${message}\n` +
          "Start the throwaway server first:  bash scripts/db-local.sh start",
      );
    }

    // A clean slate every run: this database exists only to be rebuilt.
    await client.query("drop schema if exists public cascade");
    await client.query("drop schema if exists auth cascade");
    await client.query("drop schema if exists extensions cascade");
    await client.query("create schema public");
    await client.query(SUPABASE_BOOTSTRAP);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) await applyFile(path.join(MIGRATIONS_DIR, name));

    await applyFile(SEED_FILE);
  }, 120_000);

  afterAll(async () => {
    await client?.end();
  });

  it("applies every migration in order and creates the §2 tables", async () => {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    const tables = rows.map((row) => row.tablename);
    for (const table of Object.keys(MINIMUM_ROWS)) expect(tables).toContain(table);
    // Added by 0006 — the Follow button's shared state.
    expect(tables).toContain("channel_followers");
    // Added by 0009 — the one-shot claim links for self-registered agents.
    expect(tables).toContain("agent_claims");
  });

  it("loads the seed with at least the BUILD_SPEC §2 row counts", async () => {
    for (const [table, minimum] of Object.entries(MINIMUM_ROWS)) {
      const { rows } = await client.query<{ count: string }>(
        `select count(*)::text as count from public.${table}`,
      );
      const actual = Number(rows[0].count);
      expect(actual, `${table} has ${actual} rows, expected ≥ ${minimum}`).toBeGreaterThanOrEqual(
        minimum,
      );
    }
  });

  it("loads exactly the rows lib/seed emits", async () => {
    // `seedCounts` is the generator's own tally; a mismatch means seed.sql is
    // stale (regenerate with `npm run seed:sql`) or a row was rejected.
    for (const [key, expected] of Object.entries(seedCounts)) {
      const table = key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
      const { rows } = await client.query<{ count: string }>(
        `select count(*)::text as count from public.${table}`,
      );
      expect(Number(rows[0].count), `${table} row count`).toBe(expected);
    }
  });

  it("enables row-level security on every table in public", async () => {
    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       order by c.relname
    `);
    expect(rows.length).toBeGreaterThan(20);
    const unprotected = rows.filter((row) => !row.relrowsecurity).map((row) => row.relname);
    expect(unprotected, `tables without RLS: ${unprotected.join(", ")}`).toEqual([]);
  });

  it("is re-runnable: applying every migration twice changes nothing", async () => {
    const files = (await readdir(MIGRATIONS_DIR)).filter((n) => n.endsWith(".sql")).sort();
    for (const name of files) await applyFile(path.join(MIGRATIONS_DIR, name));

    const { rows } = await client.query<{ count: string }>(
      "select count(*)::text as count from public.agents",
    );
    expect(Number(rows[0].count)).toBe(seedCounts.agents);
  }, 60_000);

  /* ------------------------------------------------------------------ RLS */

  it("lets an owner update their own agent's tagline", async () => {
    const updated = await asAuthenticated(DEMO_PROFILE_ID, async () => {
      const { rows } = await client.query<{ handle: string }>(
        `update public.agents set tagline = 'Updated by its owner'
          where handle = 'scout' returning handle`,
      );
      return rows;
    });
    expect(updated).toHaveLength(1);
    expect(updated[0].handle).toBe("scout");
  });

  it("refuses an update to somebody else's agent — zero rows, not an error", async () => {
    // `pixelpress` belongs to another creator, so the USING clause excludes the
    // row and PostgREST would answer 204 with nothing changed.
    const owner = await client.query<{ handle: string; owner_id: string }>(
      `select a.handle, a.owner_id from public.agents a
        where a.owner_id <> $1 limit 1`,
      [DEMO_PROFILE_ID],
    );
    expect(owner.rows).toHaveLength(1);
    const theirs = owner.rows[0].handle;

    const changed = await asAuthenticated(DEMO_PROFILE_ID, async () => {
      const { rows } = await client.query(
        `update public.agents set tagline = 'Hijacked' where handle = $1 returning handle`,
        [theirs],
      );
      return rows;
    });
    expect(changed).toHaveLength(0);
  });

  it("lets anon read the marketplace but not the private tables", async () => {
    const { gigs, orders, wallets } = await asAnon(async () => {
      const gigRows = await client.query<{ count: string }>(
        "select count(*)::text as count from public.gigs",
      );
      const orderRows = await client.query<{ count: string }>(
        "select count(*)::text as count from public.orders",
      );
      const walletRows = await client.query<{ count: string }>(
        "select count(*)::text as count from public.wallets",
      );
      return {
        gigs: Number(gigRows.rows[0].count),
        orders: Number(orderRows.rows[0].count),
        wallets: Number(walletRows.rows[0].count),
      };
    });

    expect(gigs).toBeGreaterThanOrEqual(30);
    // Private under RLS: zero rows, not a permission error — which is exactly
    // what the Supabase adapter's "reads never throw" contract relies on.
    expect(orders).toBe(0);
    expect(wallets).toBe(0);
  });

  it("scopes a wallet to its owner", async () => {
    const mine = await asAuthenticated(DEMO_PROFILE_ID, async () => {
      const { rows } = await client.query<{ profile_id: string }>(
        "select profile_id from public.wallets",
      );
      return rows;
    });
    expect(mine).toHaveLength(1);
    expect(mine[0].profile_id).toBe(DEMO_PROFILE_ID);
  });

  /* ------------------------------------------------------- money path RPC */

  it("moves money through hold_funds → settle_hold and writes one ledger row", async () => {
    // A real gig and its real basic price: 0007 makes `orders_insert_buyer`
    // check the amount against the package, so a made-up price is refused.
    const priced = await client.query<{ gig_id: string; agent_id: string; price: number }>(
      `select g.id as gig_id, g.agent_id, (pkg->>'price_cents')::int as price
         from public.gigs g, lateral jsonb_array_elements(g.packages) pkg
        where g.status = 'active'
          and pkg->>'tier' = 'basic'
          and (pkg->>'price_cents')::int between 100 and 900
        order by price
        limit 1`,
    );
    expect(priced.rows).toHaveLength(1);
    const { gig_id: gigId, agent_id: agentId, price } = priced.rows[0];

    const before = await client.query<{
      balance_cents: number;
      held_cents: number;
    }>("select balance_cents, held_cents from public.wallets where profile_id = $1", [
      DEMO_PROFILE_ID,
    ]);

    const orderId = await asAuthenticated(DEMO_PROFILE_ID, async () => {
      const created = await client.query<{ id: string }>(
        `insert into public.orders
           (buyer_id, agent_id, gig_id, package_tier, brief, amount_cents, status, eta_seconds)
         values ($1, $2, $3, 'basic', 'Integration test run', $4, 'queued', 60)
         returning id`,
        [DEMO_PROFILE_ID, agentId, gigId, price],
      );
      const id = created.rows[0].id;

      // 1. Hold — `held` rises, `balance` does NOT: the money is still the
      //    buyer's until the run is approved. Available is balance − held,
      //    which is the number the credits pill shows.
      await client.query("select public.hold_funds($1, $2, $3, $4)", [
        id,
        price,
        "Integration test hold",
        true,
      ]);
      const held = await client.query<{ balance_cents: number; held_cents: number }>(
        "select balance_cents, held_cents from public.wallets where profile_id = $1",
        [DEMO_PROFILE_ID],
      );
      expect(held.rows[0].held_cents).toBe(before.rows[0].held_cents + price);
      expect(held.rows[0].balance_cents).toBe(before.rows[0].balance_cents);

      const holdLedger = await client.query<{ kind: string; amount_cents: number }>(
        "select kind, amount_cents from public.wallet_transactions where order_id = $1",
        [id],
      );
      expect(holdLedger.rows).toHaveLength(1);
      expect(holdLedger.rows[0].kind).toBe("hold");
      expect(holdLedger.rows[0].amount_cents).toBe(-price);

      // A hold can only be settled from a settleable status: while the run is
      // still queued there is nothing to release. (A savepoint, because a
      // failed statement would otherwise abort the surrounding transaction.)
      await client.query("savepoint too_early");
      await expect(
        client.query("select public.settle_hold($1, $2, $3)", [id, "Too early", false]),
      ).rejects.toThrow(/cannot be settled/);
      await client.query("rollback to savepoint too_early");

      // 2. The run advances on its own clock, then settles. The hold clears,
      //    the balance is finally debited, the SAME ledger row becomes a
      //    `release`, and the order lands on `approved` in that transaction.
      await client.query("select public.advance_order($1, $2, $3)", [id, "running", 40]);
      await client.query("select public.advance_order($1, $2, $3)", [id, "delivered", 100]);
      await client.query("select public.settle_hold($1, $2, $3)", [
        id,
        "Released on approval",
        false,
      ]);
      const settled = await client.query<{ balance_cents: number; held_cents: number }>(
        "select balance_cents, held_cents from public.wallets where profile_id = $1",
        [DEMO_PROFILE_ID],
      );
      expect(settled.rows[0].held_cents).toBe(before.rows[0].held_cents);
      expect(settled.rows[0].balance_cents).toBe(before.rows[0].balance_cents - price);

      const releaseLedger = await client.query<{ kind: string; amount_cents: number }>(
        "select kind, amount_cents from public.wallet_transactions where order_id = $1",
        [id],
      );
      expect(releaseLedger.rows).toHaveLength(1);
      expect(releaseLedger.rows[0].kind).toBe("release");

      const status = await client.query<{ status: string }>(
        "select status from public.orders where id = $1",
        [id],
      );
      expect(status.rows[0].status).toBe("approved");

      // 3. Settling again must not move money a second time. Repeating it used
      //    to free held credits belonging to *other* in-flight orders, once per
      //    call, without bound.
      await client.query("savepoint again");
      await expect(
        client.query("select public.settle_hold($1, $2, $3)", [id, "Again", true]),
      ).rejects.toThrow(/cannot be settled/);
      await client.query("rollback to savepoint again");
      const twice = await client.query<{ balance_cents: number; held_cents: number }>(
        "select balance_cents, held_cents from public.wallets where profile_id = $1",
        [DEMO_PROFILE_ID],
      );
      expect(twice.rows[0].held_cents).toBe(before.rows[0].held_cents);
      expect(twice.rows[0].balance_cents).toBe(before.rows[0].balance_cents - price);

      return id;
    });

    expect(orderId).toBeTruthy();
  });

  /* -------------------------------------------------------- privileges */

  it("takes the money and reputation columns away from the browser", async () => {
    // 0005 revoked these at *column* level while `authenticated` still held
    // table-level UPDATE, which Postgres treats as a no-op. Every one of these
    // read `true` on a real project.
    const columns: Array<[string, string]> = [
      ["public.wallets", "balance_cents"],
      ["public.wallets", "held_cents"],
      ["public.wallets", "spend_today_cents"],
      ["public.orders", "amount_cents"],
      ["public.orders", "status"],
      ["public.orders", "progress"],
      ["public.agents", "rating_avg"],
      ["public.agents", "rating_count"],
      ["public.agents", "jobs_completed"],
      ["public.agents", "verified"],
      ["public.gigs", "runs_count"],
    ];
    for (const [table, column] of columns) {
      const { rows } = await client.query<{ allowed: boolean }>(
        "select has_column_privilege('authenticated', $1, $2, 'UPDATE') as allowed",
        [table, column],
      );
      expect(rows[0].allowed, `${table}.${column} must not be client-writable`).toBe(false);
    }

    // The spend policy is the one part of a wallet its owner may edit.
    const policy = await client.query<{ allowed: boolean }>(
      `select has_column_privilege('authenticated', 'public.wallets',
              'autonomous_spend_limit_cents', 'UPDATE') as allowed`,
    );
    expect(policy.rows[0].allowed).toBe(true);
  });

  it("gives anon read-only access to every table", async () => {
    const { rows } = await client.query<{ tablename: string; privilege_type: string }>(`
      select table_name as tablename, privilege_type
        from information_schema.table_privileges
       where grantee = 'anon' and table_schema = 'public'
         and privilege_type <> 'SELECT'
    `);
    const offenders = rows.map((row) => `${row.tablename}:${row.privilege_type}`);
    expect(offenders, `anon can still write: ${offenders.join(", ")}`).toEqual([]);
  });

  it("refuses an order priced below its package", async () => {
    const priced = await client.query<{ gig_id: string; agent_id: string; price: number }>(
      `select g.id as gig_id, g.agent_id, (pkg->>'price_cents')::int as price
         from public.gigs g, lateral jsonb_array_elements(g.packages) pkg
        where pkg->>'tier' = 'premium' and (pkg->>'price_cents')::int > 100
        limit 1`,
    );
    expect(priced.rows).toHaveLength(1);

    await asAuthenticated(DEMO_PROFILE_ID, async () => {
      await expect(
        client.query(
          `insert into public.orders
             (buyer_id, agent_id, gig_id, package_tier, brief, amount_cents, status, eta_seconds)
           values ($1, $2, $3, 'premium', 'Underpaid', 1, 'queued', 30)`,
          [DEMO_PROFILE_ID, priced.rows[0].agent_id, priced.rows[0].gig_id],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("refuses a District-wide event authored by a client", async () => {
    await asAuthenticated(DEMO_PROFILE_ID, async () => {
      // A `system` actor under a District byline is stored content injection…
      await client.query("savepoint sys");
      await expect(
        client.query(
          `select public.publish_event('live', 'system', null, 'AgentDistrict Security',
             'Verify your wallet', 'Click through', 'Verify now', 'https://evil.example.com')`,
        ),
      ).rejects.toThrow(/system events/);
      await client.query("rollback to savepoint sys");

      // …and so is an off-site CTA on an event the caller may otherwise write.
      const agent = await client.query<{ id: string; name: string }>(
        "select id, name from public.agents where owner_id = $1 limit 1",
        [DEMO_PROFILE_ID],
      );
      await client.query("savepoint href");
      await expect(
        client.query(
          `select public.publish_event('available', 'agent', $1, $2,
             'Headline', 'Body', 'Go', 'https://evil.example.com/phish')`,
          [agent.rows[0].id, agent.rows[0].name],
        ),
      ).rejects.toThrow(/path on this site/);
      await client.query("rollback to savepoint href");
    });
  });

  it("refuses a review on your own agent, and on an unapproved run", async () => {
    const mine = await client.query<{ id: string }>(
      "select id from public.agents where owner_id = $1 limit 1",
      [DEMO_PROFILE_ID],
    );
    const order = await client.query<{ id: string; agent_id: string }>(
      `select id, agent_id from public.orders
        where buyer_id = $1 and agent_id = $2 and status = 'approved' limit 1`,
      [DEMO_PROFILE_ID, mine.rows[0].id],
    );

    await asAuthenticated(DEMO_PROFILE_ID, async () => {
      if (order.rows.length > 0) {
        await client.query("savepoint own");
        await expect(
          client.query(
            `insert into public.reviews (order_id, agent_id, reviewer_id, rating, body)
             values ($1, $2, $3, 5, 'Five stars for myself')`,
            [order.rows[0].id, order.rows[0].agent_id, DEMO_PROFILE_ID],
          ),
        ).rejects.toThrow(/row-level security/);
        await client.query("rollback to savepoint own");
      }

      const running = await client.query<{ id: string; agent_id: string }>(
        `select id, agent_id from public.orders
          where buyer_id = $1 and status in ('queued', 'running', 'delivered') limit 1`,
        [DEMO_PROFILE_ID],
      );
      expect(running.rows).toHaveLength(1);
      await expect(
        client.query(
          `insert into public.reviews (order_id, agent_id, reviewer_id, rating, body)
           values ($1, $2, $3, 5, 'Rated before it was approved')`,
          [running.rows[0].id, running.rows[0].agent_id, DEMO_PROFILE_ID],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("lets a service-role caller act for the profile an API key belongs to", async () => {
    // This is the machine surface in supabase mode: an API-key caller has no
    // Supabase JWT, so `auth.uid()` is null and every money RPC refused it.
    // `p_actor` closes that hole — and only for the service role.
    const priced = await client.query<{ gig_id: string; agent_id: string; price: number }>(
      `select g.id as gig_id, g.agent_id, (pkg->>'price_cents')::int as price
         from public.gigs g, lateral jsonb_array_elements(g.packages) pkg
        where g.status = 'active' and pkg->>'tier' = 'basic'
          and (pkg->>'price_cents')::int between 1 and 400
        order by price limit 1`,
    );
    expect(priced.rows).toHaveLength(1);
    const { gig_id: gigId, agent_id: agentId, price } = priced.rows[0];

    await client.query("begin");
    try {
      await client.query("set local role service_role");
      await client.query(
        "select set_config('request.jwt.claim.role', 'service_role', true)",
      );

      const created = await client.query<{ id: string }>(
        `insert into public.orders
           (buyer_id, agent_id, gig_id, package_tier, brief, amount_cents, status, eta_seconds)
         values ($1, $2, $3, 'basic', 'Machine-placed run', $4, 'queued', 30)
         returning id`,
        [DEMO_PROFILE_ID, agentId, gigId, price],
      );
      const held = await client.query<{ held_cents: number }>(
        "select held_cents from public.hold_funds($1, $2, $3, $4, $5)",
        [created.rows[0].id, price, "Hold — machine caller", true, DEMO_PROFILE_ID],
      );
      expect(held.rows[0].held_cents).toBeGreaterThan(0);

      // Without `p_actor` the same call is still refused: an unattributed
      // service-role write is exactly what this must not enable.
      await client.query("savepoint anon_actor");
      await expect(
        client.query("select public.hold_funds($1, $2, $3, $4)", [
          created.rows[0].id,
          price,
          "No actor",
          true,
        ]),
      ).rejects.toThrow(/authenticated caller/);
      await client.query("rollback to savepoint anon_actor");
    } finally {
      await client.query("rollback");
    }
  });

  it("ignores p_actor for an ordinary signed-in caller", async () => {
    const other = await client.query<{ id: string }>(
      "select id from public.profiles where id <> $1 limit 1",
      [DEMO_PROFILE_ID],
    );
    const uid = await asAuthenticated(DEMO_PROFILE_ID, async () => {
      const { rows } = await client.query<{ uid: string }>(
        "select public.acting_uid($1) as uid",
        [other.rows[0].id],
      );
      return rows[0].uid;
    });
    // `auth.uid()` wins: an ordinary session cannot borrow another identity.
    expect(uid).toBe(DEMO_PROFILE_ID);
  });

  /* ------------------------------------------------- 0008: integrity holes */

  it("refuses a signed-in caller who tries to move an agent's reputation", async () => {
    // `increment_agent_jobs` and `increment_gig_runs` were SECURITY DEFINER,
    // granted to `authenticated`, and checked nothing — so any signed-in user
    // could rewrite the exact columns the privilege test above revokes, for any
    // row, with the public anon key. 20 calls added 20,000 completed jobs.
    const victim = await client.query<{ id: string; jobs_completed: number }>(
      "select id, jobs_completed from public.agents where handle = 'scout'",
    );
    const before = victim.rows[0].jobs_completed;

    const gig = await client.query<{ id: string; runs_count: number }>(
      "select id, runs_count from public.gigs where status = 'active' limit 1",
    );

    await asAuthenticated(profileId("devdan"), async () => {
      await client.query("savepoint jobs");
      await expect(
        client.query("select public.increment_agent_jobs($1, $2)", [
          victim.rows[0].id,
          // A stranger's order id would not help either; a made-up one is the
          // simplest proof that the relationship is what is checked.
          "00000000-0000-0000-0000-000000000000",
        ]),
      ).rejects.toThrow(/no approved run/);
      await client.query("rollback to savepoint jobs");

      await client.query("savepoint runs");
      await expect(
        client.query("select public.increment_gig_runs($1, $2)", [
          gig.rows[0].id,
          "00000000-0000-0000-0000-000000000000",
        ]),
      ).rejects.toThrow(/no order by this caller/);
      await client.query("rollback to savepoint runs");

      // Viewer and download counters are the District's, not a client's.
      await client.query("savepoint viewers");
      await expect(
        client.query("select public.increment_channel_viewers($1, $2)", ["build-live", 1000]),
      ).rejects.toThrow(/permission denied/);
      await client.query("rollback to savepoint viewers");
    });

    const after = await client.query<{ jobs_completed: number }>(
      "select jobs_completed from public.agents where handle = 'scout'",
    );
    expect(after.rows[0].jobs_completed).toBe(before);
  });

  it("refuses an order that credits an agent the gig does not belong to", async () => {
    // The whole chain: mint a $0 "approved" run naming a stranger's agent, then
    // review it — `reviews_insert_reviewer` trusts `orders.agent_id`. The gig
    // branch of `orders_insert_buyer` checked the price but never bound the
    // agent, so this walked any agent's rating down at zero cost.
    const free = await client.query<{ gig_id: string; agent_id: string }>(
      `select g.id as gig_id, g.agent_id
         from public.gigs g, lateral jsonb_array_elements(g.packages) pkg
        where g.status = 'active' and pkg->>'tier' = 'basic'
          and (pkg->>'price_cents')::int = 0
        limit 1`,
    );
    expect(free.rows).toHaveLength(1);

    const victim = await client.query<{ id: string }>(
      "select id from public.agents where id <> $1 and owner_id <> $2 limit 1",
      [free.rows[0].agent_id, DEMO_PROFILE_ID],
    );

    await asAuthenticated(DEMO_PROFILE_ID, async () => {
      await expect(
        client.query(
          `insert into public.orders
             (buyer_id, agent_id, gig_id, package_tier, brief, amount_cents, status, eta_seconds)
           values ($1, $2, $3, 'basic', 'Attributed to a stranger', 0, 'queued', 30)`,
          [DEMO_PROFILE_ID, victim.rows[0].id, free.rows[0].gig_id],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("refuses a bid on your own bounty", async () => {
    const mine = await client.query<{ id: string }>(
      "select id from public.agents where owner_id = $1 limit 1",
      [DEMO_PROFILE_ID],
    );
    const ownJob = await client.query<{ id: string }>(
      "select id from public.jobs where poster_id = $1 and status = 'open' limit 1",
      [DEMO_PROFILE_ID],
    );
    expect(ownJob.rows).toHaveLength(1);

    await asAuthenticated(DEMO_PROFILE_ID, async () => {
      await expect(
        client.query(
          `insert into public.bids (job_id, agent_id, amount_cents, eta_seconds, note, status)
           values ($1, $2, 1, 60, 'Bidding on myself', 'pending')`,
          [ownJob.rows[0].id, mine.rows[0].id],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("does not carry yesterday's autonomous spend into today", async () => {
    // The counter used to key off `wallets.updated_at`, so any unrelated write
    // — a top-up, a policy save, the pause — refreshed the day without zeroing
    // the total, and yesterday's spend was charged against today's ceiling for
    // ever. `spend_today_date` is the day, and only a spend writes it.
    const buyer = profileId("devdan");
    const priced = await client.query<{ gig_id: string; agent_id: string; price: number }>(
      `select g.id as gig_id, g.agent_id, (pkg->>'price_cents')::int as price
         from public.gigs g, lateral jsonb_array_elements(g.packages) pkg
        where g.status = 'active' and pkg->>'tier' = 'basic'
          and (pkg->>'price_cents')::int between 1 and 200
        order by price limit 1`,
    );
    const { gig_id: gigId, agent_id: agentId, price } = priced.rows[0];

    await client.query("begin");
    try {
      // Stage "yesterday": 400¢ spent, on the previous UTC day.
      await client.query(
        `update public.wallets
            set spend_today_cents = 400,
                spend_today_date = (now() at time zone 'utc')::date - 1
          where profile_id = $1`,
        [buyer],
      );

      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [buyer]);

      // An unrelated wallet write on the new day — this is what used to poison
      // the counter.
      await client.query("select public.top_up_wallet($1, $2)", [500, "Top-up"]);

      const created = await client.query<{ id: string }>(
        `insert into public.orders
           (buyer_id, agent_id, gig_id, package_tier, brief, amount_cents, status, eta_seconds)
         values ($1, $2, $3, 'basic', 'New-day run', $4, 'queued', 30) returning id`,
        [buyer, agentId, gigId, price],
      );
      await client.query("select public.hold_funds($1, $2, $3, $4)", [
        created.rows[0].id,
        price,
        "New-day hold",
        false,
      ]);

      const wallet = await client.query<{ spend_today_cents: number; spend_today_date: string }>(
        "select spend_today_cents, spend_today_date from public.wallets where profile_id = $1",
        [buyer],
      );
      expect(wallet.rows[0].spend_today_cents).toBe(price);
    } finally {
      await client.query("rollback");
    }
  });

  it("does not let a settable GUC promote a session to the service role", async () => {
    // `is_service_role()` read `request.jwt.claim.role`, a *custom* GUC any
    // database role can `set_config`. It now reads the role Postgres itself
    // enforces, which `authenticated` cannot become.
    const other = await client.query<{ id: string }>(
      "select id from public.profiles where id <> $1 limit 1",
      [DEMO_PROFILE_ID],
    );

    await client.query("begin");
    try {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      const promoted = await client.query<{ ok: boolean }>(
        "select public.is_service_role() as ok",
      );
      expect(promoted.rows[0].ok).toBe(false);

      // With no `auth.uid()` and no real service role, `acting_uid` refuses to
      // hand back the impersonated profile.
      const acting = await client.query<{ uid: string | null }>(
        "select public.acting_uid($1) as uid",
        [other.rows[0].id],
      );
      expect(acting.rows[0].uid).toBeNull();
    } finally {
      await client.query("rollback");
    }
  });

  /* ----------------------------------------------- 0009: the entrance */

  it("adds the entrance schema: post events, agent-bound keys, private claims", async () => {
    // 1. `event_kind` gained 'post' — the feed an outside agent writes to.
    const kinds = await client.query<{ enumlabel: string }>(
      `select e.enumlabel
         from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'event_kind'`,
    );
    expect(kinds.rows.map((row) => row.enumlabel)).toContain("post");
    // …and the seed ships posts, so `/api/v1/feed` is never an empty wall.
    const posts = await client.query<{ count: string }>(
      "select count(*)::text as count from public.events where kind = 'post'",
    );
    expect(Number(posts.rows[0].count)).toBeGreaterThan(0);

    // 2. `api_keys.agent_id` exists, is a real FK, and is not client-writable:
    //    binding a key to an agent is `register_agent`'s job alone.
    const column = await client.query<{ data_type: string }>(
      `select data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'api_keys' and column_name = 'agent_id'`,
    );
    expect(column.rows).toHaveLength(1);
    expect(column.rows[0].data_type).toBe("uuid");

    const fk = await client.query<{ count: string }>(
      `select count(*)::text as count
         from information_schema.table_constraints tc
         join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name
        where tc.table_schema = 'public' and tc.table_name = 'api_keys'
          and tc.constraint_type = 'FOREIGN KEY' and k.column_name = 'agent_id'`,
    );
    expect(Number(fk.rows[0].count)).toBe(1);

    const writable = await client.query<{ allowed: boolean }>(
      `select has_column_privilege('authenticated', 'public.api_keys', 'agent_id', 'UPDATE')
              as allowed`,
    );
    expect(writable.rows[0].allowed).toBe(false);

    // 3. `agent_claims` is protected and private.
    const rls = await client.query<{ relrowsecurity: boolean }>(
      `select c.relrowsecurity from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'agent_claims'`,
    );
    expect(rls.rows[0].relrowsecurity).toBe(true);

    const unique = await client.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'agent_claims'
          and indexdef ilike '%unique%token_hash%'`,
    );
    expect(unique.rows.length).toBeGreaterThan(0);
  });

  it("registers an agent through register_agent() and claims it once", async () => {
    const keyHash = `sha256$${"a".repeat(64)}`;
    const tokenHash = "b".repeat(64);

    await client.query("begin");
    try {
      // Registration is the one write path with **no credential at all**, so
      // it runs as `anon` here — exactly as a curl from the open internet does.
      await client.query("set local role anon");
      const registered = await client.query<{
        id: string;
        handle: string;
        owner_id: string;
        verified: boolean;
        status: string;
      }>(
        `select id, handle, owner_id, verified, status::text as status
           from public.register_agent(
             'tide-reader', 'TideReader', 'Coastal permit research.', '',
             '🌊', 'linear-gradient(135deg,#297dff,#7559ff)',
             'research', array['permit data']::text[], array['FL']::text[],
             'research-pit', 'per_run', 300, '{}'::jsonb, '{}'::text[],
             $1, 'ad_live_tide', $2::text[], $3, 'district-registry'
           )`,
        [
          keyHash,
          ["agents:read", "gigs:read", "jobs:read", "events:read", "events:write", "bids:write", "stats:read"],
          tokenHash,
        ],
      );
      expect(registered.rows).toHaveLength(1);
      const agent = registered.rows[0];
      expect(agent.verified).toBe(false);
      // An unclaimed stranger is not online: `network_stats()` filters on
      // `offline`, so an open registration endpoint cannot inflate the
      // District's counters.
      expect(agent.status).toBe("offline");

      const registry = await client.query<{ id: string }>(
        "select id from public.profiles where handle = 'district-registry'",
      );
      expect(agent.owner_id).toBe(registry.rows[0].id);

      // Presence, the key bound to the agent, the claim row and the feed event
      // all landed in the same transaction.
      await client.query("set local role postgres");
      const presence = await client.query<{ count: string }>(
        "select count(*)::text as count from public.presence where agent_id = $1",
        [agent.id],
      );
      expect(Number(presence.rows[0].count)).toBe(1);

      const key = await client.query<{ agent_id: string; profile_id: string; scopes: string[] }>(
        "select agent_id, profile_id, scopes from public.api_keys where key_hash = $1",
        [keyHash],
      );
      expect(key.rows[0].agent_id).toBe(agent.id);
      expect(key.rows[0].profile_id).toBe(registry.rows[0].id);
      expect(key.rows[0].scopes).not.toContain("orders:write");

      const discovered = await client.query<{ count: string }>(
        "select count(*)::text as count from public.events where kind = 'discovered' and actor_id = $1",
        [agent.id],
      );
      expect(Number(discovered.rows[0].count)).toBe(1);

      // `anon` must not be able to read the claim row it just created: the
      // digest is the only thing standing between a leak and a stolen agent.
      await client.query("set local role anon");
      const leaked = await client.query<{ count: string }>(
        "select count(*)::text as count from public.agent_claims",
      );
      expect(Number(leaked.rows[0].count)).toBe(0);

      // Claiming needs a session, and may only claim for the caller.
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
        DEMO_PROFILE_ID,
      ]);

      await client.query("savepoint third_party");
      await expect(
        client.query("select public.claim_agent($1, $2)", [tokenHash, profileId("devdan")]),
      ).rejects.toThrow(/only be claimed/);
      await client.query("rollback to savepoint third_party");

      const claimed = await client.query<{
        owner_id: string;
        verified: boolean;
        status: string;
      }>(
        "select owner_id, verified, status::text as status from public.claim_agent($1, $2)",
        [tokenHash, DEMO_PROFILE_ID],
      );
      expect(claimed.rows[0].owner_id).toBe(DEMO_PROFILE_ID);
      expect(claimed.rows[0].verified).toBe(true);
      // Vouched for, so now it is live — agent row and Lounge seat together.
      expect(claimed.rows[0].status).toBe("available");
      const seat = await client.query<{ status: string }>(
        "select status::text as status from public.presence where agent_id = $1",
        [agent.id],
      );
      expect(seat.rows[0].status).toBe("available");

      // One-shot.
      await client.query("savepoint twice");
      await expect(
        client.query("select public.claim_agent($1, $2)", [tokenHash, DEMO_PROFILE_ID]),
      ).rejects.toThrow(/already been claimed/);
      await client.query("rollback to savepoint twice");

      // The key followed its owner, so the agent can still bid as itself.
      await client.query("set local role postgres");
      const moved = await client.query<{ profile_id: string }>(
        "select profile_id from public.api_keys where key_hash = $1",
        [keyHash],
      );
      expect(moved.rows[0].profile_id).toBe(DEMO_PROFILE_ID);
    } finally {
      await client.query("rollback");
    }
  });

  it("refuses a self-registered key that asks to spend money", async () => {
    await client.query("begin");
    try {
      await client.query("set local role anon");
      await expect(
        client.query(
          `select public.register_agent(
             'greedy-agent', 'Greedy', 'Wants to spend your wallet.', '',
             '🤖', 'linear-gradient(135deg,#297dff,#7559ff)',
             'research', array['spending']::text[], array['US']::text[],
             'research-pit', 'per_run', 0, '{}'::jsonb, '{}'::text[],
             $1, 'ad_live_greed', array['agents:read','orders:write']::text[], $2,
             'district-registry'
           )`,
          [`sha256$${"c".repeat(64)}`, "d".repeat(64)],
        ),
      ).rejects.toThrow(/cannot carry that scope/);
    } finally {
      await client.query("rollback");
    }
  });

  /* ----------------------------------------- 0011: the hardened entrance */

  /** `register_agent()` as anon with the app's 18 arguments, returning the agent. */
  async function registerAsAnon(handle: string, keyHash: string, tokenHash: string) {
    await client.query("set local role anon");
    const { rows } = await client.query<{ id: string; owner_id: string }>(
      `select id, owner_id from public.register_agent(
         p_handle => $1, p_name => 'Probe', p_tagline => 'Registry pinning probe.',
         p_description => '', p_avatar_emoji => '🤖',
         p_avatar_gradient => 'linear-gradient(135deg,#297dff,#7559ff)',
         p_category => 'research', p_skills => array['probing']::text[],
         p_regions => array['US']::text[], p_room_slug => 'research-pit',
         p_pricing_model => 'per_run', p_starting_price_cents => 0,
         p_endpoints => '{}'::jsonb, p_mcp_tools => '{}'::text[],
         p_key_hash => $2, p_key_prefix => 'ad_live_prbe',
         p_scopes => array['agents:read','bids:write']::text[], p_token_hash => $3
       )`,
      [handle, keyHash, tokenHash],
    );
    return rows[0];
  }

  it("pins register_agent() to the District registry, whatever the caller names", async () => {
    await client.query("begin");
    try {
      // Straight through PostgREST with the anon key, naming a real person's
      // profile: before 0011 this bound the agent *and its key* to `austin`.
      await client.query("set local role anon");
      await client.query("savepoint hijack");
      await expect(
        client.query(
          `select public.register_agent(
             'hijack-probe', 'Hijack', 'Wants to live on someone else''s profile.', '',
             '🤖', 'linear-gradient(135deg,#297dff,#7559ff)',
             'research', array['probing']::text[], array['US']::text[],
             'research-pit', 'per_run', 0, '{}'::jsonb, '{}'::text[],
             $1, 'ad_live_hjck', array['agents:read','bids:write']::text[], $2, 'austin'
           )`,
          [`sha256$${"e".repeat(64)}`, "f".repeat(64)],
        ),
      ).rejects.toThrow(/only be held by the District registry/);
      await client.query("rollback to savepoint hijack");

      await client.query("set local role postgres");
      const leaked = await client.query<{ count: string }>(
        "select count(*)::text as count from public.agents where handle = 'hijack-probe'",
      );
      expect(Number(leaked.rows[0].count)).toBe(0);

      // The app's own call shape — no `p_registry_handle` at all — still works,
      // and still lands on the registry.
      const agent = await registerAsAnon(
        "pinned-probe",
        `sha256$${"1".repeat(64)}`,
        "2".repeat(64),
      );
      await client.query("set local role postgres");
      const registry = await client.query<{ id: string }>(
        "select id from public.profiles where handle = 'district-registry'",
      );
      expect(agent.owner_id).toBe(registry.rows[0].id);
      const key = await client.query<{ profile_id: string }>(
        "select profile_id from public.api_keys where agent_id = $1",
        [agent.id],
      );
      expect(key.rows.map((row) => row.profile_id)).toEqual([registry.rows[0].id]);
    } finally {
      await client.query("rollback");
    }

    // The front door is still open to the roles the app calls it as: both
    // entrances use the anon-key client, never the service role.
    const signature =
      "public.register_agent(text, text, text, text, text, text, text, text[], text[], " +
      "text, text, integer, jsonb, text[], text, text, text[], text, text)";
    const grants = await client.query<{ anon: boolean; authenticated: boolean }>(
      `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
              has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated`,
      [signature],
    );
    expect(grants.rows[0]).toEqual({ anon: true, authenticated: true });
  });

  it("refuses a signed-in user who forges an agent-bound or over-scoped key", async () => {
    let n = 0;
    const insertKey = (profile: string, agentId: string | null, scopes: (string | null)[]) => {
      n += 1;
      return client.query(
        `insert into public.api_keys (profile_id, label, key_hash, key_prefix, scopes, agent_id)
         values ($1, 'forge probe', $2, 'ad_live_frge', $3::text[], $4) returning id`,
        [profile, `sha256$${String(n).padStart(64, "9")}`, scopes, agentId],
      );
    };
    const refused = async (label: string, work: () => Promise<unknown>) => {
      await client.query(`savepoint forge_${label}`);
      await expect(work()).rejects.toThrow(/row-level security/);
      await client.query(`rollback to savepoint forge_${label}`);
    };

    await client.query("begin");
    try {
      // An unclaimed agent, held by the registry — the shape the forge targets.
      const stranger = await registerAsAnon(
        "forge-target",
        `sha256$${"3".repeat(64)}`,
        "4".repeat(64),
      );

      await client.query("set local role postgres");
      const own = await client.query<{ id: string }>(
        "select id from public.agents where owner_id = $1 order by handle limit 1",
        [DEMO_PROFILE_ID],
      );
      const theirs = await client.query<{ id: string }>(
        "select id from public.agents where owner_id = $1 order by handle limit 1",
        [profileId("agentmax")],
      );
      expect(own.rows).toHaveLength(1);
      expect(theirs.rows).toHaveLength(1);

      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
        DEMO_PROFILE_ID,
      ]);

      // What `/profile` mints: no agent, scopes from the form. Still allowed.
      const plain = await insertKey(DEMO_PROFILE_ID, null, [
        "agents:read", "gigs:read", "jobs:read", "jobs:write", "orders:read",
        "orders:write", "bids:write", "stats:read", "events:read",
      ]);
      expect(plain.rows).toHaveLength(1);
      // Bound to an agent you own: allowed.
      const bound = await insertKey(DEMO_PROFILE_ID, own.rows[0].id, ["bids:write"]);
      expect(bound.rows).toHaveLength(1);

      // Bound to an agent you do not own — an unclaimed one, or another
      // creator's — would be a key that bids and posts as that agent.
      await refused("unclaimed", () => insertKey(DEMO_PROFILE_ID, stranger.id, ["bids:write"]));
      await refused("theirs", () => insertKey(DEMO_PROFILE_ID, theirs.rows[0].id, ["bids:write"]));
      // Scopes the form cannot emit.
      await refused("wildcard", () => insertKey(DEMO_PROFILE_ID, null, ["*"]));
      await refused("post", () => insertKey(DEMO_PROFILE_ID, null, ["agents:read", "events:write"]));
      await refused("null", () => insertKey(DEMO_PROFILE_ID, null, [null]));
      // And, as before, a key on somebody else's profile.
      await refused("profile", () => insertKey(profileId("agentmax"), null, ["agents:read"]));
    } finally {
      await client.query("rollback");
    }
  });

  it("answers search_district() across every kind it documents", async () => {
    const { rows } = await client.query<{ kind: string; slug: string }>(
      "select kind, slug from public.search_district($1, $2)",
      ["roofing", 50],
    );
    expect(rows.length).toBeGreaterThan(0);

    // 0006 added channels and stores; make sure the new branches are reachable.
    const tv = await client.query<{ kind: string }>(
      "select kind from public.search_district($1, $2)",
      ["Otto Wally show", 50],
    );
    expect(tv.rows.map((row) => row.kind)).toContain("channel");

    const stores = await client.query<{ kind: string }>(
      "select kind from public.search_district($1, $2)",
      ["WallyWorks Labs", 50],
    );
    expect(stores.rows.map((row) => row.kind)).toContain("store");
  });

  /* ------------------------------------------------- 0010: the analytics RPC */

  it("adds profiles.is_admin and seeds exactly one operator", async () => {
    const column = await client.query<{ data_type: string; column_default: string | null }>(
      `select data_type, column_default
         from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_admin'`,
    );
    expect(column.rows).toHaveLength(1);
    expect(column.rows[0].data_type).toBe("boolean");
    expect(column.rows[0].column_default).toContain("false");

    const admins = await client.query<{ handle: string }>(
      "select handle from public.profiles where is_admin order by handle",
    );
    expect(admins.rows.map((row) => row.handle)).toEqual(["austin"]);
  });

  /**
   * The reason 0010 has a privilege section at all: adding an authority flag to
   * a table `authenticated` could UPDATE table-wide would have let anyone
   * promote themselves through PostgREST with the public anon key.
   */
  it("lets a person edit their own name but not their own authority", async () => {
    const { rows } = await client.query<Record<string, boolean>>(
      `select has_column_privilege('authenticated','public.profiles','display_name','UPDATE') as display_name,
              has_column_privilege('authenticated','public.profiles','bio','UPDATE')          as bio,
              has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE')   as avatar_url,
              has_column_privilege('authenticated','public.profiles','is_admin','UPDATE')     as is_admin,
              has_column_privilege('authenticated','public.profiles','is_verified_human','UPDATE') as verified,
              has_column_privilege('authenticated','public.profiles','handle','UPDATE')       as handle`,
    );
    expect(rows[0]).toEqual({
      display_name: true,
      bio: true,
      avatar_url: true,
      is_admin: false,
      verified: false,
      handle: false,
    });
  });

  it("refuses a self-promotion as a real session, and allows the profile edit", async () => {
    await asAuthenticated(DEMO_PROFILE_ID, async () => {
      const edited = await client.query<{ display_name: string }>(
        `update public.profiles set display_name = 'Austin C.', avatar_url = 'district:🛰️:violet'
          where id = $1 returning display_name`,
        [DEMO_PROFILE_ID],
      );
      expect(edited.rows).toHaveLength(1);

      // A column privilege failure is an error, not a silent zero-row update —
      // which is exactly the difference between "not yours" and "not allowed".
      await client.query("savepoint promote");
      await expect(
        client.query("update public.profiles set is_admin = true where id = $1", [
          DEMO_PROFILE_ID,
        ]),
      ).rejects.toThrow(/permission denied/i);
      await client.query("rollback to savepoint promote");
    });
  });

  /**
   * The UPDATE fence alone is not enough, and this is the case that proves it.
   *
   * `profiles_delete_self` + `profiles_insert_self` (0002) let a person drop
   * their own row and write it back — correct on their own. But Supabase's
   * default `grant all on tables to authenticated` makes that INSERT
   * *column-wide*, so DELETE-then-INSERT is a two-call route around the UPDATE
   * revoke and straight to `is_admin = true`. 0010 fences INSERT for the same
   * reason it fences UPDATE.
   */
  it("cannot round-trip a self-promotion through delete + insert", async () => {
    const attacker = "11111111-2222-4333-8444-555555555555";
    await client.query("begin");
    try {
      // A realistic fresh signup: handle_new_user mints the profile and wallet.
      await client.query(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ($1, 'escalation-probe@example.com', '{"handle":"escalation-probe"}'::jsonb)`,
        [attacker],
      );
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [attacker]);

      // Deleting your own profile is legitimate — account deletion. Writing one
      // back is too. Declaring yourself an operator while you do it is not.
      await client.query("delete from public.profiles where id = $1", [attacker]);
      await expect(
        client.query(
          `insert into public.profiles (id, handle, display_name, is_admin)
           values ($1, 'escalation-probe', 'Probe', true)`,
          [attacker],
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await client.query("rollback");
    }

    const { rows } = await client.query<Record<string, boolean>>(
      `select has_column_privilege('authenticated','public.profiles','display_name','INSERT') as display_name,
              has_column_privilege('authenticated','public.profiles','avatar_url','INSERT')   as avatar_url,
              has_column_privilege('authenticated','public.profiles','is_admin','INSERT')     as is_admin,
              has_column_privilege('authenticated','public.profiles','is_verified_human','INSERT') as verified,
              has_column_privilege('authenticated','public.profiles','is_creator','INSERT')   as creator`,
    );
    expect(rows[0]).toEqual({
      display_name: true,
      avatar_url: true,
      is_admin: false,
      verified: false,
      creator: false,
    });
  });

  it("answers district_analytics() for an operator with the seeded totals", async () => {
    const analytics = await asAuthenticated(DEMO_PROFILE_ID, async () => {
      const { rows } = await client.query<{ analytics: DistrictAnalytics }>(
        "select public.district_analytics() as analytics",
      );
      return rows[0].analytics;
    });

    expect(analytics.totals).toMatchObject({
      humans: seedCounts.profiles,
      agents: seedCounts.agents,
      claimedAgents: 0,
      orders: seedCounts.orders,
      gigs: seedCounts.gigs,
      jobs: seedCounts.jobs,
    });

    const volume = await client.query<{ sum: string }>(
      "select coalesce(sum(amount_cents), 0)::text as sum from public.orders",
    );
    expect(analytics.totals.orderVolumeCents).toBe(Number(volume.rows[0].sum));

    // 14 UTC days, oldest first, no gaps — the sparklines never interpolate.
    expect(analytics.daily).toHaveLength(ANALYTICS_DAYS);
    const dates = analytics.daily.map((point) => point.date);
    expect([...dates].sort()).toEqual(dates);
    expect(dates.at(-1)).toBe(new Date().toISOString().slice(0, 10));
    for (const point of analytics.daily) {
      expect(Object.keys(point).sort()).toEqual(
        ["agents", "claims", "date", "humans", "orderVolumeCents", "orders", "posts"].sort(),
      );
    }

    // The TypeScript scaffold and the SQL one have to agree on the days, or the
    // demo adapter and Postgres would draw two different fortnights.
    expect(dates).toEqual(analyticsDates(Date.now()));
  });

  it("raises for a signed-in non-operator and for anon", async () => {
    const someoneElse = await client.query<{ id: string }>(
      "select id from public.profiles where not is_admin limit 1",
    );

    await asAuthenticated(someoneElse.rows[0].id, async () => {
      await expect(client.query("select public.district_analytics()")).rejects.toThrow(
        /District operators/,
      );
    });

    // No session at all, and no execute privilege either.
    await asAnon(async () => {
      await expect(client.query("select public.district_analytics()")).rejects.toThrow(
        /permission denied/i,
      );
    });
  });

  it("toggles a channel follow and keeps channels.followers in step", async () => {
    const before = await client.query<{ followers: number }>(
      "select followers from public.channels where slug = 'the-otto-and-wally-show'",
    );

    await asAuthenticated(profileId("austin"), async () => {
      await client.query("select public.set_channel_follow($1, true)", [
        "the-otto-and-wally-show",
      ]);
      const after = await client.query<{ followers: number }>(
        "select followers from public.channels where slug = 'the-otto-and-wally-show'",
      );
      expect(after.rows[0].followers).toBe(before.rows[0].followers + 1);

      // Idempotent: following twice must not double-count.
      await client.query("select public.set_channel_follow($1, true)", [
        "the-otto-and-wally-show",
      ]);
      const again = await client.query<{ followers: number }>(
        "select followers from public.channels where slug = 'the-otto-and-wally-show'",
      );
      expect(again.rows[0].followers).toBe(before.rows[0].followers + 1);

      await client.query("select public.set_channel_follow($1, false)", [
        "the-otto-and-wally-show",
      ]);
      const removed = await client.query<{ followers: number }>(
        "select followers from public.channels where slug = 'the-otto-and-wally-show'",
      );
      expect(removed.rows[0].followers).toBe(before.rows[0].followers);
    });
  });
});
