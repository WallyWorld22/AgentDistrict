import { expect, test, type Page } from "@playwright/test";
import { MOBILE_NAV, NAV_ITEMS } from "../../lib/nav";

/**
 * Shell contract (BUILD_SPEC §3 + docs/reference/desktop-home.png).
 *
 * These assertions guard the chrome itself — nav completeness, the @World
 * surfaces, active state and the "no horizontal scroll, ever" rule. Feature
 * executors own the page bodies; nothing here depends on them.
 */

const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 390, height: 844 } as const;

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${label} overflows horizontally (${overflow.scrollWidth} > ${overflow.clientWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

test.describe("desktop shell (1440x900)", () => {
  test.use({ viewport: DESKTOP });

  test("sidebar lists every nav item exactly once", async ({ page }) => {
    await page.goto("/");

    const sidebar = page.getByRole("complementary", { name: "District navigation" });
    await expect(sidebar).toBeVisible();

    // 18 items: the 17 reference rows plus District Feed.
    expect(NAV_ITEMS).toHaveLength(18);
    const links = sidebar.getByRole("navigation", { name: "Primary" }).getByRole("link");
    await expect(links).toHaveCount(NAV_ITEMS.length);

    for (const item of NAV_ITEMS) {
      // Badged rows ("The Lounge LIVE", "Inbox 3") make the accessible name
      // longer than the label, so match on href and assert the visible text.
      const link = sidebar.locator(`nav a[href="${item.href}"]`);
      await expect(link, `sidebar is missing ${item.href}`).toHaveCount(1);
      await expect(link, `sidebar row for ${item.href}`).toContainText(item.label);
      await expect(link).toBeVisible();
    }
  });

  test("The Lounge carries the LIVE pill and Inbox the unread count", async ({
    page,
  }) => {
    await page.goto("/");
    const sidebar = page.getByRole("complementary", { name: "District navigation" });

    await expect(
      sidebar.getByRole("link", { name: /The Lounge/ }),
    ).toContainText("LIVE");
    await expect(sidebar.getByRole("link", { name: /Inbox/ })).toContainText("3");
  });

  test("brand, top bar controls and @World card are present", async ({ page }) => {
    await page.goto("/");

    const sidebar = page.getByRole("complementary", { name: "District navigation" });
    await expect(
      sidebar.getByRole("link", { name: "AgentDistrict — home" }),
    ).toBeVisible();
    await expect(sidebar).toContainText("The place for agents.");

    const header = page.getByRole("banner");
    await expect(header.getByLabel("Search the District")).toBeVisible();
    await expect(header.getByLabel("Wallet — $12.43 in credits")).toContainText(
      "$12.43",
    );
    await expect(header.getByLabel("Add credits")).toBeVisible();
    await expect(header.getByLabel("Notifications — 3 unread")).toContainText("3");
    await expect(header.getByRole("link", { name: /Austin/ })).toContainText(
      "Builder Mode",
    );

    await expect(sidebar).toContainText("@World");
    await expect(
      sidebar.getByRole("link", { name: "Start a conversation" }),
    ).toHaveAttribute("href", "/world");
  });

  test("the fixed @World bar sits at the bottom with its quick chips", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1536, height: 900 });
    await page.goto("/");

    const input = page.getByLabel("Tell @World what you need");
    await expect(input).toBeVisible();
    await expect(page.getByRole("button", { name: "Send to @World" })).toBeVisible();

    for (const chip of ["Find the best agents", "Assemble a team", "Get it done"]) {
      await expect(page.getByRole("button", { name: chip })).toBeVisible();
    }

    // Pinned to the bottom of the viewport, spanning past the sidebar.
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThan(900 - 120);
  });

  test("the mobile bottom nav is not shown on desktop", async ({ page }) => {
    await page.goto("/");
    // The "More" tab only exists in the mobile bottom nav.
    await expect(page.getByRole("button", { name: "More" })).toBeHidden();
  });

  test("active nav state follows the route", async ({ page }) => {
    const sidebar = () =>
      page.getByRole("complementary", { name: "District navigation" });

    await page.goto("/gigs");
    await expect(
      sidebar().getByRole("link", { name: "Gigs", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      sidebar().getByRole("link", { name: "Home", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");

    // matchPrefix keeps the parent highlighted on sub-routes.
    await page.goto("/gigs/new");
    await expect(
      sidebar().getByRole("link", { name: "Gigs", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    await page.goto("/");
    await expect(
      sidebar().getByRole("link", { name: "Home", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("skip link focuses the main landmark", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(page.locator("main#main")).toHaveCount(1);
  });

  test("no horizontal overflow on the shell routes", async ({ page }) => {
    for (const route of ["/", "/gigs", "/jobs", "/agents", "/developers"]) {
      await page.goto(route);
      await expectNoHorizontalOverflow(page, `${route} @1440`);
    }
  });
});

test.describe("mobile shell (390x844)", () => {
  test.use({ viewport: MOBILE });

  test("bottom nav shows six tabs and hides the sidebar", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary (mobile)" });
    await expect(nav).toBeVisible();

    for (const item of MOBILE_NAV) {
      await expect(
        nav.getByRole("link", { name: item.short, exact: true }),
      ).toBeVisible();
    }
    await expect(nav.getByRole("button", { name: "More" })).toBeVisible();
    // 5 links + the More button = 6 tabs.
    await expect(nav.getByRole("link")).toHaveCount(MOBILE_NAV.length);
    expect(MOBILE_NAV.length + 1).toBe(6);

    await expect(
      page.getByRole("complementary", { name: "District navigation" }),
    ).toBeHidden();
  });

  test("the @World floating button opens a dialog that traps and closes", async ({
    page,
  }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Ask @World" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toContainText("Your AI concierge for the entire District.");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the More sheet lists the rest of the District", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Primary (mobile)" })
      .getByRole("button", { name: "More" })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Wallet" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Docs" })).toBeVisible();

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });

  test("no horizontal overflow on the shell routes", async ({ page }) => {
    for (const route of ["/", "/gigs", "/jobs", "/agents", "/developers"]) {
      await page.goto(route);
      await expectNoHorizontalOverflow(page, `${route} @390`);
    }
  });
});
