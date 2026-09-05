import { isSupabaseDataMode } from "@/lib/supabase/env";
import { createDemoRepository, type DemoRepository } from "./demo";
import type { Repository, RepositoryMode } from "./repository";
import { SupabaseRepository } from "./supabase";

/**
 * `getRepo()` — the only way feature code reaches data (BUILD_SPEC §2).
 *
 * - `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` set and
 *   `DATA_MODE !== "demo"` → the **supabase** adapter.
 * - otherwise → the **demo** adapter, an in-memory store hydrated from
 *   `lib/seed`. Demo mutations are process-local and reset on cold start.
 *
 * One memoized singleton per adapter. The demo singleton *must* be shared, or
 * every request would get a fresh copy of the seed and mutations would vanish
 * between a Server Action and the redirect that follows it.
 *
 * The Supabase client is injected lazily so this module — and everything that
 * imports it, including unit tests — never pulls `next/headers` into a context
 * that has no request.
 */

let demoSingleton: DemoRepository | null = null;
let supabaseSingleton: SupabaseRepository | null = null;

export function getRepo(): Repository {
  if (isSupabaseDataMode()) {
    supabaseSingleton ??= new SupabaseRepository(async () => {
      const { createClient } = await import("@/lib/supabase/server");
      return createClient();
    });
    return supabaseSingleton;
  }
  demoSingleton ??= createDemoRepository();
  return demoSingleton;
}

/** Which adapter `getRepo()` will hand back, without constructing it. */
export function getRepoMode(): RepositoryMode {
  return isSupabaseDataMode() ? "supabase" : "demo";
}

/** True when the UI should show the "Demo data — resets on redeploy" banner. */
export function isDemoMode(): boolean {
  return getRepoMode() === "demo";
}

/** Test seam: drop the memoized adapters (used by `tests/unit`). */
export function resetRepoForTests(): void {
  demoSingleton = null;
  supabaseSingleton = null;
}

export { districtNow, districtNowIso } from "./clock";
export { DemoRepository, createDemoRepository } from "./demo";
export { SupabaseRepository, createSupabaseRepository } from "./supabase";
export type { Repository, RepositoryMode } from "./repository";
export * from "./errors";
