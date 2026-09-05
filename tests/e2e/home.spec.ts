import { expect, test, type Page } from "@playwright/test";

/**
 * The Home dashboard (BUILD_SPEC §4, `docs/reference/desktop-home.png` and
 * `docs/reference/mobile-screens.png`).
 *
 * `tests/e2e/smoke.spec.ts` already pins the reference *content* — the four
 * hero counters, the eight section headings, `$0.79`, `▲ +312`. This file
 * covers the things only a real browser can prove: the room chips filter the
 * presence scene without navigating, the Lounge composer posts through the
 * Server Action and the line survives a reload, and the mobile entry points
 * lead where they say they do.
 */

const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 390, height: 844 } as const;

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    box.scrollWidth,
    `${label} overflows horizontally (${box.scrollWidth} > ${box.clientWidth})`,
  ).toBeLessThanOrEqual(box.clientWidth);
}

/** Names of the agents currently seated in the Lounge scene. */
function sceneNames(page: Page) {
  return page.locator('[data-testid="lounge-scene"] a[href^="/agents/"] b');
}

test.describe("home dashboard (desktop)", () => {
  test.use({ viewport: DESKTOP });

  test("renders every reference section exactly once", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("AGENTDISTRICT");
    await expect(page.getByText("The place for agents.").first()).toBeVisible();

    for (const heading of [
      "The Lounge",
      "Lounge Chat",
      "District TV",
      "Featured Gigs",
      "Open Jobs",
      "Agent Showroom",
      "Top Guilds",
      "Trending Agents",
      "Machine entrance",
    ]) {
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }

    // The hero billboard from the reference composition.
    await expect(page.getByText("A brighter", { exact: true })).toBeVisible();
    await expect(page.getByText("built by", { exact: true })).toBeVisible();
    await expect(page.getByText("A more capable world.")).toBeVisible();

    await expectNoHorizontalOverflow(page, "home at 1440");
  });

  test("a room chip filters the presence scene without navigating", async ({
    page,
  }) => {
    await page.goto("/");

    const scene = page.locator('[data-testid="lounge-scene"]');
    await expect(scene).toBeVisible();

    const all = await sceneNames(page).allInnerTexts();
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all).toContain("Scout");

    const buildLab = page.getByRole("button", { name: /Build Lab/ });
    await buildLab.click();

    await expect(buildLab).toHaveAttribute("aria-pressed", "true");
    await expect(sceneNames(page)).toContainText(["WebBuilder"]);

    const filtered = await sceneNames(page).allInnerTexts();
    expect(filtered).not.toContain("Scout");
    expect(filtered.length).toBeLessThan(all.length);

    // Client-side: no navigation, no query string.
    expect(new URL(page.url()).pathname).toBe("/");
    expect(new URL(page.url()).search).toBe("");

    // The caption follows the filter and offers the real room page.
    await expect(page.getByRole("link", { name: /Open Build Lab/ })).toHaveAttribute(
      "href",
      "/lounge/build-lab",
    );

    await page.getByRole("button", { name: /All Rooms/ }).click();
    await expect(sceneNames(page)).toContainText(["Scout"]);
  });

  test("the Lounge composer posts, appears and survives a reload", async ({
    page,
  }) => {
    await page.goto("/");

    const body = `e2e lounge line ${Date.now()}`;
    await page.getByLabel("Message the Lounge").fill(body);
    await page.getByRole("button", { name: "Send to the Lounge" }).click();

    // Optimistic append, then the stored row after revalidation.
    await expect(page.getByText(body)).toBeVisible();

    await page.reload();
    await expect(page.getByText(body)).toBeVisible();
  });

  test("chat highlights #rooms and @mentions", async ({ page }) => {
    await page.goto("/");

    // Seeded lines carry both (lib/seed/lounge.ts).
    const room = page.getByRole("link", { name: "#research-pit" });
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("href", "/lounge/research-pit");
    await expect(page.getByText("@MapFox", { exact: true })).toBeVisible();
  });

  test("District TV shows the live show and both host figures", async ({ page }) => {
    await page.goto("/");

    const tv = page.getByTestId("tv-card");
    await expect(tv.getByText("LIVE", { exact: true })).toBeVisible();
    await expect(tv.getByText(/watching/)).toBeVisible();
    await expect(tv.getByText("Otto", { exact: true })).toBeVisible();
    await expect(tv.getByText("Wally", { exact: true })).toBeVisible();

    await expect(
      page.getByRole("link", { name: /Watch Live/ }),
    ).toHaveAttribute("href", "/tv/the-otto-and-wally-show");
    await expect(page.getByRole("link", { name: /Live Chat/ })).toHaveAttribute(
      "href",
      "/tv/the-otto-and-wally-show#chat",
    );
  });

  test("featured gigs, open jobs and the showroom link into the marketplace", async ({
    page,
  }) => {
    await page.goto("/");

    // Three featured gigs, each a real listing with a price and an SLA.
    const gigs = page.getByRole("link", { name: /Starting at/ });
    await expect(gigs).toHaveCount(3);
    await expect(page.getByText("$0.79")).toBeVisible();

    // Four bounty rows plus the Post a Job control.
    await expect(page.getByRole("link", { name: "Post a Job" })).toHaveAttribute(
      "href",
      "/jobs/new",
    );
    const jobRows = page.locator('a[href^="/jobs/"]:not([href="/jobs/new"])');
    await expect(jobRows).toHaveCount(4);

    // The showroom demo reveals RoofIntel's four fields and offers a try.
    for (const field of ["Address", "Roof Area", "Est. Replacement", "Storm Risk"]) {
      await expect(page.getByText(field, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Try It Now" })).toHaveAttribute(
      "href",
      "/showrooms",
    );

    // Trending deltas from the reference.
    await expect(page.getByText("▲ +312")).toBeVisible();
  });

  test("the machine entrance links to real endpoints", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: /agent-card\.json/ }),
    ).toHaveAttribute("href", "/.well-known/agent-card.json");
    await expect(page.getByRole("link", { name: /agents\/search/ })).toHaveAttribute(
      "href",
      "/openapi.json",
    );
    await expect(page.getByRole("link", { name: /api\/mcp\/mcp/ })).toHaveAttribute(
      "href",
      "/developers",
    );

    const response = await page.request.get("/.well-known/agent-card.json");
    expect(response.status()).toBe(200);
  });
});

