import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Pool } from "pg";

/**
 * A real `supabase-js` client whose PostgREST traffic a local Postgres answers.
 *
 * The Supabase adapter only speaks PostgREST, and the throwaway database from
 * `scripts/db-local.sh` has no PostgREST in front of it. This serves the
 * adapter's actual HTTP requests by translating the read subset it sends —
 * `select`, `eq.` / `in.` filters, `order`, `limit`, `offset` on a GET — into
 * one SQL statement run as `anon`, so RLS applies exactly as it does behind the
 * anon key, and answers with the JSON array PostgREST would.
 *
 * `.maybeSingle()` is enforced by postgrest-js itself on the array it receives,
 * so a filter that matches two rows fails here with the same PGRST116 ("JSON
 * object requested, multiple (or no) rows returned") production returns.
 * `.single()` is answered with PostgREST's own 406.
 *
 * Anything outside that subset is answered with a 400 naming the request, never
 * guessed at, so a test cannot pass on a query this does not understand.
 */
export function createPostgrestClient(pool: Pool): SupabaseClient {
  return createClient("http://postgrest.test", "anon-key", {
    global: { fetch: postgrestFetch(pool) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const ORDER_TERM = /^([a-z_][a-z0-9_]*)\.(asc|desc)(?:\.(nullsfirst|nullslast))?$/;

class Unsupported extends Error {}

function identifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Unsupported(`identifier ${JSON.stringify(name)}`);
  return `"${name}"`;
}

function integer(value: string): number {
  if (!/^\d+$/.test(value)) throw new Unsupported(`integer ${JSON.stringify(value)}`);
  return Number(value);
}

/** `a,"b,c",d` → `["a", "b,c", "d"]` — the list inside an `in.(...)` filter. */
function splitList(list: string): string[] {
  if (list === "") return [];
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of list) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else current += char;
  }
  values.push(current);
  return values;
}

/** The URL of one PostgREST read → one parameterised SQL statement. */
function translate(url: URL): { sql: string; params: unknown[] } {
  const path = /^\/rest\/v1\/([^/]+)$/.exec(url.pathname);
  if (!path) throw new Unsupported(`path ${url.pathname}`);
  const table = identifier(path[1]);

  const params: unknown[] = [];
  const where: string[] = [];
  let projection = "row_to_json(t)";
  let orderBy: string[] = [];
  let limit: number | null = null;
  let offset: number | null = null;

  for (const [key, value] of url.searchParams) {
    if (key === "select") {
      if (value !== "*") {
        const columns = value.split(",").map(identifier);
        projection = `json_build_object(${columns
          .map((column) => `'${column.slice(1, -1)}', t.${column}`)
          .join(", ")})`;
      }
    } else if (key === "order") {
      orderBy = value.split(",").map((term) => {
        const match = ORDER_TERM.exec(term);
        if (!match) throw new Unsupported(`order ${JSON.stringify(term)}`);
        const nulls = match[3] ? ` nulls ${match[3].slice(5)}` : "";
        return `t.${identifier(match[1])} ${match[2]}${nulls}`;
      });
    } else if (key === "limit") {
      limit = integer(value);
    } else if (key === "offset") {
      offset = integer(value);
    } else {
      // Compared as text: exact for the uuid / text / enum / boolean columns
      // the adapter filters on, and no per-column type map to keep in sync.
      const column = `t.${identifier(key)}::text`;
      const list = /^in\.\((.*)\)$/.exec(value);
      if (value.startsWith("eq.")) {
        params.push(value.slice(3));
        where.push(`${column} = $${params.length}`);
      } else if (list) {
        params.push(splitList(list[1]));
        where.push(`${column} = any($${params.length}::text[])`);
      } else {
        throw new Unsupported(`filter ${key}=${value}`);
      }
    }
  }

  const sql = [
    `select ${projection} as row from public.${table} t`,
    where.length ? `where ${where.join(" and ")}` : "",
    orderBy.length ? `order by ${orderBy.join(", ")}` : "",
    limit === null ? "" : `limit ${limit}`,
    offset === null ? "" : `offset ${offset}`,
  ]
    .filter(Boolean)
    .join(" ");
  return { sql, params };
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function postgrestFetch(pool: Pool): typeof fetch {
  return async (input, init) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    const method = (init?.method ?? "GET").toUpperCase();
    const accept = new Headers(init?.headers).get("accept") ?? "";

    let statement: { sql: string; params: unknown[] };
    try {
      if (method !== "GET") throw new Unsupported(`method ${method}`);
      statement = translate(url);
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      return respond(400, {
        code: "SHIM",
        message: `postgrest test shim cannot serve ${method} ${url.pathname}${url.search}: unsupported ${error.message}`,
        details: null,
        hint: null,
      });
    }

    const connection = await pool.connect();
    try {
      await connection.query("begin");
      await connection.query("set local role anon");
      await connection.query("set local timezone to 'UTC'");
      const { rows } = await connection.query<{ row: unknown }>(statement.sql, statement.params);
      await connection.query("rollback");
      const data = rows.map((row) => row.row);

      if (accept.includes("application/vnd.pgrst.object+json")) {
        if (data.length !== 1) {
          return respond(406, {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
            details: `The result contains ${data.length} rows`,
            hint: null,
          });
        }
        return respond(200, data[0]);
      }
      return respond(200, data);
    } catch (error) {
      await connection.query("rollback").catch(() => undefined);
      const { code, message } = error as { code?: string; message?: string };
      return respond(400, { code: code ?? "", message: message ?? String(error), details: null, hint: null });
    } finally {
      connection.release();
    }
  };
}
