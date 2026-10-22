import { expect, test } from "@playwright/test";

/**
 * The discovery layer, served rather than imported.
 *
 * `tests/unit/seo.test.ts` checks what `app/robots.ts`, `app/sitemap.ts` and
 * the schema builders *produce*; this file checks that Next actually serves it
 * — the metadata-file conventions are the kind of thing that compiles fine and
 * 404s in production.
 *
 * Nothing here pins the origin. The suite runs on `127.0.0.1:3100` with no
 * `NEXT_PUBLIC_SITE_URL`, so `siteUrl()` answers `http://localhost:3000`;
 * asserting the *shape* of the URLs is the part that has to hold everywhere.
 */

const KNOWN_AGENT = "scout";
const KNOWN_GIG = "find-100-qualified-local-businesses";

test.describe("robots.txt", () => {
  test("serves 200, welcomes the LLM crawlers and points at the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");

    const body = await response.text();
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /api/");
    expect(body).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);

    for (const crawler of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
      expect(body, `robots.txt should name ${crawler}`).toContain(`User-Agent: ${crawler}`);
    }

    // The machine surface must never be closed: it is the whole point.
    for (const open of ["/skill.md", "/llms.txt", "/llms-full.txt", "/agents"]) {
      expect(body).not.toContain(`Disallow: ${open}`);
    }
  });
});

test.describe("sitemap.xml", () => {
  test("serves 200 XML carrying the machine docs and real detail pages", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");

    const body = await response.text();
    expect(body).toContain("<urlset");
    expect(body).toMatch(/<loc>https?:\/\/[^<]+\/skill\.md<\/loc>/);
    expect(body).toMatch(/<loc>https?:\/\/[^<]+\/llms-full\.txt<\/loc>/);
    expect(body).toMatch(new RegExp(`<loc>https?://[^<]+/agents/${KNOWN_AGENT}</loc>`));
    expect(body).toMatch(new RegExp(`<loc>https?://[^<]+/gigs/${KNOWN_GIG}</loc>`));
    expect(body).toMatch(/<loc>https?:\/\/[^<]+\/docs\/product-spec<\/loc>/);

    // Every entry is absolute, and no login-gated route is advertised.
    const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locations.length).toBeGreaterThan(80);
    for (const location of locations) expect(location).toMatch(/^https?:\/\//);
    for (const gated of ["/wallet", "/settings", "/inbox", "/analytics"]) {
      expect(locations.some((location) => location.endsWith(gated))).toBe(false);
    }
  });
});

test.describe("structured data", () => {
  test("a passport carries one ld+json block that parses as a ProfilePage", async ({
    page,
    request,
  }) => {
    await page.goto(`/agents/${KNOWN_AGENT}`);

    const blocks = page.locator('script[type="application/ld+json"]');
    await expect(blocks).toHaveCount(1);

    const parsed = JSON.parse((await blocks.first().textContent()) ?? "");
    const nodes: Array<{ "@type": string }> = Array.isArray(parsed) ? parsed : [parsed];
    const types = nodes.map((node) => node["@type"]);

    expect(types).toContain("ProfilePage");
    expect(types).toContain("BreadcrumbList");

    const profile = nodes.find((node) => node["@type"] === "ProfilePage") as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;
    expect(profile["@context"]).toBe("https://schema.org");
    expect(profile.url).toContain(`/agents/${KNOWN_AGENT}`);
    expect(profile.mainEntity["@type"]).toBe("Service");

    /*
     * @scout is founding cast: its rating is seeded, and the Passport shows it
     * beside a "track record simulated" pill that structured data cannot
     * carry. The API is read to prove the rating exists, so its absence from
     * the markup is the rule at work rather than an unrated row.
     */
    const { agent } = await (await request.get(`/api/v1/agents/${KNOWN_AGENT}`)).json();
    expect(agent.rating_count).toBeGreaterThan(0);
    expect(profile.mainEntity.aggregateRating).toBeUndefined();
    expect(await blocks.first().textContent()).not.toMatch(
      /aggregateRating|ratingValue|ratingCount|reviewCount/,
    );

    // Nor does the snippet text quote it as fact.
    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) {
      const content = await page.locator(selector).first().getAttribute("content");
      expect(content, selector).toBeTruthy();
      expect(content, selector).not.toContain(agent.rating_count.toLocaleString("en-US"));
      expect(content, selector).not.toMatch(/\bRated\b/);
    }
  });

  test("a gig carries a Product with a USD Offer, and /feed carries nothing", async ({ page }) => {
    await page.goto(`/gigs/${KNOWN_GIG}`);
    const blocks = page.locator('script[type="application/ld+json"]');
    await expect(blocks).toHaveCount(1);

    const nodes = JSON.parse((await blocks.first().textContent()) ?? "") as Array<
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;
    const product = nodes.find((node) => node["@type"] === "Product");
    expect(product).toBeTruthy();
    expect(product.offers["@type"]).toBe("Offer");
    expect(product.offers.priceCurrency).toBe("USD");
    expect(product.offers.price).toMatch(/^\d+\.\d{2}$/);
    // A founding-cast gig: its rating is seeded, so the Product carries none.
    expect(product.aggregateRating).toBeUndefined();

    await page.goto("/feed");
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  });
});

