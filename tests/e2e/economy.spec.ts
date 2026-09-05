import { expect, test, type Locator, type Page } from "@playwright/test";
import { seedId } from "../../lib/seed";

/**
 * End-to-end flows for the economy surfaces — Guilds, Market, Inbox, Wallet,
 * the Workplace Gateway, API & MCP and Docs.
 *
 * ## Two constraints that shape everything here
 *
 * 1. **The demo store is process-wide and the suite is `fullyParallel`.** Every
 *    spec talks to the same `next start`, and `smoke.spec.ts` pins the `$12.43`
 *    credits pill (`balance − held`). So the guild hire is funded by topping up
 *    **exactly** its quote first: balance and held both rise by the quote and
 *    `balance − held` lands back on the pinned number, whatever happens to those
 *    runs afterwards. Nothing else in this file spends.
 * 2. **The inbox reply uses a thread that is already read.** `sendMessage`
 *    zeroes `unread_count` for the sender's thread, and `smoke.spec.ts` pins
 *    "Notifications — 3 unread"; replying on an unread thread would drop it.
 *
 * `next start` hydrates lazily (the shell prefetches every sidebar route), so
 * `hydrated()` waits for React to attach before any click.
 */

/** Four members, the cheapest quote of the six seeded guilds. */
const GUILD = "content-factory";
const GUILD_MEMBER_HOLDS = ["PixelPress", "VoiceVine"];
const GUILD_BRIEF =
  "E2E: one month of short-form content for a Treasure Coast roofer, scripted, designed and voiced.";

/** Seeded thread with `unread: 0` — see constraint 2 above. */
const READ_THREAD = seedId("thread", "austin-copycat-offer");

async function hydrated(page: Page, selector: string) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && Object.keys(el).some((key) => key.startsWith("__reactFiber$"));
    },
    selector,
    { timeout: 30_000 },
  );
}

/** "$13.10" → 1310. Money is integer cents everywhere, tests included. */
function cents(text: string | null): number {
  const match = /\$([\d,]+)\.(\d{2})/.exec(text ?? "");
  if (!match) throw new Error(`no money in ${JSON.stringify(text)}`);
  return Number(match[1].replace(/,/g, "")) * 100 + Number(match[2]);
}

/** The `<dd>` of a `<DataRow>` with this exact label. */
function dataRow(page: Page, label: string): Locator {
  return page
    .locator("dl > div")
    .filter({ has: page.locator(`dt:text-is("${label}")`) })
    .locator("dd");
}

/** Available credits, read from the top bar's own accessible name. */
async function creditsPill(page: Page): Promise<number> {
  const label = await page
    .getByRole("banner")
    .getByLabel(/Wallet — .* in credits/)
    .getAttribute("aria-label");
  return cents(label);
}

/* -------------------------------------------------------------- guild hire */

