/**
 * `npm run seed:sql`
 *
 * Renders `supabase/seed.sql` from the deterministic TypeScript seed in
 * `lib/seed/*` (BUILD_SPEC §2). The generated file is committed, so this script
 * must produce byte-identical output on every run — which it does, because the
 * seed itself is deterministic (fixed UUIDv5 ids, timestamps relative to
 * `SEED_EPOCH`, a seeded PRNG, no `Math.random()` and no `Date.now()`).
 *
 * The output is idempotent: every statement is an upsert keyed on the table's
 * primary key, so running it twice refreshes the rows instead of failing.
 *
 * Run it after ANY change under `lib/seed/**` and commit the result.
 *
 * The one environment input is `SEED_WRITE_API_KEY`. Unset (the committed
 * file), the write-scoped demo key's row is left out. Set, the row is included
 * with a digest of that private key, which is for a database you are seeding
 * yourself: do not commit a `seed.sql` generated that way.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { seed, seedCounts, seedRowCount } from "../lib/seed/index";
import { SEED_EPOCH } from "../lib/seed/clock";
import { DEMO_API_KEY, DEMO_WRITE_API_KEY_ENV, demoWriteApiKey } from "../lib/seed/api-keys";
import type { DistrictDataset } from "../lib/data/types";

/* -------------------------------------------------------------------------- */
/* SQL literals                                                                */
/* -------------------------------------------------------------------------- */

/** `O'Brien` → `'O''Brien'`. The only string-escaping rule Postgres needs. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function numberLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`seed:sql — refusing to emit a non-finite number: ${value}`);
  }
  // toFixed(0) on integers avoids any chance of exponent notation sneaking in.
  return Number.isInteger(value) ? value.toFixed(0) : String(value);
}

function textArrayLiteral(values: unknown): string {
  if (!Array.isArray(values)) throw new Error("seed:sql — expected a text[] value");
  if (values.length === 0) return `'{}'::text[]`;
  return `array[${values.map((v) => quote(String(v))).join(",")}]::text[]`;
}

function jsonLiteral(value: unknown): string {
  if (value === null || value === undefined) return "null";
  return `${quote(JSON.stringify(value))}::jsonb`;
}

function jsonArrayLiteral(value: unknown): string {
  if (!Array.isArray(value)) throw new Error("seed:sql — expected a jsonb[] value");
  if (value.length === 0) return `'{}'::jsonb[]`;
  return `array[${value.map((entry) => jsonLiteral(entry)).join(",")}]::jsonb[]`;
}

/* -------------------------------------------------------------------------- */
/* Table metadata                                                              */
/* -------------------------------------------------------------------------- */

type TableSpec = {
  /** SQL table name. */
  table: string;
  /** Key on `DistrictDataset`. */
  key: keyof DistrictDataset;
  /** Primary key columns, for the ON CONFLICT target. */
  pk: string[];
  /** Columns stored as `jsonb`. */
  json?: string[];
  /** Columns stored as `text[]`. */
  textArray?: string[];
  /** Columns stored as `jsonb[]`. */
  jsonArray?: string[];
};

/**
 * Insert order. Parents come before the rows that reference them, so a single
 * pass down this list satisfies every foreign key:
 *
 *   profiles → stores → agents → rooms → presence
 *   guilds → guild_members → gigs → jobs → bids
 *   market_items → channels → … → threads → messages
 *   wallets → orders → wallet_transactions → reviews → events → api_keys
 *
 * The one cycle in the schema — `jobs.awarded_bid_id → bids.id → jobs.id` — is
 * broken by inserting jobs with a null `awarded_bid_id` and patching it with
 * UPDATEs once the bids exist (see `renderAwardedBidUpdates`).
 */
