import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { ALL_APP_ROUTES, AUTH_ROUTES } from "../../lib/nav";
import { DEMO_ORDER_IDS, jobId, seed } from "../../lib/seed";

/**
 * One representative URL per dynamic segment, so a broken `await params` in a
 * page fails here rather than in production. Ids come from the seed, which is
 * deterministic in both data modes.
 */
const DYNAMIC_ROUTES = [
  "/lounge/research-pit",
  "/tv/the-otto-and-wally-show",
  "/gigs/find-100-qualified-local-businesses",
  `/jobs/${jobId("500-reroof-opportunities-orlando")}`,
  "/agents/scout",
  "/guilds/local-growth-guild",
  "/market/florida-parcel-toolkit",
  "/stores/wallyworks-labs",
  `/inbox/${seed.threads[0].id}`,
  `/orders/${DEMO_ORDER_IDS[0]}`,
];

/**
 * A nonexistent slug on each dynamic segment must 404, not render a shell with
 * an empty body. Without this the suite happily passes on pages that never look
 * their record up.
 */
const NOT_FOUND_ROUTES = [
  "/lounge/does-not-exist",
  "/tv/does-not-exist",
  "/gigs/does-not-exist",
  "/jobs/00000000-0000-0000-0000-000000000000",
  "/agents/does-not-exist",
  "/guilds/does-not-exist",
  "/market/does-not-exist",
  "/stores/does-not-exist",
  "/inbox/00000000-0000-0000-0000-000000000000",
  "/orders/00000000-0000-0000-0000-000000000000",
];

/** Every route the smoke suite walks: the nav, the create flows and auth. */
const ROUTES = [...new Set([...ALL_APP_ROUTES, ...DYNAMIC_ROUTES, ...AUTH_ROUTES])];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/**
 * Noise we do not want to fail a build on: Chromium's own devtools chatter and
 * favicon fetch hiccups. `net::ERR_ABORTED` is deliberately **not** ignored —
 * it is how a genuinely failed sub-resource fetch reports itself.
 */
const IGNORED_CONSOLE = [/favicon/i, /Download the React DevTools/i];

function collectErrors(page: Page, sink: string[]) {
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    sink.push(`console.error: ${text}`);
  });
  page.on("pageerror", (error) => {
    sink.push(`pageerror: ${error.message}`);
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`loads ${route}`, async ({ page }) => {
        const errors: string[] = [];
        collectErrors(page, errors);

        const response = await page.goto(route, { waitUntil: "load" });

        // 200 OK.
        expect(response, `no response for ${route}`).not.toBeNull();
        expect(response!.status(), `status for ${route}`).toBe(200);

        // Exactly one visible <h1> — a second one is an outline bug, and
        // `.first()` would never catch it.
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator("h1")).toBeVisible();

        // No horizontal page scroll, ever (BUILD_SPEC §3).
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(
          overflow.scrollWidth,
          `${route} overflows horizontally (${overflow.scrollWidth} > ${overflow.clientWidth})`,
        ).toBeLessThanOrEqual(overflow.clientWidth);

        // No console errors.
        expect(errors, `${route} logged console errors`).toEqual([]);
      });
    }
  });
}

test.describe("unknown records 404", () => {
  for (const route of NOT_FOUND_ROUTES) {
    test(`404s ${route}`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "load" });
      expect(response?.status(), `${route} should not resolve`).toBe(404);
    });
  }
});

/**
 * Content assertions: a page that renders its shell and an empty body passes
 * every structural check above, so each surface asserts something only real
 * data can produce.
 */
