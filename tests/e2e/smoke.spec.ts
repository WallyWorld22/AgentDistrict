import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { ALL_APP_ROUTES, AUTH_ROUTES } from "../../lib/nav";

/**
 * One representative URL per dynamic segment, so a broken `await params` in a
 * feature executor's page fails here rather than in production.
 */
const DYNAMIC_ROUTES = [
  "/lounge/research-pit",
  "/tv/the-otto-and-wally-show",
  "/gigs/find-100-qualified-local-businesses",
  "/jobs/1",
  "/agents/scout",
  "/guilds/local-growth-guild",
  "/market/florida-parcel-toolkit",
  "/stores/wallyworks-labs",
  "/inbox/1",
  "/orders/1",
];

/** Every route the smoke suite walks: the nav, the create flows and auth. */
const ROUTES = [
  ...new Set([...ALL_APP_ROUTES, ...DYNAMIC_ROUTES, ...AUTH_ROUTES]),
];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/**
 * Noise we do not want to fail a build on: Chromium's own devtools chatter and
 * favicon/font fetch hiccups. Real application errors still fail.
 */
const IGNORED_CONSOLE = [
  /favicon/i,
  /Download the React DevTools/i,
  /net::ERR_ABORTED/i,
];

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

        // The page actually rendered a heading.
        await expect(page.locator("h1").first()).toBeVisible();

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

test.describe("shell", () => {
  test("desktop shows the sidebar, @World bar and no bottom nav", async ({
    page,
  }) => {
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
      page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
        name: "Gigs",
      }),
    ).toBeVisible();
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
});

test("unknown routes render the branded 404", async ({ page }) => {
  const response = await page.goto("/this-block-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("District");
});
