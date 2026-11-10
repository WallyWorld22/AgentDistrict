import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Pool } from "pg";

/** The database roles a Supabase key arrives as. */
export type PostgrestRole = "anon" | "service_role";

/**
 * A real `supabase-js` client whose PostgREST traffic a local Postgres answers.
 *
 * The Supabase adapter only speaks PostgREST, and the throwaway database from
 * `scripts/db-local.sh` has no PostgREST in front of it. This serves the
 * adapter's actual HTTP requests by translating the read subset it sends —
 * `select`, `eq.` / `in.` / `not.in.` filters, `order`, `limit`, `offset` on a
 * GET — into
 * one SQL statement run as `anon` (or `role`, below), so RLS applies exactly as
 * it does behind that key, and answers with the JSON array PostgREST would.
 *
 * `.maybeSingle()` is enforced by postgrest-js itself on the array it receives,
 * so a filter that matches two rows fails here with the same PGRST116 ("JSON
 * object requested, multiple (or no) rows returned") production returns.
 * `.single()` is answered with PostgREST's own 406.
 *
 * Anything outside that subset is answered with a 400 naming the request, never
 * guessed at, so a test cannot pass on a query this does not understand.
 *
 * It also serves `POST /rest/v1/rpc/<function>` — `supabase.rpc(name, args)` —
 * with named scalar arguments, again as that role, and **commits** (an RPC is how
 * the adapter writes; the Fight League's `decide_bout()` is one). Functions
 * returning a row type are what it understands, and the answer has PostgREST's
 * shape for them: a set-returning function gives an array of row objects, any
 * other the one row object (or `null`).
 *
 * And it serves the two plain writes the adapter makes through the table
 * endpoints: `POST /rest/v1/<table>` (`.insert(row)`, one object or an array)
 * and `PATCH /rest/v1/<table>?<eq filters>` (`.update(patch).eq(…)`), as that
 * role and **committed**. Only the columns the body names are written, so
 * every other column keeps its default exactly as PostgREST leaves it. With
 * `select=*` the written rows come back (`.select("*")`), otherwise nothing.
 *
 * `role` is the database role every request runs as: `anon` (the default) is
 * the anon-key client, `service_role` the service-role client an API-key or MCP
 * caller reaches Postgres through (`getRepoActingAs()` in `lib/data`).
 */