test.describe("pages render real data", () => {
  test("home reproduces the reference dashboard", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // The four hero counters from docs/reference/desktop-home.png.
    await expect(page.getByText("12,482", { exact: true })).toBeVisible();
    await expect(page.getByText("Agents Online", { exact: true })).toBeVisible();
    await expect(page.getByText("3,921", { exact: true })).toBeVisible();
    await expect(page.getByText("24,118", { exact: true })).toBeVisible();
    await expect(page.getByText("842", { exact: true })).toBeVisible();

    // The reference sections.
    for (const heading of [
      "The Lounge",
      "Lounge Chat",
      "District TV",
      "Featured Gigs",
      "Open Jobs",
      "Agent Showroom",
      "Top Guilds",
      "Trending Agents",
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }

    // Featured Gigs and Trending Agents come from the repository.
    await expect(page.getByText("$0.79").first()).toBeVisible();
    await expect(page.getByText("▲ +312")).toBeVisible();
  });

  test("gigs lists real gigs and filters by category", async ({ page }) => {
    await page.goto("/gigs");
    const cards = page.locator('a[href^="/gigs/"]');
    expect(await cards.count()).toBeGreaterThan(4);

    await page.goto("/gigs?category=development");
    await expect(page.getByRole("link", { name: "Development" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await page.locator('a[href^="/gigs/"]').count()).toBeGreaterThan(0);
  });

  test("agent passport shows reputation from the repository", async ({ page }) => {
    await page.goto("/agents/scout");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Scout");
    await expect(page.getByText("4.96", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Machine block" })).toBeVisible();
    await expect(page.getByText("agent-card.json").first()).toBeVisible();
  });

  test("jobs publishes the procurement ranking formula", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.getByRole("heading", { name: "Procurement ranking" })).toBeVisible();
    await expect(page.getByText(/0\.35 × quality/)).toBeVisible();
  });

  test("a job detail lists its bids", async ({ page }) => {
    await page.goto(`/jobs/${jobId("500-reroof-opportunities-orlando")}`);
    await expect(page.getByRole("heading", { name: /^Bids \(/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Lowest" })).toBeVisible();
  });

  test("wallet shows the seeded balance and ledger", async ({ page }) => {
    await page.goto("/wallet");
    await expect(page.getByText("$12.43").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
  });

  test("@World routes an outcome to a guild", async ({ page }) => {
    await page.goto(
      `/world?outcome=${encodeURIComponent("Find 200 roofing companies in Tampa under $10")}`,
    );
    await expect(page.getByRole("heading", { name: "Ranked agents" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Proposed guild" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Assemble & run" })).toBeVisible();
  });

  test("developers publishes the read-only demo key and MCP tools", async ({ page }) => {
    await page.goto("/developers");
    await expect(page.getByText("ad_live_demo_2f8c41a7b09e4d63").first()).toBeVisible();
    await expect(page.getByText("assemble_guild").first()).toBeVisible();
  });

  test("an order shows progress and the simulated-run label", async ({ page }) => {
    await page.goto(`/orders/${DEMO_ORDER_IDS[0]}`);
    await expect(page.getByText("Simulated run").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  });
});

test.describe("shell", () => {
  test("desktop shows the sidebar, @World bar and no bottom nav", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(
      page.getByRole("complementary", { name: "District navigation" }),
    ).toBeVisible();
    await expect(page.getByLabel("Tell @World what you need")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start a conversation" })).toBeVisible();
  });

  test("mobile shows the bottom nav and the @World button", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Ask @World" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Primary (mobile)" }).getByRole("link", {
        name: "Gigs",
      }),
    ).toBeVisible();
  });

  test("mobile search opens a sheet with a real input", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByRole("button", { name: "Open search" }).click();
    const input = page.getByLabel("Search agents, gigs and jobs");
    await expect(input).toBeVisible();
    await input.fill("roof");
    await page.getByRole("dialog").getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/agents\?q=roof/);
  });

  test("the shell shows live wallet and inbox numbers", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // balance − held = 2480 − 1237 (BUILD_SPEC §3 credits pill).
    await expect(page.getByLabel("Wallet — $12.43 in credits")).toBeVisible();
    await expect(page.getByLabel("Notifications — 3 unread")).toBeVisible();
  });

  test("active nav state follows the pathname", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/gigs");

    await expect(
      page
        .getByRole("complementary", { name: "District navigation" })
        .getByRole("link", { name: "Gigs" }),
    ).toHaveAttribute("aria-current", "page");
  });
});

test.describe("machine surface", () => {
  const JSON_ENDPOINTS = [
    "/.well-known/agent-card.json",
    "/.well-known/agents.json",
    "/openapi.json",
    "/api/v1/stats",
    "/agents/scout/agent-card.json",
  ];

  for (const endpoint of JSON_ENDPOINTS) {
    test(`serves ${endpoint}`, async ({ request }) => {
      const response = await request.get(endpoint);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("application/json");
      expect(await response.json()).toBeTruthy();
    });
  }

  for (const endpoint of ["/llms.txt", "/skill.md"]) {
    test(`serves ${endpoint}`, async ({ request }) => {
      const response = await request.get(endpoint);
      expect(response.status()).toBe(200);
      expect((await response.text()).length).toBeGreaterThan(50);
    });
  }

  test("/api/v1/stats answers with verifiable counters only", async ({ request }) => {
    const body = (await (await request.get("/api/v1/stats")).json()) as Record<
      string,
      unknown
    >;
    expect(body.agentsOnline).toBeGreaterThan(0);
    // The cosmetic home-hero baseline is not part of the machine surface.
    expect(body.headline).toBeUndefined();
  });

  test("the public demo key cannot write", async ({ request }) => {
    const response = await request.post("/api/v1/jobs", {
      headers: { authorization: "Bearer ad_live_demo_2f8c41a7b09e4d63" },
      data: {
        title: "Should never be created",
        description: "Posted with the public read-only demo key.",
        category: "research",
        budget_cents: 500,
        deadline_seconds: 1800,
        required_output: { format: "csv" },
      },
    });
    expect(response.status()).toBe(403);
  });

  test("a malformed bearer token is rejected, not downgraded", async ({ request }) => {
    const response = await request.get("/api/v1/orders/some-id", {
      headers: { authorization: "Bearer totally-invalid" },
    });
    expect(response.status()).toBe(401);
  });
});

test("unknown routes render the branded 404", async ({ page }) => {
  const response = await page.goto("/this-block-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("District");
});
