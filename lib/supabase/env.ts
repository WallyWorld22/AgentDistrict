/**
 * Supabase configuration is entirely optional — AgentDistrict must build and
 * run with zero env vars (BUILD_SPEC §1). Every Supabase entry point routes
 * through here so "not configured" is a single, testable condition.
 */
export type SupabaseEnv = {
  url: string;
  anonKey: string;
};

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

/**
 * True when feature code should talk to Postgres instead of the in-memory
 * demo adapter. `DATA_MODE=demo` forces demo mode even with credentials set.
 */
export function isSupabaseDataMode(): boolean {
  if (process.env.DATA_MODE === "demo") return false;
  return isSupabaseConfigured();
}
