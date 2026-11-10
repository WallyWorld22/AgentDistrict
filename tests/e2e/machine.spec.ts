import { expect, test } from "@playwright/test";

/**
 * The machine surface and the site are **one District**.
 *
 * Everything here once failed, all for the same reason: the demo
 * store was a module-level singleton, and Next emits `lib/data` into both the
 * page bundle and the Route-Handler bundle — so an order placed through the API
 * existed only in the API's copy of the store, and the `watch:` URL every MCP
 * client is handed 404'd.
 *
 * Money constraint (same as `gigs.spec.ts`): the suite is `fullyParallel` and
 * `smoke.spec.ts` pins the `$12.43` credits pill, so every order placed here is
 * on a **free** package — a $0.00 hold moves nothing.
 */

/** A gig whose basic package is free, so ordering it cannot move the wallet. */
const FREE_GIG = "pdf-summary-with-page-refs";
/** The one seeded gig its seller has paused. */
const PAUSED_GIG = "ticket-triage-and-macro-pack";
/** Published on /developers; read-only on purpose. */
const READ_ONLY_KEY = "ad_live_demo_2f8c41a7b09e4d63";

test.describe("one store behind the site and the API", () => {
  test("an order placed through the REST API opens as a page", async ({ page }) => {
    const created = await page.request.post("/api/v1/orders", {
      data: {
        gig_slug: FREE_GIG,
        tier: "basic",
        brief: "E2E: the API and the UI must be looking at the same District.",
      },
    });
    expect(created.status()).toBe(201);
    const { order } = await created.json();
    expect(order.id).toBeTruthy();
    expect(order.amount_cents).toBe(0);

    // The API can read it back…
    const read = await page.request.get(`/api/v1/orders/${order.id}`);
    expect(read.status()).toBe(200);

    // …and so can the page bundle, which is the half that used to 404.
    await page.goto(`/orders/${order.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("QuickPDF");
    await expect(page.getByText("E2E: the API and the UI")).toBeVisible();
  });

  test("the MCP hire_agent tool hands back a link that resolves", async ({ page }) => {
    const response = await page.request.post("/api/mcp/mcp", {
      headers: { accept: "application/json, text/event-stream" },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "hire_agent",
          arguments: {
            gig_slug: FREE_GIG,
            tier: "basic",
            brief: "E2E: an MCP client must get a live watch URL.",
          },
        },
      },
    });
    expect(response.status()).toBe(200);

    // Streamable HTTP answers as SSE; the payload is the `data:` line.
    const body = await response.text();
    const line = body.split("\n").find((row) => row.startsWith("data:"));
    expect(line).toBeTruthy();
    const payload = JSON.parse(line!.slice(5));
    const result = JSON.parse(payload.result.content[0].text);
    expect(result.order_id).toBeTruthy();

    const watch = new URL(result.watch);
    await page.goto(watch.pathname);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("QuickPDF");
  });
});

test.describe("a paused gig is not for sale", () => {
  test("the page is read-only and the API refuses the order", async ({ page }) => {
    await page.goto(`/gigs/${PAUSED_GIG}`);
    await expect(page.getByText("PAUSED", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Not taking orders" })).toBeVisible();
    // No commit control at all — the repository would refuse it anyway.
    await expect(page.getByTestId("gig-continue")).toHaveCount(0);

    const refused = await page.request.post("/api/v1/orders", {
      data: { gig_slug: PAUSED_GIG, tier: "basic", brief: "E2E: ordering a paused listing." },
    });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error.code).toBe("conflict");
  });
});

test.describe("the API's own rules", () => {
  test("a cookie-authenticated write is refused cross-site", async ({ page }) => {
    // Route Handlers get none of the origin checking Server Actions do, so a
    // cross-origin form post with the session cookie attached would otherwise
    // place a real order.
    await page.goto("/");
    const refused = await page.request.post("/api/v1/orders", {
      headers: { "sec-fetch-site": "cross-site" },
      data: { gig_slug: FREE_GIG, tier: "basic", brief: "E2E: cross-site probe." },
    });
    expect(refused.status()).toBe(403);

    // An API key is unaffected: a browser cannot attach one cross-site.
    const keyed = await page.request.post("/api/v1/orders", {
      headers: { "sec-fetch-site": "cross-site", authorization: `Bearer ${READ_ONLY_KEY}` },
      data: { gig_slug: FREE_GIG, tier: "basic", brief: "E2E: cross-site probe." },
    });
    // …though this particular key is read-only, which is a 403 for a different
    // and much better reason.
    expect((await keyed.json()).error.message).toContain("orders:write");
  });

  test("domain failures keep their status across the bundle boundary", async ({ page }) => {
    // The shared store lives on `globalThis`, so an error thrown in one bundle
    // is caught in another where `instanceof` says nothing. A 409 that degrades
    // to a 500 is how that shows up.
    const refused = await page.request.post("/api/v1/orders", {
      data: { gig_slug: PAUSED_GIG, tier: "basic", brief: "E2E: status mapping probe." },
    });
    expect(refused.status()).toBe(409);
  });
});

test.describe("bad addresses end in a 404 or a redirect, never a crash", () => {
  test("an unknown /api/v1 address answers JSON, not the HTML 404 page", async ({ page }) => {
    for (const path of [
      "/api/v1",
      "/api/v1/nope",
      "/api/v1/agents/scout/extra",
      "/api/v1/feed/123",
    ]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(404);
      expect(response.headers()["content-type"], path).toContain("application/json");
      expect((await response.json()).error.code, path).toBe("not_found");
    }
    const posted = await page.request.post("/api/v1/nope", { data: {} });
    expect(posted.status()).toBe(404);
    expect((await posted.json()).error.code).toBe("not_found");

    // Real routes still win over the catch-all.
    expect((await page.request.get("/api/v1/stats")).status()).toBe(200);
  });

  test("a path ending in a backslash redirects to the clean address", async ({ page }) => {
    for (const [path, clean] of [
      ["/%5C", "/"],
      ["/tv%5C", "/tv"],
      ["/gigs%5C?sort=new", "/gigs?sort=new"],
      ["/jobs/new%5C", "/jobs/new"],
    ]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(308);
      const location = new URL(response.headers().location, "http://placeholder");
      expect(location.pathname + location.search, path).toBe(clean);
    }
  });

  test("a mangled job, order or thread id is a 404 page", async ({ page }) => {
    for (const path of [
      "/jobs/not-a-uuid",
      "/orders/not-a-uuid",
      "/inbox/not-a-uuid",
      "/api/v1/jobs/not-a-uuid",
      "/api/v1/jobs/not-a-uuid/bids",
    ]) {
      expect((await page.request.get(path)).status(), path).toBe(404);
    }
  });
});
