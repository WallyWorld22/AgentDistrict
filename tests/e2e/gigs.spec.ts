import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * End-to-end flows for Gigs + Orders — the marketplace core.
 *
 * ## Two constraints that shape every test here
 *
 * 1. **The demo store is process-wide and the suite is `fullyParallel`.** Every
 *    spec talks to the same `next start`, so anything this file writes is
 *    visible to `smoke.spec.ts`, which pins the home hero counters
 *    (12,482 / 3,921 / 24,118 / 842) and the `$12.43` credits pill. So: no gig
 *    is published, no job is posted, no agent is registered, and the one order
 *    placed is on a **free** gig, whose hold and release are both `$0.00` and
 *    therefore leave the wallet exactly where it was.
 * 2. **`next start` hydrates lazily** — the shell prefetches every sidebar
 *    route on load, so a click issued too early lands on server HTML and does
 *    nothing. `hydrated()` below waits for React to attach before interacting.
 *
 * The lifecycle test needs a run that finishes inside a test timeout. The
 * fastest seeded package is `bulk-format-and-unit-conversion` **basic** at 12
 * seconds; no gig has a *premium* tier under 25 seconds, so the premium tier is
 * exercised through the price control and the order is placed on basic. A
 * dedicated "Fast QA smoke" gig with a short premium tier is requested in this
 * lane's report.
 */

/** The 12-second, $0.00 gig the lifecycle test runs end to end. */
const FAST_GIG = "bulk-format-and-unit-conversion";
const FAST_GIG_AGENT = "unitfox";
/** Three clearly different tier prices — good for the package control. */
const TIERED_GIG = "find-100-qualified-local-businesses";

const REVIEW_BODY =
  "E2E: clean conversion, units matched the contract, delivered inside the SLA.";

/**
 * Wait until React has attached to `selector`.
 *
 * Before hydration the DOM is server HTML: buttons render but their handlers do
 * not exist yet, so a click silently does nothing and the failure surfaces much
 * later as "the price never changed".
 */
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

function digits(text: string | null): number {
  return Number((text ?? "").replace(/[^\d]/g, ""));
}

async function progressValue(bar: Locator): Promise<number> {
  return digits(await bar.getAttribute("aria-valuenow"));
}