export function createPostgrestClient(
  pool: Pool,
  options: { role?: PostgrestRole } = {},
): SupabaseClient {
  const role = options.role ?? "anon";
  if (role !== "anon" && role !== "service_role") throw new Error(`unsupported role ${String(role)}`);
  return createClient("http://postgrest.test", `${role}-key`, {
    global: { fetch: postgrestFetch(pool, role) },
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
      const notList = /^not\.in\.\((.*)\)$/.exec(value);
      if (value.startsWith("eq.")) {
        params.push(value.slice(3));
        where.push(`${column} = $${params.length}`);
      } else if (list) {
        params.push(splitList(list[1]));
        where.push(`${column} = any($${params.length}::text[])`);
      } else if (notList) {
        // PostgREST's own translation, NULL semantics included.
        params.push(splitList(notList[1]));
        where.push(`not (${column} = any($${params.length}::text[]))`);
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

/**
 * `POST /rest/v1/<table>` or `PATCH /rest/v1/<table>?col=eq.v` → one
 * INSERT … RETURNING / UPDATE … RETURNING. The body is decoded with
 * `json_populate_record(set)` against the table's own row type, so every value
 * is cast exactly as Postgres would cast it.
 */
function translateWrite(
  url: URL,
  method: "POST" | "PATCH",
  body: unknown,
): { sql: string; params: unknown[]; returning: boolean } {
  const path = /^\/rest\/v1\/([^/]+)$/.exec(url.pathname);
  if (!path) throw new Unsupported(`path ${url.pathname}`);
  const table = identifier(path[1]);
  const rows: unknown[] = Array.isArray(body) ? body : [body];
  if (
    rows.length === 0 ||
    rows.some((row) => row === null || typeof row !== "object" || Array.isArray(row))
  ) {
    throw new Unsupported("write body that is not an object or an array of objects");
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row as object)))].map(identifier);
  if (columns.length === 0) throw new Unsupported("write with no columns");

  let returning = false;
  const params: unknown[] = [JSON.stringify(method === "POST" ? rows : rows[0])];
  const where: string[] = [];
  for (const [key, value] of url.searchParams) {
    if (key === "select") {
      if (value !== "*") throw new Unsupported(`write select ${JSON.stringify(value)}`);
      returning = true;
    } else if (key === "columns") {
      // postgrest-js names the inserted columns; the body already does.
    } else if (method === "PATCH" && value.startsWith("eq.")) {
      params.push(value.slice(3));
      where.push(`t.${identifier(key)}::text = $${params.length}`);
    } else {
      throw new Unsupported(`write parameter ${key}=${value}`);
    }
  }

  if (method === "POST") {
    const list = columns.join(", ");
    return {
      sql:
        `insert into public.${table} as t (${list}) ` +
        `select ${list} from json_populate_recordset(null::public.${table}, $1::json) ` +
        "returning row_to_json(t) as row",
      params,
      returning,
    };
  }
  // An unfiltered PATCH would rewrite the whole table; the adapter never
  // sends one.
  if (where.length === 0) throw new Unsupported("PATCH with no filter");
  return {
    sql:
      `update public.${table} t set ${columns.map((column) => `${column} = r.${column}`).join(", ")} ` +
      `from json_populate_record(null::public.${table}, $1::json) r ` +
      `where ${where.join(" and ")} returning row_to_json(t) as row`,
    params,
    returning,
  };
}

type Scalar = string | number | boolean | null;
/** An RPC argument as `pg` sends it: a scalar, an array (a Postgres array) or JSON text. */
type RpcParam = Scalar | Scalar[];

/** `POST /rest/v1/rpc/<fn>` with a JSON object body → one named-argument call. */
function translateRpc(url: URL, body: unknown): { name: string; sql: string; params: RpcParam[] } {
  const path = /^\/rest\/v1\/rpc\/([^/]+)$/.exec(url.pathname);
  if (!path) throw new Unsupported(`path ${url.pathname}`);
  const name = path[1];
  const fn = identifier(name);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Unsupported("rpc body that is not a JSON object");
  }
  const params: RpcParam[] = [];
  const isScalar = (value: unknown): value is Scalar =>
    value === null || ["string", "number", "boolean"].includes(typeof value);
  const args = Object.entries(body as Record<string, unknown>).map(([key, value]) => {
    // PostgREST hands a JSON array to a Postgres array parameter and a JSON
    // object to a json/jsonb one. `pg` sends a JS array as an array literal
    // and the object goes as its JSON text; both resolve against the
    // function's declared parameter types.
    if (Array.isArray(value) && value.every(isScalar)) params.push(value);
    else if (isScalar(value)) params.push(value);
    else if (typeof value === "object" && !Array.isArray(value)) params.push(JSON.stringify(value));
    else throw new Unsupported(`rpc argument ${key} of this shape`);
    return `${identifier(key)} => $${params.length}`;
  });
  return {
    name,
    sql: `select to_jsonb(r) as row from public.${fn}(${args.join(", ")}) r`,
    params,
  };
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function postgrestFetch(pool: Pool, role: PostgrestRole): typeof fetch {
  return async (input, init) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    const method = (init?.method ?? "GET").toUpperCase();
    const accept = new Headers(init?.headers).get("accept") ?? "";

    if (method === "POST" && url.pathname.startsWith("/rest/v1/rpc/")) {
      return callRpc(pool, role, url, typeof init?.body === "string" ? init.body : "");
    }
    if (method === "POST" || method === "PATCH") {
      const body = typeof init?.body === "string" ? init.body : "";
      return callWrite(pool, role, url, method, body, accept);
    }

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
      await connection.query(`set local role ${role}`);
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

async function callRpc(
  pool: Pool,
  role: PostgrestRole,
  url: URL,
  rawBody: string,
): Promise<Response> {
  let statement: { name: string; sql: string; params: RpcParam[] };
  try {
    statement = translateRpc(url, rawBody === "" ? {} : JSON.parse(rawBody));
  } catch (error) {
    if (!(error instanceof Unsupported) && !(error instanceof SyntaxError)) throw error;
    return respond(400, {
      code: "SHIM",
      message: `postgrest test shim cannot serve POST ${url.pathname}: unsupported ${error.message}`,
      details: null,
      hint: null,
    });
  }

  const connection = await pool.connect();
  try {
    await connection.query("begin");
    await connection.query(`set local role ${role}`);
    await connection.query("set local timezone to 'UTC'");
    const { rows } = await connection.query<{ row: unknown }>(statement.sql, statement.params);
    // PostgREST answers a set-returning function with an array and anything
    // else with its single value. `pg_proc` says which this one is.
    const { rows: shape } = await connection.query<{ set: boolean }>(
      `select bool_or(p.proretset) as set from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
      [statement.name],
    );
    await connection.query("commit");
    const data = rows.map((row) => row.row);
    return respond(200, shape[0]?.set ? data : (data[0] ?? null));
  } catch (error) {
    await connection.query("rollback").catch(() => undefined);
    const { code, message } = error as { code?: string; message?: string };
    return respond(400, { code: code ?? "", message: message ?? String(error), details: null, hint: null });
  } finally {
    connection.release();
  }
}

async function callWrite(
  pool: Pool,
  role: PostgrestRole,
  url: URL,
  method: "POST" | "PATCH",
  rawBody: string,
  accept: string,
): Promise<Response> {
  let statement: { sql: string; params: unknown[]; returning: boolean };
  try {
    statement = translateWrite(url, method, rawBody === "" ? null : JSON.parse(rawBody));
  } catch (error) {
    if (!(error instanceof Unsupported) && !(error instanceof SyntaxError)) throw error;
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
    await connection.query(`set local role ${role}`);
    await connection.query("set local timezone to 'UTC'");
    const { rows } = await connection.query<{ row: unknown }>(statement.sql, statement.params);
    await connection.query("commit");
    const data = rows.map((row) => row.row);
    if (!statement.returning) return new Response(null, { status: 204 });
    const status = method === "POST" ? 201 : 200;
    if (accept.includes("application/vnd.pgrst.object+json")) {
      if (data.length !== 1) {
        return respond(406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: `The result contains ${data.length} rows`,
          hint: null,
        });
      }
      return respond(status, data[0]);
    }
    return respond(status, data);
  } catch (error) {
    await connection.query("rollback").catch(() => undefined);
    const { code, message } = error as { code?: string; message?: string };
    return respond(400, { code: code ?? "", message: message ?? String(error), details: null, hint: null });
  } finally {
    connection.release();
  }
}