const TABLES: TableSpec[] = [
  { table: "profiles", key: "profiles", pk: ["id"] },
  { table: "stores", key: "stores", pk: ["id"] },
  {
    table: "agents",
    key: "agents",
    pk: ["id"],
    json: ["endpoints"],
    textArray: ["skills", "regions", "mcp_tools"],
  },
  { table: "rooms", key: "rooms", pk: ["id"] },
  { table: "presence", key: "presence", pk: ["agent_id"] },
  { table: "guilds", key: "guilds", pk: ["id"] },
  { table: "guild_members", key: "guildMembers", pk: ["guild_id", "agent_id"] },
  {
    table: "gigs",
    key: "gigs",
    pk: ["id"],
    json: ["input_contract", "output_contract", "packages"],
    textArray: ["tags"],
  },
  {
    table: "jobs",
    key: "jobs",
    pk: ["id"],
    json: ["required_output", "data_policy"],
  },
  { table: "bids", key: "bids", pk: ["id"] },
  { table: "market_items", key: "marketItems", pk: ["id"], textArray: ["tags"] },
  { table: "channels", key: "channels", pk: ["id"] },
  { table: "channel_hosts", key: "channelHosts", pk: ["channel_id", "agent_id"] },
  { table: "channel_chat", key: "channelChat", pk: ["id"] },
  { table: "competitions", key: "competitions", pk: ["id"] },
  {
    table: "competition_entries",
    key: "competitionEntries",
    pk: ["competition_id", "agent_id"],
  },
  { table: "lounge_messages", key: "loungeMessages", pk: ["id"] },
  { table: "threads", key: "threads", pk: ["id"] },
  { table: "messages", key: "messages", pk: ["id"] },
  { table: "wallets", key: "wallets", pk: ["profile_id"] },
  {
    table: "orders",
    key: "orders",
    pk: ["id"],
    json: ["output", "cost_breakdown"],
    jsonArray: ["audit_log"],
  },
  { table: "wallet_transactions", key: "walletTransactions", pk: ["id"] },
  { table: "reviews", key: "reviews", pk: ["id"] },
  { table: "events", key: "events", pk: ["id"] },
  { table: "api_keys", key: "apiKeys", pk: ["id"], textArray: ["scopes"] },
];

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

function literal(spec: TableSpec, column: string, value: unknown): string {
  if (spec.json?.includes(column)) return jsonLiteral(value);
  if (spec.jsonArray?.includes(column)) return jsonArrayLiteral(value);
  if (spec.textArray?.includes(column)) return textArrayLiteral(value);
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return numberLiteral(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return quote(value);
  throw new Error(
    `seed:sql — ${spec.table}.${column} has an unmappable value (${typeof value}). ` +
      "Declare it in the table's json / textArray / jsonArray list.",
  );
}

/**
 * Rows per INSERT. Kept small on purpose: gig contracts and order deliverables
 * are large jsonb blobs, and a 40-row batch produced ~80 KB single statements
 * that both git diffs and SQL parsers choke on. Ten keeps every statement under
 * ~25 KB.
 */
const CHUNK = 10;

function renderTable(spec: TableSpec, rowsOverride?: Record<string, unknown>[]): string {
  const rows = (rowsOverride ?? seed[spec.key]) as unknown as Record<string, unknown>[];
  if (rows.length === 0) return `-- ${spec.table}: no rows\n`;

  const columns = Object.keys(rows[0]);
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length !== columns.length || keys.some((k, i) => k !== columns[i])) {
      throw new Error(
        `seed:sql — ${spec.table} rows have inconsistent shapes; every row must ` +
          "have the same keys in the same order.",
      );
    }
  }

  const updatable = columns.filter((column) => !spec.pk.includes(column));
  const conflict =
    updatable.length === 0
      ? `on conflict (${spec.pk.join(", ")}) do nothing`
      : `on conflict (${spec.pk.join(", ")}) do update set\n    ` +
        updatable.map((column) => `${column} = excluded.${column}`).join(",\n    ");

  const parts: string[] = [
    `-- ${spec.table} (${rows.length} row${rows.length === 1 ? "" : "s"})`,
  ];

  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const chunk = rows.slice(offset, offset + CHUNK);
    const values = chunk
      .map((row) => `  (${columns.map((c) => literal(spec, c, row[c])).join(", ")})`)
      .join(",\n");
    parts.push(
      `insert into public.${spec.table} (${columns.join(", ")}) values\n${values}\n${conflict};`,
    );
  }

  return `${parts.join("\n")}\n`;
}

/**
 * `jobs.awarded_bid_id` is the schema's only cycle. Jobs go in first with a null
 * award; once the bids exist we patch the pointer back in.
 */
function renderAwardedBidUpdates(): string {
  const awarded = seed.jobs.filter((job) => job.awarded_bid_id !== null);
  if (awarded.length === 0) return "";
  const lines = awarded.map(
    (job) =>
      `update public.jobs set awarded_bid_id = ${quote(job.awarded_bid_id as string)} ` +
      `where id = ${quote(job.id)};`,
  );
  return [
    "-- jobs.awarded_bid_id (deferred: bids reference jobs, jobs reference bids)",
    ...lines,
    "",
  ].join("\n");
}

/**
 * `profiles.id` is `auth.users.id`, so the seed has to create the auth users
 * before the profiles. Guarded on the `auth` schema existing so the same file
 * also loads against a plain Postgres database.
 *
 * These users are created **without a usable password** (`encrypted_password`
 * is empty). That is deliberate: a committed seed must not ship a guessable
 * credential. Sign in with a magic link, or set a password from the Supabase
 * dashboard. See `supabase/README.md`.
 */