test.describe("open graph images", () => {
  test("the default card and a passport card are both real PNGs", async ({ page, request }) => {
    const root = await request.get("/opengraph-image");
    expect(root.status()).toBe(200);
    expect(root.headers()["content-type"]).toContain("image/png");
    // The PNG signature, not just the header a route can claim.
    expect([...(await root.body()).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    /*
     * The per-route card's published path carries a build hash
     * (`opengraph-image-11u1se?…`), so it is read off the page rather than
     * guessed — which also proves the meta tag points at something real.
     */
    await page.goto(`/agents/${KNOWN_AGENT}`);
    const source = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute("content");
    expect(source).toBeTruthy();

    const card = await request.get(new URL(source!).pathname + new URL(source!).search);
    expect(card.status()).toBe(200);
    expect(card.headers()["content-type"]).toContain("image/png");
    expect([...(await card.body()).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
  });
});

test.describe("per-page head", () => {
  /*
   * Regression guard. These four links were declared in the root layout's
   * `generateMetadata`, and Next merges metadata shallowly — so every page
   * that set `alternates.canonical` (which is every page worth crawling)
   * replaced the root `alternates` object and dropped them. They survived
   * only on `/login` and `/signup`. They are rendered as elements now, and
   * this walks the routes that lost them.
   */
  test("every page advertises the machine editions of the site", async ({ page }) => {
    for (const route of [
      "/",
      `/agents/${KNOWN_AGENT}`,
      `/gigs/${KNOWN_GIG}`,
      "/docs/product-spec",
      "/developers",
      "/login",
    ]) {
      await page.goto(route);
      for (const target of ["/llms.txt", "/llms-full.txt", "/skill.md", "/openapi.json"]) {
        await expect(
          page.locator(`head link[rel="alternate"][href$="${target}"]`),
          `${route} should advertise ${target}`,
        ).toHaveCount(1);
      }
    }
  });

  /*
   * The detail pages the sitemap advertises have to name their own canonical
   * URL: every one of them is reachable with query strings (`?sort=`,
   * `?tab=`, `?q=`), and without a canonical a crawler picks a winner itself.
   */
  test("every HTML page in the sitemap names its own canonical URL", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => new URL(match[1]).pathname)
      .filter((path) => !/\.(md|txt|json|xml)$/.test(path));

    expect(paths.length).toBeGreaterThan(80);

    const missing: string[] = [];
    const wrong: string[] = [];

    for (const path of paths) {
      const html = await (await request.get(path)).text();
      const found = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
      if (found.length !== 1) {
        missing.push(`${path} (${found.length} canonicals)`);
        continue;
      }
      const canonical = found[0];
      if (
        !/^https?:\/\//.test(canonical) ||
        new URL(canonical).pathname.replace(/\/$/, "") !== path.replace(/\/$/, "")
      ) {
        wrong.push(`${path} -> ${canonical}`);
      }
    }

    expect(missing, "pages in the sitemap with no canonical").toEqual([]);
    expect(wrong, "pages whose canonical points somewhere else").toEqual([]);
  });
});

test.describe("the GEO surfaces", () => {
  test("/llms-full.txt is the full text and /llms.txt links to it", async ({ request }) => {
    const full = await request.get("/llms-full.txt");
    expect(full.status()).toBe(200);
    expect(full.headers()["content-type"]).toContain("text/plain");

    const body = await full.text();
    // Substantially longer than the index, and carrying the things the index
    // only points at.
    expect(body.length).toBeGreaterThan(8000);
    expect(body).toContain("## 3. How to join, if you are an agent");
    expect(body).toContain("POST");
    expect(body).toContain("/api/v1/agents/register");
    expect(body).toContain("/api/mcp/mcp");
    expect(body).toContain(`/agents/${KNOWN_AGENT}`);

    const index = await request.get("/llms.txt");
    expect(index.status()).toBe(200);
    expect(await index.text()).toContain("/llms-full.txt");
  });
});
