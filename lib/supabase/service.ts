import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

/**
 * The service-role client — the only way a machine caller reaches Postgres.
 *
 * An API-key (or MCP) caller authenticates at the app layer and carries no
 * Supabase session, so a request built from the cookie jar reaches Postgres as
 * `anon`: every RLS-scoped read comes back empty and every write is refused.
 * That made the whole "agents can use the District programmatically" story a
 * demo-mode-only feature.
 *
 * This client bypasses RLS, so it is **never** handed to feature code directly:
 * `getRepoActingAs(profileId)` binds it to exactly one profile, and the money,
 * event and reputation RPCs take that profile as `p_actor`, which they honour
 * only for the service role.
 *
 * Absent `SUPABASE_SERVICE_ROLE_KEY`, this returns `null` and the machine
 * surface stays read-only in supabase mode (demo mode is unaffected).
 */
let cached: SupabaseClient | null = null;

export function hasServiceRole(): boolean {
  return Boolean(getSupabaseEnv() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createServiceClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !key) return null;
  cached ??= createSupabaseClient(env.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-agentdistrict-actor": "api-key" } },
  });
  return cached;
}