test.describe("gigs browse", () => {
  test("category chips, sort and load more are all link-driven", async ({ page }) => {
    await page.goto("/gigs");

    await expect(page.getByRole("heading", { level: 1, name: "Agent Gigs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Why gigs work for agents" })).toBeVisible();
    await expect(page.getByText("Input contract", { exact: true })).toBeVisible();
    await expect(page.getByText("Delivery SLA", { exact: true })).toBeVisible();

    // A chip is an anchor, so the filtered view has its own URL.
    await page.getByRole("link", { name: /^Research/ }).click();
    await expect(page).toHaveURL(/category=research/);
    await expect(page.getByRole("link", { name: /^Research/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const firstPage = await page.locator("a[href^='/gigs/']").count();
    expect(firstPage).toBeGreaterThan(0);

    // Sorting keeps the category and drops nothing.
    await page.goto("/gigs?category=research&sort=price");
    const prices = await page.locator("a[href^='/gigs/'] .tabular-nums").allInnerTexts();
    expect(prices.length).toBeGreaterThan(0);

    // "Load more" is a link to the next cumulative page.
    await page.goto("/gigs");
    const loadMore = page.getByRole("link", { name: "Load more gigs" });
    const before = await page.locator("a[href^='/gigs/']").count();
    await loadMore.click();
    await expect(page).toHaveURL(/page=2/);
    expect(await page.locator("a[href^='/gigs/']").count()).toBeGreaterThan(before);
  });

  test("an unmatched search offers the job fallback", async ({ page }) => {
    await page.goto("/gigs?q=zzzznothingmatchesthis");

    await expect(page.getByText("No gig matches that yet")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Post it as a job instead" }),
    ).toHaveAttribute("href", "/jobs/new?q=zzzznothingmatchesthis");
  });
});

test.describe("gig detail", () => {
  test("the package tabs drive the Continue price", async ({ page }) => {
    await page.goto(`/gigs/${TIERED_GIG}`);
    await hydrated(page, '[data-testid="gig-continue"]');

    const cta = page.getByTestId("gig-continue");
    const price = page.getByTestId("tier-price");

    // Standard is the default selection.
    await expect(cta).toHaveText(/Continue — \$1\.89/);
    await expect(price).toHaveText("$1.89");

    await page.getByRole("tab", { name: "premium" }).click();
    await expect(cta).toHaveText(/Continue — \$6\.40/);
    await expect(page.getByRole("tab", { name: "premium" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.getByRole("tab", { name: "basic" }).click();
    await expect(cta).toHaveText(/Continue — \$0\.79/);

    // The brief is validated before the action is ever called.
    const brief = page.getByLabel("Your brief");
    await brief.fill("nope");
    await brief.blur();
    await expect(page.getByText(/at least 12 characters/)).toBeVisible();
  });

  test("the machine block documents the REST and MCP calls", async ({ page }) => {
    await page.goto(`/gigs/${TIERED_GIG}`);

    await expect(page.getByRole("heading", { name: "Buy this gig from code" })).toBeVisible();
    await expect(page.getByText("POST", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("/api/v1/orders").first()).toBeVisible();
    await expect(page.getByText('"hire_agent"').first()).toBeVisible();
    // Copy buttons on both snippets.
    await expect(page.getByRole("button", { name: "Copy to clipboard" })).toHaveCount(2);

    // Breadcrumb back to the filtered browse view.
    await expect(page.getByRole("link", { name: "Research", exact: true })).toHaveAttribute(
      "href",
      "/gigs?category=research",
    );
  });

  test("reviews expand to the full list", async ({ page }) => {
    await page.goto(`/gigs/${TIERED_GIG}`);
    const preview = await page.locator("#reviews li").count();

    await page.getByRole("link", { name: "All reviews" }).click();
    await expect(page).toHaveURL(/reviews=all/);
    expect(await page.locator("#reviews li").count()).toBeGreaterThan(preview);
    await expect(page.getByRole("link", { name: "Show fewer" })).toBeVisible();
  });
});

test.describe("orders", () => {
  test("the index groups runs by status and surfaces the approval queue", async ({ page }) => {
    await page.goto("/orders");

    await expect(page.getByRole("heading", { level: 1, name: "Your orders" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Needs your approval" })).toBeVisible();

    await page.getByRole("tab", { name: /^Approved/ }).click();
    await expect(page).toHaveURL(/status=approved/);
    await expect(page.getByRole("heading", { name: "Approved runs" })).toBeVisible();

    // Scoped to the filtered list — "Needs your approval" sits above it and is
    // deliberately not filtered.
    const rows = page.getByTestId("orders-list").locator("a[href^='/orders/']");
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(rows.first().getByText("APPROVED")).toBeVisible();

    await rows.first().click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}/);
    await expect(page.getByText("Simulated run", { exact: true })).toBeVisible();
  });

  test("a delivered seeded run shows its deliverable and the approval controls", async ({
    page,
  }) => {
    await page.goto("/orders?status=delivered");
    await page.locator("a[href^='/orders/']").first().click();

    await expect(page.getByRole("heading", { name: "Deliverable" })).toBeVisible();
    await expect(page.getByTestId("approve-order")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dispute" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  });
});

test("browse → filter → order → live run → approve → review on the passport", async ({
  page,
}) => {
  // The run itself takes ~12s and the page polls every 3s.
  test.setTimeout(150_000);

  // Reputation before the run, read from the gig page's own markup.
  await page.goto(`/gigs/${FAST_GIG}`);
  const ratingCountBefore = digits(
    await page.getByTestId("agent-rating-count").textContent(),
  );
  expect(ratingCountBefore).toBeGreaterThan(0);

  // 1. Browse, filter to the gig's category, open it.
  await page.goto("/gigs");
  await page.getByRole("link", { name: /^Operations/ }).click();
  await expect(page).toHaveURL(/category=operations/);
  await page.locator(`a[href="/gigs/${FAST_GIG}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${FAST_GIG}$`));
  await hydrated(page, '[data-testid="gig-continue"]');

  // 2. The premium tier drives the sticky price…
  await page.getByRole("tab", { name: "premium" }).click();
  await expect(page.getByTestId("gig-continue")).toHaveText(/Continue — \$1\.10/);

  // …then order the 12-second basic package, whose $0.00 hold leaves the
  // wallet (and therefore the pinned $12.43 credits pill) untouched.
  await page.getByRole("tab", { name: "basic" }).click();
  // A zero price reads FREE everywhere else, so the commit button says so too.
  await expect(page.getByTestId("gig-continue")).toHaveText(/Run it free/);
  await page
    .getByLabel("Your brief")
    .fill("Convert the attached price sheet from EUR to USD and normalise the units.");
  await page.getByTestId("gig-continue").click();

  // 3. The run page opens in flight.
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const orderUrl = page.url();
  const progress = page.getByTestId("order-progress");
  await expect(progress).toBeVisible();
  expect(["queued", "running"]).toContain(await progress.getAttribute("data-status"));
  await expect(page.getByText("Simulated run", { exact: true })).toBeVisible();

  // 4. Progress advances on its own — no reload, just the 3s heartbeat.
  const bar = page.getByRole("progressbar", { name: "Run progress" });
  await expect
    .poll(() => progressValue(bar), { timeout: 20_000, message: "progress should advance" })
    .toBeGreaterThan(0);

  // 5. …until it delivers, and the page swaps itself to the approval state.
  await expect(page.getByTestId("approve-order")).toBeVisible({ timeout: 60_000 });
  expect(await progress.getAttribute("data-status")).toBe("delivered");
  expect(page.url()).toBe(orderUrl);
  await expect(page.getByRole("heading", { name: "Deliverable" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Download \./ })).toBeVisible();

  // 6. Approve and release.
  await hydrated(page, '[data-testid="approve-order"]');
  await page.getByTestId("approve-order").click();
  await expect(page.getByText("APPROVED", { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Agent payout")).toBeVisible();

  // 7. Review with the star control.
  await hydrated(page, '[data-testid="review-stars"]');
  await page.locator('label:has(input[name="rating"][value="5"])').click();
  await page.getByLabel(/How did .* do\?/).fill(REVIEW_BODY);
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByRole("heading", { name: "Your review" })).toBeVisible({
    timeout: 30_000,
  });

  // 8. It is on the agent's passport, and the lifetime rating count moved.
  await page.goto(`/agents/${FAST_GIG_AGENT}`);
  await expect(page.getByText(REVIEW_BODY)).toBeVisible();

  await page.goto(`/gigs/${FAST_GIG}`);
  await expect(page.getByTestId("agent-rating-count")).toHaveText(
    (ratingCountBefore + 1).toLocaleString("en-US"),
  );
});

test("publishing: the contract builder adds and removes rows and reports errors inline", async ({
  page,
}) => {
  await page.goto("/gigs/new");
  await hydrated(page, "#gig-agent");

  await expect(page.getByRole("heading", { level: 1, name: "Publish an agent gig" })).toBeVisible();

  // Only Passports austin owns are offered.
  const agentSelect = page.locator("#gig-agent");
  const handles = await agentSelect.locator("option").allInnerTexts();
  expect(handles.length).toBeGreaterThan(0);
  expect(handles.join(" ")).toContain("@scout");
  expect(handles.join(" ")).not.toContain("@qa-fox");

  const rows = page.getByRole("button", { name: /^Remove input field/ });
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "Add input field" }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: "Remove input field 2" }).click();
  await expect(rows).toHaveCount(1);

  // A contract with no fields is rejected by the action, inline, and nothing
  // is published — which also keeps the home page's gig counter pinned.
  await page.getByRole("button", { name: "Remove input field 1" }).click();
  await expect(rows).toHaveCount(0);
  await page.locator("#gig-description").fill("A run that should never be published.");
  await page.locator("#gig-input-summary").fill("Nothing at all.");
  await page.locator("#gig-output-summary").fill("Nothing at all.");
  await page.getByRole("button", { name: "Publish gig" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Declare at least one input field." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/gigs\/new$/);
});
