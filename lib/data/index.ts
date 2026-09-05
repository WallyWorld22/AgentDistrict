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
 * The memo lives on `globalThis`, not in module scope: Next emits this module
 * into more than one server bundle (the page/Server-Action bundle and the
 * Route-Handler bundle), and a module-scoped `let` would give each bundle its
 * own store — everything the machine surface (REST + MCP) wrote would be
 * invisible to the UI, and the same credits could be spent twice.
 *
 * The Supabase client is injected lazily so this module — and everything that
 * imports it, including unit tests — never pulls `next/headers` into a context
 * that has no request.
 */

const DEMO_SLOT = Symbol.for("agentdistrict.demoRepository");
const SUPABASE_SLOT = Symbol.for("agentdistrict.supabaseRepository");

type RepoGlobal = {
  [DEMO_SLOT]?: DemoRepository;
  [SUPABASE_SLOT]?: SupabaseRepository;
};

const repoGlobal = globalThis as unknown as RepoGlobal;

export function getRepo(): Repository {
  if (isSupabaseDataMode()) {
    return (repoGlobal[SUPABASE_SLOT] ??= new SupabaseRepository(async () => {
      const { createClient } = await import("@/lib/supabase/server");
      return createClient();
    }));
  }
  return (repoGlobal[DEMO_SLOT] ??= createDemoRepository());
}

/**
 * A repository that acts as `profileId` **without a browser session** — how an
 * API-key or MCP caller reaches the data layer.
 *
 * In demo mode the store is already process-local and unauthenticated, so the
 * ordinary repository is right. In supabase mode a machine caller has no JWT,
 * so a cookie-built client would arrive as `anon`: reads of `orders`, `wallets`
 * and `threads` return zero rows and every write is refused by RLS. This binds
 * the service-role client to one profile instead; the money/event RPCs receive
 * the same id as `p_actor`.
 *
 * Returns `null` when `SUPABASE_SERVICE_ROLE_KEY` is not configured — the
 * caller then falls back to the session-scoped repository (reads still work).
 */
export function getRepoActingAs(profileId: string): Repository | null {
  if (!isSupabaseDataMode()) return null;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return new SupabaseRepository(
    async () => {
      const { createServiceClient } = await import("@/lib/supabase/service");
      return createServiceClient();
    },
    { actAs: profileId },
  );
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
  delete repoGlobal[DEMO_SLOT];
  delete repoGlobal[SUPABASE_SLOT];
}

export { districtNow, districtNowIso } from "./clock";
export { DemoRepository, createDemoRepository } from "./demo";
export { SupabaseRepository, createSupabaseRepository } from "./supabase";
export type { Repository, RepositoryMode } from "./repository";
export * from "./errors";
