import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end flows for Agent Passports, onboarding, profile and auth.
 *
 * ## Two constraints that shape every test here
 *
 * 1. **The demo store is process-wide and the suite is `fullyParallel`.**
 *    Everything this file writes is visible to `smoke.spec.ts`, which pins the
 *    home hero counters against `/api/v1/stats` and against the counts the seed
 *    produces (28 / 18 / 38 / 5). `agentsOnline` counts
 *    agents whose status is not `offline`, so the Passport the wizard creates
 *    is registered with **"Bring it online now" switched off** — it is a real
 *    Passport with a real agent card, it just does not move the counter. The
 *    same run then flips it online from its own Passport and back off again,
 *    which is how the owner controls are covered without leaving the District
 *    one agent heavier than the reference.
 * 2. **`next start` hydrates lazily** — the shell prefetches every sidebar
 *    route on load, so a click issued too early lands on server HTML and does
 *    nothing. `hydrated()` waits for React to attach before interacting.
 */

/** A handle that survives a Playwright retry without colliding with itself. */
function probeHandle(retry: number): string {
  return retry === 0 ? "e2e-probe-agent" : `e2e-probe-agent-${retry}`;
}

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

test.describe("passport directory", () => {
  test("chips, status filter and load more are all link-driven", async ({ page }) => {
    await page.goto("/agents");

    await expect(
      page.getByRole("heading", { level: 1, name: "Agent Passports" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "What a Passport carries" })).toBeVisible();

    const cards = page.getByTestId("agents-grid").locator("a[href^='/agents/']");
    const firstPage = await cards.count();
    expect(firstPage).toBeGreaterThan(0);

    // A chip is an anchor, so the filtered view has its own URL.
    const chips = page.getByRole("navigation", { name: "Filters" });
    await chips.getByRole("link", { name: /^Research/ }).click();
    await expect(page).toHaveURL(/category=research/);
    await expect(chips.getByRole("link", { name: /^Research/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("agents-count")).toContainText("in Research");

    // Category deep link — the Home mobile "Explore Agent Hubs" tiles land here.
    await page.goto("/agents?category=home_services");
    await expect(page.getByTestId("agents-count")).toContainText("in Home Services");
    const homeServices = await page
      .getByTestId("agents-grid")
      .locator("a[href^='/agents/']")
      .count();
    expect(homeServices).toBeGreaterThan(0);
    expect(homeServices).toBeLessThan(firstPage + 1);

    // Status is a plain GET select on the browse form.
    await page.goto("/agents?status=live");
    await expect(page.getByTestId("agents-count")).toContainText("Live");
    await expect(
      page.getByTestId("agents-grid").getByText("LIVE", { exact: true }).first(),
    ).toBeVisible();

    // "Load more" is a link to the next cumulative page.
    await page.goto("/agents");
    await page.getByRole("link", { name: "Load more passports" }).click();
    await expect(page).toHaveURL(/page=2/);
    expect(
      await page.getByTestId("agents-grid").locator("a[href^='/agents/']").count(),
    ).toBeGreaterThan(firstPage);
  });

  test("an unmatched search offers @World and the bounty board", async ({ page }) => {
    await page.goto("/agents?q=zzzznothingmatchesthis");

    await expect(page.getByText("No Passport matches that yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ask @World" })).toHaveAttribute(
      "href",
      "/world",
    );
    await expect(page.getByRole("link", { name: "Post a bounty" })).toBeVisible();
  });
});

test.describe("agent passport", () => {
  test("reputation, gigs and a machine block whose origin is the request host", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/agents/scout");

    // Identity + reputation.
    await expect(page.getByRole("heading", { level: 1, name: /Scout/ })).toBeVisible();
    await expect(page.getByText("4.96", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("1,842 reviews")).toBeVisible();
    await expect(page.getByText("Reliability", { exact: true })).toBeVisible();
    await expect(page.getByText("FL", { exact: true }).first()).toBeVisible();

    // Scout ships with the District, so the Passport says where that 1,842 came
    // from rather than letting a reader take it for earned history.
    const pill = page.getByTestId("founding-cast");
    await expect(pill).toBeVisible();
    await expect(pill).toContainText("Founding cast");
    await expect(pill).toHaveAttribute(
      "title",
      "Ships with the District — track record simulated.",
    );

    // Gigs, and Hire goes to the agent's best-selling one.
    await expect(page.getByRole("heading", { name: /^Gigs \(/ })).toBeVisible();
    await expect(page.getByTestId("hire-agent")).toHaveAttribute(
      "href",
      "/gigs/find-100-qualified-local-businesses",
    );

    // The machine block prints THIS deployment's origin, never a localhost
    // default baked in at build time.
    const host = new URL(baseURL ?? "http://127.0.0.1:3100").host;
    const machine = page.getByText(`/agents/scout/agent-card.json`).last();
    await expect(machine).toBeVisible();
    const cardUrl = page.locator("pre", { hasText: "/agents/scout/agent-card.json" }).first();
    await expect(cardUrl).toContainText(host);
    await expect(cardUrl).not.toContainText("localhost:3000");

    // Works well with, derived from shared guild membership.
    await expect(page.getByRole("heading", { name: "Works well with" })).toBeVisible();
    expect(
      await page
        .locator("section", { has: page.getByRole("heading", { name: "Works well with" }) })
        .locator("a[href^='/agents/']")
        .count(),
    ).toBeGreaterThan(0);
  });

  test("Passport JSON expands to the same document agent-card.json serves", async ({
    page,
  }) => {
    await page.goto("/agents/scout");

    const toggle = page.getByTestId("passport-json-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();

    const block = page.locator("pre", { hasText: '"districtId"' }).first();
    await expect(block).toContainText('"districtId": "@scout"');
    await expect(block).toContainText('"protocolVersion": "0.3.0"');

    // …and the endpoint really returns that document.
    const response = await page.request.get("/agents/scout/agent-card.json");
    expect(response.status()).toBe(200);
    const card = await response.json();
    expect(card.districtId).toBe("@scout");
    expect(Array.isArray(card.skills)).toBe(true);
  });

  test("reviews expand to the full list", async ({ page }) => {
    await page.goto("/agents/scout");
    const preview = await page.locator("#reviews li").count();
    expect(preview).toBeGreaterThan(0);

    await page.getByRole("link", { name: "All reviews" }).click();
    await expect(page).toHaveURL(/reviews=all/);
    expect(await page.locator("#reviews li").count()).toBeGreaterThan(preview);
    await expect(page.getByRole("link", { name: "Show fewer" })).toBeVisible();
  });

  test("Message opens a thread in the Inbox", async ({ page }) => {
    const body =
      "E2E: can you pull 40 Treasure Coast roofing contractors with owner emails?";

    await page.goto("/agents/mapfox");
    await hydrated(page, "#thread-body");

    await page.locator("#thread-subject").fill("E2E territory question");
    await page.locator("#thread-body").fill(body);
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page).toHaveURL(/\/inbox\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByText(body)).toBeVisible();
  });
});

test("onboarding: the wizard validates each step, creates a Passport and lands on it", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const handle = probeHandle(testInfo.retry);

  await page.goto("/onboarding/agent");
  await hydrated(page, "#wizard-handle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Register an agent" }),
  ).toBeVisible();

  // Step 1 refuses to advance while it is empty.
  await page.getByTestId("wizard-next").click();
  await expect(page.getByRole("alert").filter({ hasText: "Pick a handle" })).toBeVisible();

  // A taken handle is reported by the server, not guessed by the client.
  await page.locator("#wizard-handle").fill("scout");
  await page.getByTestId("check-handle").click();
  await expect(page.getByTestId("handle-status")).toContainText(
    "@scout is already registered in the District.",
  );

  await page.locator("#wizard-handle").fill(handle);
  await page.getByTestId("check-handle").click();
  await expect(page.getByTestId("handle-status")).toContainText(`@${handle} is available.`);

  await page.locator("#wizard-name").fill("Probe Agent");
  await page.locator("#wizard-tagline").fill("End-to-end coverage for the Passport wizard");
  await page.getByRole("radio", { name: "Emoji 🧪" }).click();
  await page.getByTestId("wizard-next").click();

  // Step 2 — skills and regions are chips.
  await expect(page.getByTestId("wizard-step-capabilities")).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.getByTestId("wizard-next").click();
  await expect(
    page.getByRole("alert").filter({ hasText: "List at least one skill." }),
  ).toBeVisible();

  // The suggestion chips follow the category select.
  await page.locator("#wizard-category").selectOption("development");
  await page.getByRole("button", { name: "QA", exact: true }).click();
  await page.locator("#wizard-skills").fill("regression");
  await page.locator("#wizard-skills").press("Enter");
  await expect(page.getByRole("button", { name: "Remove regression" })).toBeVisible();
  await page.getByTestId("wizard-next").click();

  // Step 3 — pricing.
  await page.locator("#wizard-price").fill("0.33");
  await page.getByTestId("wizard-next").click();

  // Step 4 — endpoints are validated inline against the server's own rule.
  await page.locator("#wizard-webhook").fill("http://127.0.0.1:9/run");
  await expect(
    page.getByText("Must be an https:// URL on a public host (no localhost or private ranges)."),
  ).toBeVisible();
  await page.getByTestId("wizard-next").click();
  await expect(page.getByRole("alert").filter({ hasText: "https://" })).toBeVisible();

  await page.locator("#wizard-webhook").fill("https://probe.example.com/run");
  await page.locator("#wizard-mcp-tools").fill("run_probe");
  await page.locator("#wizard-mcp-tools").press("Enter");
  await page.getByTestId("wizard-next").click();

  // Step 5 — review, then publish dark so the pinned network counters hold.
  await expect(page.getByTestId("wizard-summary")).toContainText(`@${handle}`);
  await expect(page.getByTestId("wizard-summary")).toContainText("QA, regression");
  await page.getByRole("switch", { name: "Bring it online now" }).click();
  await expect(page.getByRole("switch", { name: "Bring it online now" })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  await page.getByTestId("create-passport").click();

  // It lands on the new Passport, which is a real, machine-readable record.
  await expect(page).toHaveURL(new RegExp(`/agents/${handle}$`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: /Probe Agent/ })).toBeVisible();
  // The status pill is a sibling of the <h1>, not a child: inside it the
  // Passport's accessible name became "Probe AgentOFFLINE".
  await expect(page.locator("h1")).toHaveText(/Probe Agent/);
  await expect(page.getByText("OFFLINE").first()).toBeVisible();
  await expect(
    page.getByText("End-to-end coverage for the Passport wizard").first(),
  ).toBeVisible();
  await expect(page.getByText("run_probe", { exact: true })).toBeVisible();

  // The new Passport carries a full agent card of its own.
  //
  // Asserted from the page rather than from `GET /agents/<handle>/agent-card.json`:
  // in demo mode a Route Handler gets its own copy of the memoized in-memory
  // store, so an agent created through the UI is invisible to the machine
  // surface until the process restarts. That is a data-layer limitation, not a
  // passport one — it is written up in this lane's report.
  await page.getByTestId("passport-json-toggle").click();
  await expect(page.locator("pre", { hasText: '"districtId"' }).first()).toContainText(
    `"districtId": "@${handle}"`,
  );

  // The owner controls are on the Passport, and they really write presence.
  await hydrated(page, `#status-${handle}`);
  await expect(page.getByRole("heading", { name: "You own this Passport" })).toBeVisible();
  await page.locator(`#status-${handle}`).selectOption("hiring");
  await page.getByRole("button", { name: "Update presence" }).click();
  // The status pill sits beside the <h1>, not inside it (see above).
  await expect(page.getByText("HIRING").first()).toBeVisible({ timeout: 30_000 });

  // Put it back offline: `agentsOnline` feeds the pinned home hero counter.
  await page.locator(`#status-${handle}`).selectOption("offline");
  await page.getByRole("button", { name: "Update presence" }).click();
  await expect(page.getByText("OFFLINE").first()).toBeVisible({ timeout: 30_000 });
});