test.describe("guild hire", () => {
  // Serial: the second test spends exactly what the first one added.
  test.describe.configure({ mode: "serial" });

  let quoteCents = 0;

  test("wallet top-up raises the balance and the credits pill", async ({ page }) => {
    // 1. Read the quote off the guild page — the button carries the real total.
    await page.goto(`/guilds/${GUILD}`);
    await hydrated(page, "form");
    const hire = page.getByRole("button", { name: /^Hire Team — / });
    quoteCents = cents(await hire.textContent());
    expect(quoteCents).toBeGreaterThan(0);

    // 2. Top the wallet up by exactly that, so the hire nets to zero.
    await page.goto("/wallet");
    await hydrated(page, "button");
    const balanceBefore = cents(await dataRow(page, "Balance").textContent());
    const pillBefore = await creditsPill(page);

    await page.getByRole("button", { name: "Add credits" }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.getByLabel("Amount (USD)").fill((quoteCents / 100).toFixed(2));
    await sheet.getByRole("button", { name: "Add credits" }).click();

    await expect(page.getByText(/Credits added/i).first()).toBeVisible();

    // 3. Both the ledger and the shell's pill move by the same amount.
    await page.goto("/wallet");
    expect(cents(await dataRow(page, "Balance").textContent())).toBe(
      balanceBefore + quoteCents,
    );
    expect(await creditsPill(page)).toBe(pillBefore + quoteCents);
    await expect(page.getByRole("cell", { name: /Added credits/ }).first()).toBeVisible();
  });

  test("hiring a guild starts one run per member and holds exactly the quote", async ({
    page,
  }) => {
    await page.goto("/wallet");
    const availableBefore = await creditsPill(page);

    await page.goto(`/guilds/${GUILD}`);
    await hydrated(page, "textarea");

    // The pipeline and its price are both on the page before anything is spent.
    await expect(page.getByRole("heading", { name: "The pipeline" })).toBeVisible();
    const hire = page.getByRole("button", { name: /^Hire Team — / });
    expect(cents(await hire.textContent())).toBe(quoteCents);

    await page.getByLabel(/^Brief for /).fill(GUILD_BRIEF);
    await hire.click();

    // One order per member, then straight to the Command Center.
    await expect(page).toHaveURL(/\/command/, { timeout: 30_000 });
    await expect(page.getByText(/runs started/i).first()).toBeVisible();

    // The runs are real: each member's hold is in the ledger…
    await page.goto("/wallet");
    for (const member of GUILD_MEMBER_HOLDS) {
      await expect(
        page.getByRole("cell", { name: new RegExp(`Hold — ${member}`) }).first(),
      ).toBeVisible();
    }

    // …and the hold is exactly the quote, so the pinned pill is where it was.
    expect(await creditsPill(page)).toBe(availableBefore - quoteCents);
  });
});

/* ------------------------------------------------------------------ market */

test.describe("district market", () => {
  test("kind chips and search are link-driven", async ({ page }) => {
    await page.goto("/market");
    await expect(page.getByRole("heading", { level: 1, name: "District Market" })).toBeVisible();

    const all = await page.locator('a[href^="/market/"]').count();
    expect(all).toBeGreaterThan(8);

    const chips = page.getByRole("navigation", { name: "Filters" });
    await chips.getByRole("link", { name: /^Dataset/ }).click();
    await expect(page).toHaveURL(/kind=dataset/);
    await expect(
      page.getByRole("navigation", { name: "Filters" }).getByRole("link", {
        name: /^Dataset/,
      }),
    ).toHaveAttribute("aria-current", "page");
    const filtered = await page.locator('a[href^="/market/"]').count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(all);

    // Search is a plain GET, so the filtered view has its own URL.
    await page.goto("/market?q=parcel");
    await expect(page.getByRole("link", { name: /Florida Parcel Toolkit/ })).toBeVisible();
  });

  test("an item can be added to the toolkit and stays added", async ({ page }) => {
    await page.goto("/market/florida-parcel-toolkit");
    await hydrated(page, "button");

    await expect(page.getByRole("heading", { name: "What's included" })).toBeVisible();
    const add = page.getByRole("button", { name: "Add to my toolkit" });
    await add.click();

    const added = page.getByRole("button", { name: "In your toolkit" });
    await expect(added).toBeVisible();
    await expect(page.getByText(/added to your toolkit/i).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "In your toolkit" })).toBeVisible();

    // Leave the browser profile as we found it.
    await page.getByRole("button", { name: "In your toolkit" }).click();
    await expect(page.getByRole("button", { name: "Add to my toolkit" })).toBeVisible();
  });
});

/* ------------------------------------------------------------------- inbox */

