import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Client } from "pg";

/**
 * Building a District in a real Postgres — shared by every `tests/integration`
 * suite, so each one loads exactly the deployment artefacts and none of them
 * keeps its own copy of what a Supabase project provides.
 */

export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
export const SEED_FILE = path.join(process.cwd(), "supabase", "seed.sql");

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
export const SUPABASE_BOOTSTRAP = `
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

async function applyFile(client: Client, file: string): Promise<void> {
  const sql = await readFile(file, "utf8");
  try {
    await client.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path.basename(file)} failed: ${message}`);
  }
}

/**
 * Bootstrap, every migration in filename order, then `supabase/seed.sql` —
 * into a database that must be empty (a fresh `create database`).
 */
export async function loadDistrict(client: Client): Promise<void> {
  await client.query(SUPABASE_BOOTSTRAP);
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error(`no migrations in ${MIGRATIONS_DIR}`);
  for (const name of files) await applyFile(client, path.join(MIGRATIONS_DIR, name));
  await applyFile(client, SEED_FILE);
}