function renderAuthUsers(): string {
  const values = seed.profiles
    .map(
      (profile) =>
        `    (${quote(profile.id)}::uuid, ${quote(profile.handle)}, ` +
        `${quote(profile.display_name)}, ${quote(`${profile.handle}@agentdistrict.demo`)})`,
    )
    .join(",\n");

  return `-- ---------------------------------------------------------------------------
-- auth.users — one row per seeded profile
--
-- public.profiles.id references auth.users.id, so the auth rows come first.
-- Inserting here fires public.handle_new_user() (0002_rls.sql), which creates
-- the matching profiles + wallets rows; the upserts further down then fill in
-- the real display names, bios and balances.
--
-- No usable password is set. Use a magic link or set one in the dashboard.
-- ---------------------------------------------------------------------------
do $$
declare
  demo record;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    raise notice 'auth.users not present — skipping demo auth users';
    return;
  end if;

  for demo in
    select * from (values
${values}
    ) as t(id, handle, display_name, email)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      demo.id,
      'authenticated',
      'authenticated',
      demo.email,
      '',
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('handle', demo.handle, 'display_name', demo.display_name),
      false,
      '', '', '', ''
    )
    on conflict (id) do nothing;
  end loop;
end
$$;
`;
}

/** Did `SEED_WRITE_API_KEY` put the write key's row into the seed? */
const writeKeyIncluded = seed.apiKeys.some((key) => key.id === demoWriteApiKey.id);

/** Header lines saying whether this file carries the write-scoped key's row. */
const writeKeyNote = (
  writeKeyIncluded
    ? [
        "The write-scoped demo key's api_keys row is INCLUDED, because",
        `${DEMO_WRITE_API_KEY_ENV} was set. This file holds a digest of a private key:`,
        "load it into your own database and do not commit it.",
      ]
    : [
        "The write-scoped demo key is never committed, and its api_keys row is",
        `omitted. Set ${DEMO_WRITE_API_KEY_ENV} and regenerate to seed one for your`,
        "own database (and then do not commit the result).",
      ]
)
  .map((line) => `-- ${line}`)
  .join("\n");

function render(): string {
  const header = `-- =============================================================================
-- AgentDistrict — seed data
--
-- GENERATED FILE. Do not edit by hand.
-- Regenerate with:  npm run seed:sql
-- Source of truth:  lib/seed/*.ts
--
-- Deterministic: ids are UUIDv5, timestamps are relative to SEED_EPOCH
-- (${SEED_EPOCH}), and no randomness is used. Re-running this file
-- upserts every row, so it is safe to apply repeatedly.
--
-- Run it as the \`postgres\` / service role — \`supabase db reset\` does this for
-- you. Under the anon or authenticated role, RLS will reject most of it.
--
-- Rows: ${seedRowCount} across ${TABLES.length} tables
${TABLES.map((spec) => `--   ${spec.table.padEnd(20)} ${seedCounts[spec.key]}`).join("\n")}
--
-- The demo API key is public on purpose (it is printed on /developers):
--   ${DEMO_API_KEY}
--
${writeKeyNote}
-- =============================================================================

begin;

`;

  const body: string[] = [renderAuthUsers()];

  for (const spec of TABLES) {
    if (spec.table === "jobs") {
      // Insert jobs without their award pointer; patched after bids land.
      const deferred = seed.jobs.map((job) => ({ ...job, awarded_bid_id: null }));
      body.push(renderTable(spec, deferred as unknown as Record<string, unknown>[]));
      continue;
    }
    if (spec.table === "bids") {
      body.push(renderTable(spec));
      body.push(renderAwardedBidUpdates());
      continue;
    }
    body.push(renderTable(spec));
  }

  return `${header}${body.join("\n")}\ncommit;\n`;
}

function main(): void {
  // npm runs scripts from the package root, which is where supabase/ lives.
  const outPath = join(process.cwd(), "supabase", "seed.sql");
  const sql = render();

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, sql, "utf8");

  const kb = (Buffer.byteLength(sql, "utf8") / 1024).toFixed(1);
  console.log(`seed:sql — wrote supabase/seed.sql (${seedRowCount} rows, ${kb} KB)`);
  for (const spec of TABLES) {
    console.log(`  ${spec.table.padEnd(22)} ${String(seedCounts[spec.key]).padStart(4)}`);
  }
  if (writeKeyIncluded) {
    console.warn(
      `seed:sql — ${DEMO_WRITE_API_KEY_ENV} is set, so seed.sql now carries a digest of that ` +
        "private key. Load it into your own database; do not commit it.",
    );
  }
}

main();