test.describe("inbox", () => {
  test("a sent message appears in the thread", async ({ page }) => {
    await page.goto(`/inbox/${READ_THREAD}`);
    await hydrated(page, "textarea");

    const body = `E2E ${Date.now()}: one more revision on the Q4 set, same format.`;
    await page.getByLabel("Write a message").fill(body);
    await page.getByRole("button", { name: "Send", exact: true }).click();

    // The rail's preview line carries the same text, so scope to the bubble.
    await expect(page.getByRole("paragraph").filter({ hasText: body })).toBeVisible({
      timeout: 20_000,
    });

    // The rail is the second pane of the same page on desktop.
    await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
  });

  test("the index lists conversations and offers a new one", async ({ page }) => {
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
    expect(await page.locator('a[href^="/inbox/"]').count()).toBeGreaterThan(3);

    await hydrated(page, "button");
    await page.getByRole("button", { name: "New message" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByLabel("To")).toBeVisible();
    await expect(sheet.getByLabel("Message")).toBeVisible();
  });
});

/* --------------------------------------------------------------- workplace */

test.describe("workplace gateway", () => {
  test("a policy toggle persists across a reload", async ({ page }) => {
    await page.goto("/workplace");
    await hydrated(page, '[role="switch"]');

    const toggle = page.getByRole("switch", { name: "Unverified agents" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await expect(
      page.getByRole("switch", { name: "Unverified agents" }),
    ).toHaveAttribute("aria-checked", "true");

    // Restore the default so a later run starts from the seeded posture.
    await page.getByRole("switch", { name: "Unverified agents" }).click();
    await expect(
      page.getByRole("switch", { name: "Unverified agents" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  test("the enforced spend limits come from the wallet", async ({ page }) => {
    await page.goto("/workplace");
    await expect(page.getByRole("heading", { level: 1, name: "Workplace Gateway" })).toBeVisible();
    await expect(page.getByText("Enforced").first()).toBeVisible();
    await expect(dataRow(page, "Approval threshold").first()).toContainText("$5.00");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByRole("cell", { name: /run\./ }).first()).toBeVisible();
  });
});

/* ---------------------------------------------------------------- machines */

test.describe("api & mcp", () => {
  test("the event widget receives events over EventSource", async ({ page }) => {
    await page.goto("/developers");
    await hydrated(page, "button");

    await expect(page.getByRole("heading", { name: "Endpoint reference" })).toBeVisible();
    await expect(page.getByText("ad_live_demo_2f8c41a7b09e4d63").first()).toBeVisible();

    await page.getByRole("button", { name: /Open the stream/ }).click();
    await expect(page.getByText(/\d+ events received/)).toBeVisible({ timeout: 30_000 });
  });

  test("the MCP snippet uses the host the reader is on", async ({ page }) => {
    await page.goto("/developers");
    await hydrated(page, "button");

    const host = new URL(page.url()).host;
    await expect(page.getByText(`http://${host}/api/mcp/mcp`).first()).toBeVisible();

    await page.getByRole("tab", { name: "Claude Code" }).click();
    await expect(page.getByText(/claude mcp add --transport http/)).toBeVisible();
  });
});

/* -------------------------------------------------------------------- docs */

test.describe("docs", () => {
  test("a doc renders with a table of contents and prev/next", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { level: 1, name: "Docs" })).toBeVisible();

    await page.getByRole("link", { name: "Architecture" }).first().click();
    await expect(page).toHaveURL(/\/docs\/architecture/);
    await expect(page.getByRole("heading", { level: 1, name: "Architecture" })).toBeVisible();

    // The TOC marks the page you are on, and the next link moves you along.
    await expect(
      page.getByRole("navigation", { name: "Documentation" }).getByRole("link", {
        name: "Architecture",
      }),
    ).toHaveAttribute("aria-current", "page");

    await page.locator('a[rel="next"]').click();
    await expect(page).toHaveURL(/\/docs\/cost-model/);
    await expect(page.getByRole("heading", { level: 1, name: "Cost model" })).toBeVisible();
  });
});

/* ------------------------------------------------------------------ stores */

test.describe("creator stores", () => {
  test("a storefront lists its agents, gigs and follow state", async ({ page }) => {
    await page.goto("/stores");
    await expect(page.getByRole("heading", { level: 1, name: "Creator Stores" })).toBeVisible();

    await page.getByRole("link", { name: /WallyWorks Labs/ }).first().click();
    await expect(page).toHaveURL(/\/stores\/wallyworks-labs/);
    await expect(page.getByRole("heading", { level: 1, name: "WallyWorks Labs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gigs" })).toBeVisible();
    expect(await page.locator('a[href^="/agents/"]').count()).toBeGreaterThan(0);

    await hydrated(page, "button");
    const follow = page.getByRole("button", { name: "Follow" });
    await follow.click();
    await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
    await page.getByRole("button", { name: "Following" }).click();
    await expect(page.getByRole("button", { name: "Follow" })).toBeVisible();
  });
});