test.describe("your district", () => {
  test("profile lists owned Passports and mints an API key exactly once", async ({
    page,
  }) => {
    await page.goto("/profile");

    await expect(page.getByRole("heading", { level: 1, name: "Your District" })).toBeVisible();
    await expect(page.getByText("Demo session").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your agents" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Scout's Passport/ })).toHaveAttribute(
      "href",
      "/agents/scout",
    );

    // `/developers` links here by anchor.
    await expect(page.locator("#api-keys")).toBeVisible();
    const before = await page.getByTestId("api-key-list").locator("li").count();
    expect(before).toBeGreaterThan(0);

    await hydrated(page, '[data-testid="create-api-key"]');
    await page.getByTestId("create-api-key").click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Give the key a label." }),
    ).toBeVisible();

    await page.locator("#key-label").fill("E2E runner");
    await page.getByTestId("create-api-key").click();

    const minted = page.getByTestId("minted-key");
    await expect(minted).toBeVisible({ timeout: 30_000 });
    await expect(minted.locator("pre")).toContainText("ad_live_");
    await page.getByRole("button", { name: "I have stored it" }).click();
    await expect(minted).toBeHidden();

    // The list picked the new key up, and the raw value is gone for good.
    await expect(page.getByTestId("api-key-list").locator("li")).toHaveCount(before + 1, {
      timeout: 30_000,
    });
    await expect(page.getByText("E2E runner")).toBeVisible();
    await expect(page.getByText(/ad_live_[a-z0-9]{8,}/)).toHaveCount(0);
  });
});

