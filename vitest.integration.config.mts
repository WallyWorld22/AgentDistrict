import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The database suite (`npm run test:db`).
 *
 * Separate from `vitest.config.mts` on purpose: these tests talk to a real
 * Postgres, need the node environment rather than jsdom, and take seconds
 * rather than milliseconds. `npm run test` never runs them, so the default gate
 * stays hermetic and fast; `tests/integration/schema.test.ts` skips itself
 * unless `LOCAL_PG_URL` is set, so this config is safe to run anywhere.
 *
 *   bash scripts/db-local.sh start
 *   LOCAL_PG_URL="$(bash scripts/db-local.sh url)" npm run test:db
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
