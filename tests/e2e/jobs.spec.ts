import { expect, test, type Page } from "@playwright/test";
import { jobId } from "../../lib/seed";

/**
 * End-to-end flows for the reverse market, @World and the Command Center.
 *
 * ## What this file may and may not do to the shared demo store
 *
 * Every spec in the suite talks to the same `next start`, and `smoke.spec.ts`
 * pins facts that some mutations would move:
 *
 * - **No job is posted here.** `getNetworkStats()` counts jobs, and the home
 *   hero's "18 Bounties Posted" is that count *verbatim* — posting one bounty
 *   would make the pinned counter read 19 for the rest of the run. The full
 *   post → auto-bids → award → run loop is therefore verified against a private
 *   preview build instead, and this file covers everything around it.
 *   (`smoke.spec.ts` now asserts the hero equals `/api/v1/stats` as well as the
 *   seeded literal; dropping the literal would let a bounty be posted here.)
 * - **Bids are free**, so placing one is safe: nothing pins a bid count.
 * - **Money must end where it started.** The `$12.43` credits pill is pinned in
 *   two other specs, so the one test that spends (the @World assembly) disputes
 *   every run it created, which refunds the hold exactly, and then checks the
 *   wallet is back.
 */

const REROOF_JOB = jobId("500-reroof-opportunities-orlando");
const AWARDED_JOB = jobId("landing-page-stuart-hvac");
/** The demo human's own open bounty — the one that exposes the Award buttons. */
const OWN_OPEN_JOB = jobId("verify-treasure-coast-contractor-licences");
const ROOFING_OUTCOME = "Find 200 roofing companies in Tampa under $10";
/** Routes to a guild of three cheap agents — see the cleanup note above. */
const ASSEMBLY_OUTCOME = "Convert 40 scanned PDFs to text and clean the CSV";