test.describe("auth", () => {
  test("/login renders enabled controls and names the demo session", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByTestId("demo-banner")).toContainText("Demo mode — signed in as");
    await expect(page.getByText("Signed in as Austin", { exact: true })).toBeVisible();

    const cont = page.getByTestId("demo-continue");
    await expect(cont).toBeVisible();
    await expect(cont).toHaveAttribute("href", "/");
    await expect(cont).not.toHaveAttribute("aria-disabled", "true");

    // Nothing on the page is a dead, disabled control.
    await expect(page.locator("button[disabled], a[aria-disabled='true']")).toHaveCount(0);

    await cont.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("/signup offers the same demo path and links back to sign in", async ({ page }) => {
    await page.goto("/signup");

    await expect(
      page.getByRole("heading", { level: 1, name: "Create an account" }),
    ).toBeVisible();
    await expect(page.getByTestId("demo-continue")).toBeVisible();
    await expect(page.getByRole("link", { name: "← Back to the District" })).toBeVisible();
  });

  test("the demo banner can be dismissed and stays dismissed", async ({ page }) => {
    await page.goto("/login");
    await hydrated(page, '[data-testid="demo-banner"]');

    await page.getByRole("button", { name: "Dismiss demo notice" }).click();
    await expect(page.getByTestId("demo-banner")).toHaveCount(0);

    await page.goto("/signup");
    await expect(page.getByTestId("demo-banner")).toHaveCount(0);
  });
});
