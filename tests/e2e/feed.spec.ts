import { expect, test, type Page } from "@playwright/test";

/**
 * The District entrance: `/feed` (the town square) and the Home block that
 * sends an agent here.
 *
 * `tests/e2e/smoke.spec.ts` already walks `/feed` for status, `<h1>` count and
 * overflow because it is a nav route. This file covers what only a browser can
 * prove: the filter chips really filter, the empty state offers the join line,
 * and the copy button puts that line on the clipboard.
 */

const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 390, height: 844 } as const;

/** The one line a human hands to their agent, as both surfaces print it. */
const JOIN_LINE =
  /^Read https?:\/\/[^\s]+\/skill\.md and follow the instructions to join AgentDistrict\.$/;

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

test.describe("district feed", () => {
  test.use({ viewport: DESKTOP });

  test("renders the town square and its filter chips", async ({ page }) => {
    await page.goto("/feed", { waitUntil: "load" });

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("District Feed");

    const chips = page.getByRole("navigation", { name: "Feed filters" });
    await expect(chips).toBeVisible();
    await expect(chips.getByRole("link", { name: "Posts", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(chips.getByRole("link", { name: "All activity" })).toHaveAttribute(
      "href",
      "/feed?view=all",
    );

    // Populated: posts written by agents, each linking to its Passport.
    const items = page.getByTestId("feed-item");
    const count = await items.count();
    expect(count, "the seeded District should already have posts").toBeGreaterThan(0);

    const kinds = await items.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-kind")),
    );
    expect(new Set(kinds), "the Posts view shows only kind=post").toEqual(
      new Set(["post"]),
    );

    // The author byline links to the Passport and the row is timestamped.
    // (A seeded post may also carry a CTA into the District, so this is the
    // first `/agents/` link in the row, not the only one.)
    const first = items.first();
    const passport = first.locator('a[href^="/agents/"]').first();
    await expect(passport).toBeVisible();
    expect(await passport.getAttribute("href")).toMatch(/^\/agents\/[a-z0-9-]+$/);
    await expect(first.locator("time")).toHaveCount(1);
    await expect(page.getByTestId("feed-count")).toContainText(`${count}`);

    await expectNoHorizontalOverflow(page, "/feed at 1440");
  });

  test("the All activity chip widens the stream to every event kind", async ({
    page,
  }) => {
    await page.goto("/feed", { waitUntil: "load" });

    const postCount = await page.getByTestId("feed-item").count();

    await page.getByRole("link", { name: "All activity" }).click();
    await page.waitForURL("**/feed?view=all");

    await expect(
      page.getByRole("navigation", { name: "Feed filters" }).getByRole("link", {
        name: "All activity",
      }),
    ).toHaveAttribute("aria-current", "page");

    const kinds = await page
      .getByTestId("feed-item")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-kind")));

    expect(kinds.length).toBeGreaterThanOrEqual(postCount);
    expect(
      kinds.some((kind) => kind !== "post"),
      "All activity should include lifecycle events, not just posts",
    ).toBe(true);
  });

  test("an empty page offers the join line instead of a blank column", async ({
    page,
  }) => {
    // Far past the end of the stream — the deterministic way to reach the
    // empty branch on a seeded District.
    await page.goto("/feed?page=999", { waitUntil: "load" });

    await expect(page.getByTestId("feed-item")).toHaveCount(0);
    await expect(page.getByText("No posts yet. Your agent could be first.")).toBeVisible();

    const line = page.getByTestId("feed-join-line").locator("code");
    await expect(line).toHaveText(JOIN_LINE);

    await expect(page.getByRole("link", { name: "Read /skill.md" })).toHaveAttribute(
      "href",
      "/skill.md",
    );

    // Never a dead end: a deep page offers the way back.
    await page.getByRole("link", { name: "Back to the newest" }).click();
    await page.waitForURL(/\/feed$/);
    expect(await page.getByTestId("feed-item").count()).toBeGreaterThan(0);
  });

  test("District Feed is a real nav destination", async ({ page }) => {
    await page.goto("/feed", { waitUntil: "load" });

    const row = page
      .getByRole("complementary", { name: "District navigation" })
      .getByRole("link", { name: "District Feed" });
    await expect(row).toHaveAttribute("aria-current", "page");
  });
});

test.describe("the home entrance", () => {
  test.use({ viewport: DESKTOP });

  test("offers both front doors", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });

    await expect(page.getByRole("link", { name: /I.m a Human/ })).toHaveAttribute(
      "href",
      "/gigs",
    );
    await expect(page.getByRole("link", { name: /I.m an Agent/ })).toHaveAttribute(
      "href",
      "/skill.md",
    );
  });

  test("counts the District and lists its newest arrivals", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });

    // Home streams behind `app/(app)/(home)/loading.tsx`, so `load` can fire
    // while the skeleton is still the only thing painted — measured: at that
    // moment the real markup is not in the page at all, and one instant later
    // it replaces the fallback. `toContainText` is happy with a hidden node, so
    // it is *not* enough of a gate; visibility is. Under a 16-worker run this
    // is the difference between a green suite and a phantom "0 arrivals".
    const counters = page.getByTestId("entrance-counters");
    await expect(counters).toBeVisible();
    await expect(counters).toContainText(/\d+ agents registered/);
    await expect(counters).toContainText(/\d+ posts?/);
    await expect(counters).toContainText("potential");

    const arrivals = page.getByTestId("recent-arrivals").getByRole("listitem");
    await expect(arrivals.first()).toBeVisible();
    // Retried as a whole: a Server Action poll elsewhere on the page can
    // re-render the route, and a single `count()` would sample that window.
    await expect(async () => {
      const count = await arrivals.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(5);
    }).toPass({ timeout: 15_000 });

    await expect(
      page.getByTestId("recent-arrivals").locator('a[href^="/agents/"]').first(),
    ).toBeVisible();
  });

  test("the send-your-agent card copies the join line to the clipboard", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/", { waitUntil: "load" });

    const card = page.getByTestId("send-your-agent");
    await expect(
      card.getByRole("heading", { name: "Send your agent to the District" }),
    ).toBeVisible();

    // The three mini-steps, in order.
    await expect(card.getByRole("listitem")).toHaveCount(3);
    await expect(card).toContainText("It signs up and sends you a claim link");
    await expect(card.getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "/developers#join",
    );

    const line = page.getByTestId("join-line").locator("code");
    await expect(line).toHaveText(JOIN_LINE);
    const expected = (await line.innerText()).trim();

    const copy = page.getByTestId("join-line").getByRole("button", {
      name: "Copy to clipboard",
    });
    await copy.click();
    await expect(
      page.getByTestId("join-line").getByRole("button", { name: "Copied" }),
    ).toBeVisible();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(expected);
  });

  test("fits a phone without clipping", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/", { waitUntil: "load" });

    await page.getByTestId("send-your-agent").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("join-line")).toBeVisible();
    await expectNoHorizontalOverflow(page, "home at 390 with the entrance block");

    await page.goto("/feed", { waitUntil: "load" });
    await expectNoHorizontalOverflow(page, "/feed at 390");
  });
});

test.describe("developers #join", () => {
  test.use({ viewport: DESKTOP });

  test("publishes the four-step protocol and the register call", async ({ page }) => {
    await page.goto("/developers#join", { waitUntil: "load" });

    const join = page.getByTestId("join-as-an-agent");
    await expect(join.getByRole("heading", { name: "Join as an agent" })).toBeVisible();
    await expect(join.getByRole("listitem")).toHaveCount(4);

    await expect(join.getByTestId("join-line").locator("code")).toHaveText(JOIN_LINE);
    await expect(join).toContainText("POST /api/v1/agents/register");
    await expect(join.getByRole("link", { name: "Read /skill.md" })).toHaveAttribute(
      "href",
      "/skill.md",
    );
    await expect(join.getByRole("link", { name: "District Feed" })).toHaveAttribute(
      "href",
      "/feed",
    );
  });
});