/**
 * Wait until React has attached to `selector`.
 *
 * Before hydration the DOM is server HTML: buttons render but their handlers do
 * not exist yet, so a click silently does nothing.
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

test.describe("the bounty board", () => {
  test("filters by status, sorts, and paginates with shareable URLs", async ({ page }) => {
    await page.goto("/jobs");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Jobs & Bounties");
    const cards = page.getByRole("article");
    // The board streams in behind a Suspense skeleton, so wait for the first
    // card before counting — `count()` does not retry.
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(3);
    expect(await cards.count()).toBeLessThanOrEqual(9);

    // The published formula is what makes the ranking auditable.
    await expect(page.getByRole("heading", { name: "Procurement ranking" })).toBeVisible();
    await expect(page.getByText(/0\.35 × quality/)).toBeVisible();

    // Status chips are links, so the filtered board has its own URL.
    await page.getByRole("tab", { name: /^Open/ }).click();
    await page.waitForURL(/status=open/);
    await expect(page.getByRole("tab", { name: /^Open/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // `toHaveCount` retries; a bare `count()` could read the pre-navigation
    // DOM and pass for the wrong reason.
    await expect(
      page.getByRole("article").getByText("In progress", { exact: true }),
    ).toHaveCount(0);

    // Sorting by budget puts the biggest bounty first.
    await page.goto("/jobs?sort=budget");
    const first = page.getByRole("article").first();
    await expect(first).toContainText("$60");

    // Page two exists and is reachable by link.
    await page.goto("/jobs");
    await expect(page.getByText(/1–9 of \d+ bounties/)).toBeVisible();
    await page.getByRole("link", { name: "Page 2" }).click();
    await page.waitForURL(/page=2/);
    await expect(page.getByText(/10–\d+ of \d+ bounties/)).toBeVisible();
  });

  test("each card shows its top bids inline with a way to reach the agent", async ({
    page,
  }) => {
    await page.goto("/jobs?status=open");

    // Somebody else's bounty: the control beside a bid opens that agent's
    // Passport (it is not yours to award), and it says so.
    const card = page.getByRole("article").filter({ hasText: "500 Reroof Opportunities" });
    await expect(card).toBeVisible();
    await expect(card.getByText(/\d+ bids?/)).toBeVisible();

    const passports = card.getByRole("link", { name: /^Open .+'s Passport$/ });
    expect(await passports.count()).toBeGreaterThan(0);
    await expect(passports.first()).toHaveAttribute("href", /^\/agents\//);
    await expect(passports.first()).toHaveText("Passport");
  });

  test("your own open bounty offers the award, not a Passport link", async ({ page }) => {
    // The seeded District has to make the award-a-bid loop reachable: without
    // an *open* bounty posted by the demo human, the headline capability of
    // /jobs/[id] could only be reached by first posting one.
    await page.goto(`/jobs/${OWN_OPEN_JOB}`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Verify 300 Treasure Coast contractor licences",
    );

    const awards = page.getByRole("button", { name: /^Award \$/ });
    expect(await awards.count()).toBeGreaterThanOrEqual(3);
    await expect(awards.first()).toHaveText("Award");
    // Nothing on your own bounty pretends to be a hire link.
    await expect(page.getByRole("link", { name: /Passport$/ })).toHaveCount(0);
  });

  test("search narrows the board and keeps the query in the URL", async ({ page }) => {
    await page.goto("/jobs?q=roofing");

    // Shareable: the query round-trips into the field, so a copied URL rebuilds
    // the same view.
    await expect(page.locator('input[name="q"]')).toHaveValue("roofing");

    // Narrower than the unfiltered board, and every match is a real one — a
    // bounty matches on its brief as well as its title, so the assertion is on
    // the result set, not on the first card's visible text.
    //
    // The board streams in behind the segment's Suspense skeleton and `count()`
    // does not retry, so wait for the first card first — the search field is
    // readable a beat earlier (it is matched by CSS, not by role, so it counts
    // even while the streamed subtree is still hidden) and counting there
    // reads zero cards off a board that is about to render two.
    const cards = page.getByRole("article");
    await expect(cards.first()).toBeVisible();
    const matching = await cards.count();
    expect(matching).toBeGreaterThan(0);
    expect(await cards.filter({ hasText: /roof/i }).count()).toBeGreaterThan(0);

    await page.goto("/jobs");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(matching);
  });
});

test.describe("a bounty", () => {
  test("publishes the brief, the output contract and the data policy", async ({ page }) => {
    await page.goto(`/jobs/${REROOF_JOB}`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "500 Reroof Opportunities",
    );
    await expect(page.getByRole("heading", { name: "The brief" })).toBeVisible();
    await expect(page.getByText("Budget", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Required output" })).toBeVisible();
    await expect(page.getByText("roof_age_est", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Data policy" })).toBeVisible();
    await expect(page.getByText(/PII: redacted/)).toBeVisible();

    // The machine surface for the same bid.
    await expect(page.getByRole("heading", { name: "Bid on this from code" })).toBeVisible();
    await expect(page.getByText("/api/v1/jobs/").first()).toBeVisible();
  });

  test("sorts the bids three ways and shows why each one scores", async ({ page }) => {
    await page.goto(`/jobs/${REROOF_JOB}`);
    await expect(page.getByRole("heading", { name: /^Bids \(/ })).toBeVisible();
    await hydrated(page, '[role="tablist"]');

    const prices = async () =>
      (await page.getByTestId("bid-amount").allInnerTexts()).map((value) =>
        Number(value.replace(/[^\d.]/g, "")),
      );

    await page.getByRole("tab", { name: "Lowest" }).click();
    const cheapestFirst = await prices();
    expect(cheapestFirst.length).toBeGreaterThan(1);
    expect([...cheapestFirst].sort((a, b) => a - b)).toEqual(cheapestFirst);

    await page.getByRole("tab", { name: "Best fit" }).click();
    await expect(page.getByText(/\d+ fit/).first()).toBeVisible();
    await expect(page.getByText(/under your \$15\.00 budget/).first()).toBeVisible();

    // Score bars are real progress elements, not decoration.
    const bar = page.getByRole("progressbar", { name: /fit score$/ }).first();
    await expect(bar).toBeVisible();
    expect(Number(await bar.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  });

  test("an awarded bounty shows the winning bid", async ({ page }) => {
    await page.goto(`/jobs/${AWARDED_JOB}`);
    await expect(page.getByRole("heading", { name: "Awarded" })).toBeVisible();
    await expect(page.getByText("ACCEPTED").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Place a bid" })).toBeHidden();
  });

  test("a bad id is a 404, not an empty shell", async ({ page }) => {
    const response = await page.goto("/jobs/00000000-0000-0000-0000-000000000000");
    expect(response?.status()).toBe(404);
  });

  test("places a bid as one of your own agents", async ({ page }) => {
    await page.goto(`/jobs/${REROOF_JOB}`);
    await hydrated(page, "#bid-agent");

    const heading = page.getByRole("heading", { name: /^Bids \(/ });
    const before = Number((await heading.textContent())?.match(/\((\d+)\)/)?.[1] ?? 0);

    await page.locator("#bid-agent").selectOption("scout");
    await page.locator("#bid-amount").fill("9.40");
    await page
      .locator("#bid-note")
      .fill(
        "Scout pulls the parcel roster, verifies every owner against the county record and hands back the CSV.",
      );
    await page.getByRole("button", { name: "Place bid" }).click();

    await expect(heading).toHaveText(new RegExp(`Bids \\(${before + 1}\\)`), {
      timeout: 20_000,
    });
    await expect(page.getByText("Scout").first()).toBeVisible();
  });
});

test.describe("posting a bounty", () => {
  test("prefills from @World and previews who gets notified", async ({ page }) => {
    await page.goto(`/jobs/new?q=${encodeURIComponent(ROOFING_OUTCOME)}&budget=1000`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Post a job");
    await expect(page.locator("#job-title")).toHaveValue(ROOFING_OUTCOME);
    await expect(page.locator("#job-budget")).toHaveValue("10.00");
    await expect(page.getByRole("heading", { name: "Who gets notified" })).toBeVisible();
    await expect(page.getByText(/compatible agents online/)).toBeVisible();

    // The required-output fields are chips, and they can be edited.
    await hydrated(page, "#job-field-input");
    await expect(page.getByRole("button", { name: "Remove business_name" })).toBeVisible();
    await page.locator("#job-field-input").fill("roof_age");
    await page.locator("#job-field-input").press("Enter");
    await expect(page.getByRole("button", { name: "Remove roof_age" })).toBeVisible();
    await page.getByRole("button", { name: "Remove roof_age" }).click();
    await expect(page.getByRole("button", { name: "Remove roof_age" })).toBeHidden();

    // Data-policy toggles are real switches.
    const subcontract = page.getByRole("switch", { name: "Allow subcontracting" });
    await expect(subcontract).toHaveAttribute("aria-checked", "true");
    await subcontract.click();
    await expect(subcontract).toHaveAttribute("aria-checked", "false");
  });
});

test.describe("@World", () => {
  test("routes an outcome to ranked agents and a guild", async ({ page }) => {
    await page.goto(`/world?outcome=${encodeURIComponent(ROOFING_OUTCOME)}`);

    await expect(page.getByRole("heading", { name: "Ranked agents" })).toBeVisible();

    // The intent it read out of the sentence, as chips.
    await expect(page.getByText("Tampa, FL").first()).toBeVisible();
    await expect(page.getByText("200", { exact: true }).first()).toBeVisible();

    // At least three ranked agents, including one that actually does this work.
    const ranked = page.locator('a[href^="/agents/"]');
    await expect(ranked.first()).toBeVisible();
    expect(await ranked.count()).toBeGreaterThanOrEqual(3);
    const shortlist = page.locator('a[href="/agents/scout"], a[href="/agents/roofintel"]');
    expect(await shortlist.count()).toBeGreaterThan(0);

    // Scores are shown, and the formula behind them is one click away.
    await expect(page.getByText(/\d+ score/).first()).toBeVisible();
    await page.getByText("How this shortlist was scored").first().click();
    await expect(page.getByText(/0\.35 × quality/).first()).toBeVisible();

    // The guild, priced end to end.
    await expect(page.getByRole("heading", { name: "Proposed guild" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Assemble & run/ })).toBeVisible();

    // And the way out of the concierge: post it as a bounty instead.
    const post = page.getByRole("link", { name: "Post it as a bounty instead" });
    await expect(post).toHaveAttribute("href", /\/jobs\/new\?q=/);
    await post.click();
    await expect(page.locator("#job-title")).toHaveValue(ROOFING_OUTCOME);
  });

  test("says so plainly when nothing fits", async ({ page }) => {
    await page.goto("/world?outcome=zzzz%20qqqq%20wwww%20vvvv");
    // Either a graceful empty state or a real shortlist — never a broken page.
    // `count()` does not retry, so summing two of them raced the streamed
    // Suspense boundary and failed on a slower machine; `expect(...).or()`
    // auto-waits for whichever arrives.
    await expect(
      page
        .getByText("Nothing in the District fits that yet")
        .or(page.getByRole("heading", { name: "Ranked agents" }))
        .first(),
    ).toBeVisible();
  });
});

test.describe("the Command Center", () => {
  // The spend pause is real server state on the wallet row, not a per-browser
  // cookie — that is the point of it, and it means the test that pauses and
  // the test that spends cannot run at the same time in different workers.
  test.describe.configure({ mode: "serial" });

  test("reports runs, spend, approvals and network health", async ({ page }) => {
    await page.goto("/command");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Command Center");
    for (const label of ["Active runs", "Spend today", "Approvals pending", "Network health"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Spend by agent" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Approvals queue" })).toBeVisible();

    // Live progress on a seeded run.
    const run = page.getByTestId("command-run").first();
    await expect(run).toBeVisible();
    await expect(run.getByRole("progressbar")).toBeVisible();
  });

  test("pausing external spending raises the banner and stops @World", async ({ page }) => {
    await page.goto("/command");
    await hydrated(page, '[role="switch"]');

    const toggle = page.getByRole("switch", { name: /Pause all external agent spending/ });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("spend-paused-banner")).toBeHidden();

    await toggle.click();
    await expect(page.getByTestId("spend-paused-banner")).toBeVisible({ timeout: 20_000 });
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    // The pause is enforced, not decorative: @World refuses to start runs.
    await page.goto(`/world?outcome=${encodeURIComponent(ASSEMBLY_OUTCOME)}`);
    await hydrated(page, "form");
    await page.getByRole("button", { name: /Assemble & run/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: /paused/ })).toBeVisible({
      timeout: 20_000,
    });

    // …and so does an API key, which is the half the copy names explicitly and
    // the half a per-browser cookie could never have stopped.
    const refused = await page.request.post("/api/v1/orders", {
      headers: { authorization: "Bearer ad_live_bldr_9d41c07eb35a86f2" },
      data: {
        gig_slug: "pdf-summary-with-page-refs",
        tier: "basic",
        brief: "E2E: a machine caller while spending is paused.",
      },
    });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error.message).toMatch(/paused/i);

    // And it lifts again.
    await page.goto("/command");
    await hydrated(page, '[role="switch"]');
    await page.getByRole("switch", { name: /Pause all external agent spending/ }).click();
    await expect(page.getByTestId("spend-paused-banner")).toBeHidden({ timeout: 20_000 });

    // The ceiling was never clamped, so resuming cannot strand it at a cent.
    await expect(page.getByText("$20.00").first()).toBeVisible();
  });

  test("@World assembles a guild into real runs on the Command Center", async ({ page }) => {
    await page.goto(`/world?outcome=${encodeURIComponent(ASSEMBLY_OUTCOME)}`);
    await hydrated(page, "form");
    await expect(page.getByRole("heading", { name: "Proposed guild" })).toBeVisible();

    await page.getByRole("button", { name: /Assemble & run/ }).click();
    await page.waitForURL(/\/command\?runs=/, { timeout: 30_000 });

    const banner = page.getByText(/@World started \d+ runs?/);
    await expect(banner).toBeVisible();

    const started = page.getByTestId("assembled-banner").locator('a[href^="/orders/"]');
    expect(await started.count()).toBeGreaterThan(0);

    // Clean up: dispute every run that actually holds money, which refunds the
    // hold in full and leaves the pinned $12.43 credits pill where it was.
    const links = await started.evaluateAll((nodes) =>
      nodes.map((node) => ({
        href: (node as HTMLAnchorElement).getAttribute("href") ?? "",
        text: node.textContent ?? "",
      })),
    );
    for (const link of links) {
      if (/\$0\.00/.test(link.text)) continue;
      await page.goto(link.href);
      await hydrated(page, "main");
      const open = page.getByRole("button", { name: "Dispute", exact: true });
      if ((await open.count()) === 0) continue;
      await open.click();
      await page.locator("#dispute-reason").fill(
        "E2E cleanup — releasing the hold placed by the assembly test.",
      );
      await page.getByRole("button", { name: "Dispute this run" }).click();
      await expect(page.getByText(/DISPUTED/i).first()).toBeVisible({ timeout: 20_000 });
    }

    await page.goto("/wallet");
    await expect(page.getByText("$12.43").first()).toBeVisible({ timeout: 20_000 });
  });
});
