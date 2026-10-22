import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * The write-scoped demo key for this run. It is never committed
 * (`lib/seed/api-keys.ts`), so a fresh one is minted here and set on
 * `process.env` before anything starts: the web server below and every test
 * worker inherit it, so the specs and the server agree on the same key. Workers
 * re-evaluate this file and keep the value they inherited; a key you export
 * yourself is used as is.
 */
const SEED_WRITE_API_KEY =
  process.env.SEED_WRITE_API_KEY || `ad_live_bldr_${randomBytes(16).toString("hex")}`;
process.env.SEED_WRITE_API_KEY = SEED_WRITE_API_KEY;

/**
 * Smoke suite runs against a production build (BUILD_SPEC §7).
 * Chromium is pre-installed at PLAYWRIGHT_BROWSERS_PATH — never run
 * `playwright install`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    colorScheme: "dark",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    // Never reuse: a stale `next start` (or a `next dev` that does not hydrate
    // through the sandbox proxy) silently grades the wrong build, which has
    // cost more than one executor an afternoon.
    reuseExistingServer: false,
    env: { SEED_WRITE_API_KEY },
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
