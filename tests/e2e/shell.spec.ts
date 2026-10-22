import { expect, test, type Page } from "@playwright/test";
import { MOBILE_NAV, NAV_ITEMS, withAdminRows } from "../../lib/nav";

/**
 * Demo mode signs every visitor in as `@austin`, who is seeded `is_admin`
 * (lib/seed/profiles.ts), so the shell under test always carries the operators'
 * Analytics row. That is deliberate: a row that never renders in the suite is a
 * row nothing checks. `withAdminRows` is the same pure transform the shell
 * applies, so this stays right if the row ever moves.
 */
const NAV_ROWS = withAdminRows(NAV_ITEMS, { isAdmin: true });

/**
 * Shell contract (BUILD_SPEC §3 + docs/reference/desktop-home.png).
 *
 * These assertions guard the chrome itself — nav completeness, the @World
 * surfaces, active state and the "no horizontal scroll, ever" rule. The page
 * bodies are tested elsewhere; nothing here depends on them.
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

    // 18 items: the 17 reference rows plus District Feed. Analytics is not one
    // of them — it is appended for operators only (see NAV_ROWS above), which
    // is why the sidebar shows 19 here and 18 for everybody else.
    expect(NAV_ITEMS).toHaveLength(18);
    expect(NAV_ROWS).toHaveLength(19);
    const links = sidebar.getByRole("navigation", { name: "Primary" }).getByRole("link");
    await expect(links).toHaveCount(NAV_ROWS.length);

    for (const item of NAV_ROWS) {
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
    // The account chip is a menu button now, not a link to /profile.
    await expect(header.getByRole("button", { name: /Austin/ })).toContainText(
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

  test("the account chip opens a keyboard-navigable menu", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: /Austin/ });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("menu")).toHaveCount(0);

    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    // Profile, Settings, Sign out — and focus starts on the first of them.
    await expect(menu.getByRole("menuitem", { name: "Profile" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Profile" })).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Settings" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeFocused();

    // Escape closes and hands focus back to the trigger.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("signing out in demo mode says why it cannot", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /Austin/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    // Demo mode has no session to end; the action answers with the reason and
    // the menu renders it rather than swallowing it. Scoped to the menu: Next's
    // own route announcer is an empty `role="alert"` on every page.
    await expect(page.getByRole("menu").getByRole("alert")).toContainText(
      "Demo mode signs every visitor in",
    );
  });

  test("Settings opens from the account menu", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /Austin/ }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Settings");
    // Not a sidebar destination: lib/nav.ts is untouched by /settings.
    await expect(
      page
        .getByRole("complementary", { name: "District navigation" })
        .locator('nav a[href="/settings"]'),
    ).toHaveCount(0);
  });

  test("the operators' Analytics row is in the sidebar for an admin", async ({ page }) => {
    await page.goto("/");

    const row = page
      .getByRole("complementary", { name: "District navigation" })
      .locator('nav a[href="/analytics"]');
    await expect(row).toHaveCount(1);
    await row.click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText("District Analytics");
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

    // The account row: the top bar's menu is hidden below `lg`, so Settings and
    // Sign out have to live here too.
    await expect(dialog.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    await expect(dialog.getByRole("button", { name: "Sign out" })).toBeVisible();

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
