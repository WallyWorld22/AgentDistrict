import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REGISTERED_AGENT_SCOPES } from "@/lib/data/types";
import {
  DISTRICT_DESK_HANDLE,
  DISTRICT_DESK_NAME,
  INTRODUCE_HREF,
  WELCOME_CAP,
  WELCOME_CTA_LABEL,
} from "@/lib/data/ext/welcome";

/**
 * The automatic welcome is written twice: by `lib/data/ext/welcome.ts` for the
 * demo adapter and by `register_agent()` in SQL for every Supabase caller,
 * including a direct service-role RPC. These pin the SQL a database that ran
 * every migration ends up with to the TypeScript constants; the welcome's text
 * itself is compared against a real Postgres in
 * `tests/integration/welcome.test.ts`.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const WELCOME_MIGRATION = "0019_welcome.sql";

/** The last `register_agent()` declaration across the migration chain. */
function lastRegisterAgent(): { file: string; body: string } {
  let found: { file: string; body: string } | null = null;
  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const at = sql.lastIndexOf("create or replace function public.register_agent(");
    if (at >= 0) {
      const end = sql.indexOf("\n$$;", at);
      if (end < 0) throw new Error(`unterminated register_agent in ${file}`);
      found = { file, body: sql.slice(at, end) };
    }
  }
  if (!found) throw new Error("no migration declares register_agent");
  return found;
}

function constant(body: string, name: string): string {
  const match = new RegExp(`${name}\\s+constant\\s+\\w+\\s*:=\\s*([^;]+);`).exec(body);
  if (!match) throw new Error(`no constant ${name}`);
  return match[1].trim();
}

describe("register_agent() welcomes with the TypeScript's words and limits", () => {
  it("is declared last by the welcome migration", () => {
    const { file } = lastRegisterAgent();
    expect(file >= WELCOME_MIGRATION, `${file} still declares register_agent() last`).toBe(true);
  });

  it("signs, links and caps exactly as lib/data/ext/welcome.ts does", () => {
    const { body } = lastRegisterAgent();
    expect(constant(body, "c_desk_handle")).toBe(`'${DISTRICT_DESK_HANDLE}'`);
    expect(constant(body, "c_desk_name")).toBe(`'${DISTRICT_DESK_NAME}'`);
    expect(constant(body, "c_welcome_href")).toBe(`'${INTRODUCE_HREF}'`);
    expect(constant(body, "c_welcome_cta")).toBe(`'${WELCOME_CTA_LABEL}'`);
    expect(constant(body, "c_welcome_limit")).toBe(String(WELCOME_CAP.limit));
    expect(constant(body, "c_welcome_window")).toBe(
      `interval '${WELCOME_CAP.windowMinutes} minutes'`,
    );
    // The cap is counted under a lock, so two concurrent registrations cannot
    // both slip under it.
    expect(body).toContain("pg_advisory_xact_lock");
  });

  it("keeps the self-registered scope allow-list in step with REGISTERED_AGENT_SCOPES", () => {
    const { body } = lastRegisterAgent();
    const list = /v_allowed\s+text\[\]\s*:=\s*array\[([^\]]*)\]/.exec(body);
    if (!list) throw new Error("no v_allowed list");
    const scopes = [...list[1].matchAll(/'([a-z]+:[a-z]+)'/g)].map((match) => match[1]);
    expect(new Set(scopes)).toEqual(new Set(REGISTERED_AGENT_SCOPES));
    expect(scopes).toHaveLength(REGISTERED_AGENT_SCOPES.length);
  });

  it("stays server-only, as 0014 made it", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, WELCOME_MIGRATION), "utf8");
    expect(sql).toMatch(
      /revoke execute on function public\.register_agent\([^;]*\) from public, anon, authenticated;/,
    );
    expect(sql).toMatch(/grant execute on function public\.register_agent\([^;]*\) to service_role;/);
  });
});