test.describe("home dashboard (mobile)", () => {
  test.use({ viewport: MOBILE });

  test("opens with the @World prompt and the Explore Agent Hubs grid", async ({
    page,
  }) => {
    await page.goto("/");

    const world = page.getByRole("region", { name: "@World concierge" });
    await expect(world).toBeVisible();
    await expect(world.getByLabel("What do you need from @World?")).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Explore Agent Hubs" }),
    ).toBeVisible();

    for (const [title, category] of [
      ["Local Business", "operations"],
      ["Developers", "development"],
      ["Research", "research"],
      ["Home Services", "home_services"],
    ] as const) {
      const tile = page
        .getByTestId("agent-hubs")
        .getByRole("link", { name: new RegExp(`^${title}`) });
      await expect(tile).toHaveAttribute("href", `/agents?category=${category}`);
      await expect(tile.getByText(/agents? online/)).toBeVisible();
      // Tap targets stay comfortable.
      const box = await tile.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
    }

    await expectNoHorizontalOverflow(page, "home at 390");
  });

  test("a hub tile lands on the filtered passport directory", async ({ page }) => {
    await page.goto("/");
    await page
      .getByTestId("agent-hubs")
      .getByRole("link", { name: /^Research/ })
      .click();
    await page.waitForURL("**/agents?category=research");
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("every section is reachable and nothing is clipped", async ({ page }) => {
    await page.goto("/");

    for (const heading of [
      "The Lounge",
      "Lounge Chat",
      "District TV",
      "Featured Gigs",
      "Open Jobs",
      "Agent Showroom",
      "Top Guilds",
      "Trending Agents",
      "Machine entrance",
    ]) {
      const node = page.getByRole("heading", { name: heading, exact: true });
      await node.scrollIntoViewIfNeeded();
      await expect(node).toBeVisible();
    }

    await expectNoHorizontalOverflow(page, "home at 390 (scrolled)");
  });

  test("the room chips still filter the scene on a phone", async ({ page }) => {
    await page.goto("/");

    const scene = page.locator('[data-testid="lounge-scene"]');
    await scene.scrollIntoViewIfNeeded();

    const chip = page.getByRole("button", { name: /Home Services/ });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(sceneNames(page)).toContainText(["ParcelPro"]);
  });
});
