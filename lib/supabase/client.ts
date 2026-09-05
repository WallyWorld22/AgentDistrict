"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client. Returns `null` in demo mode (no env vars) so
 * callers can degrade instead of throwing.
 */
export function createClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  if (!cached) cached = createBrowserClient(env.url, env.anonKey);
  return cached;
}
