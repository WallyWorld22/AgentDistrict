import { expect, test, type Page } from "@playwright/test";

/**
 * Batch 7, served: the site-wide footer and its maker credit at both widths,
 * `/about`, the draft legal pages, the share metadata on every public page and
 * the icons a browser asks for.
 */

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/**
 * Scroll to the end, then name every visible `position: fixed` element — the
 * @World bar on the desktop, the bottom nav and floating @World button on
 * phones — that overlaps a link in the footer.
 *
 * Home streams its sections in after `load`, so the page can still grow after
 * one scroll: the caller polls until the height has stopped changing and the
 * footer's last link is on screen.
 */
async function footerAtEnd(
  page: Page,
): Promise<{ inView: boolean; height: number; hits: string[] }> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  return page.evaluate(() => {
    const footer = document.querySelector('[data-testid="site-footer"]');
    const height = document.documentElement.scrollHeight;
    if (!footer) return { inView: false, height, hits: ["no footer"] };
    const last = footer.querySelector("a:last-of-type")!.getBoundingClientRect();
    const inView = last.top >= 0 && last.bottom <= window.innerHeight;
    const links = [...footer.querySelectorAll("a")].map((link) => link.getBoundingClientRect());
    const fixed = [...document.querySelectorAll<HTMLElement>("body *")].filter((element) => {
      const style = getComputedStyle(element);
      if (style.position !== "fixed" || style.display === "none") return false;
      if (style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !footer.contains(element);
    });
    const hits: string[] = [];
    for (const element of fixed) {
      const box = element.getBoundingClientRect();
      for (const link of links) {
        const overlaps =
          link.left < box.right &&
          link.right > box.left &&
          link.top < box.bottom &&
          link.bottom > box.top;
        if (overlaps) hits.push(element.getAttribute("aria-label") ?? element.className);
      }
    }
    return { inView, height, hits };
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`footer at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ["/", "/agents", "/about"]) {
      test(`${route} ends with the footer, clear of the fixed chrome`, async ({ page }) => {
        await page.goto(route);
        const footer = page.getByTestId("site-footer");
        await expect(footer).toHaveCount(1);

        const nav = footer.getByRole("navigation", { name: "Site information" });
        for (const [name, href] of [
          ["About", "/about"],
          ["Docs", "/docs"],
          ["Developers", "/developers"],
          ["Privacy", "/privacy"],
          ["Terms", "/terms"],
        ]) {
          await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
        }

        const credit = footer.getByRole("link", { name: /site built by wally works/i });
        await expect(credit).toHaveAttribute("href", "https://wally.works");
        await expect(credit).toHaveAttribute("rel", "noopener");
        await expect(credit).toHaveCSS("text-transform", "uppercase");
        let lastHeight = -1;
        await expect
          .poll(
            async () => {
              const { inView, height } = await footerAtEnd(page);
              const settled = height === lastHeight;
              lastHeight = height;
              return settled && inView;
            },
            { intervals: [300] },
          )
          .toBe(true);
        expect((await footerAtEnd(page)).hits).toEqual([]);
        await expect(credit).toBeInViewport();

        // The orange mark actually loads. It is lazy, so only once it is in view.
        await expect
          .poll(() =>
            credit
              .locator("img")
              .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
          )
          .toBe(true);

        // No horizontal scroll at either width.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  });
}

test.describe("about", () => {
  test("says what the District is and who makes it, with followed links", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1, name: "About AgentDistrict" })).toBeVisible();

    const main = page.locator("main");
    await expect(main).toContainText("every run is simulated");
    await expect(main).toContainText("demo credits, not real money");
    await expect(main).toContainText("The residents are real.");
    await expect(main).toContainText(
      "Custom CRMs, dashboards, websites, and tools that don't exist yet, built for the small businesses big agencies forget.",
    );
    await expect(main).toContainText("Built on the Treasure Coast");
    await expect(main).toContainText(
      "Roofmetry is the workspace for roofing contractors: measure a roof from the address, prove the number against public records, and run the job to done.",
    );
    await expect(main).toContainText("County verification covers Florida today.");
    await expect(main).toContainText(
      "Your family, finally on one page: chores, meals, the calendar and groceries in one place, updating on every phone.",
    );
    await expect(main).not.toContainText("LLC");
    await expect(main).not.toContainText("WallyWorks");

    for (const [name, href] of [
      [/^Wally Works$/, "https://wally.works"],
      [/Visit Roofmetry/, "https://roofmetry.com"],
      [/Request early access/, "https://chaosmanagerhq.com"],
    ] as const) {
      const link = main.getByRole("link", { name }).first();
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("rel", "noopener");
    }

    const graph = await page.locator('script[type="application/ld+json"]').first().textContent();
    const nodes = JSON.parse(graph ?? "[]") as Array<Record<string, unknown>>;
    expect(nodes.map((node) => node["@type"])).toEqual(["Organization", "AboutPage"]);
    expect(nodes[0].parentOrganization).toMatchObject({
      name: "Wally Works",
      url: "https://wally.works",
    });
  });

  test("home carries one small credit to /about, and its graph names the maker", async ({
    page,
  }) => {
    await page.goto("/");
    const credit = page.getByTestId("home-maker-credit");
    await expect(credit).toContainText("From the makers");
    await expect(credit.getByRole("link")).toHaveAttribute("href", "/about");
    await expect(page.locator("main")).not.toContainText("Roofmetry");

    const graph = await page.locator('script[type="application/ld+json"]').first().textContent();
    const nodes = JSON.parse(graph ?? "[]") as Array<Record<string, Record<string, string>>>;
    const site = nodes.find((node) => (node["@type"] as unknown) === "WebSite")!;
    expect(site.creator["@id"]).toBe("https://wally.works/#organization");
    expect(site.publisher["@id"]).toBe("https://wally.works/#organization");
  });
});

test.describe("draft legal pages", () => {
  for (const route of ["/privacy", "/terms"]) {
    test(`${route} is a labelled draft and is not indexed yet`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId("legal-version")).toHaveText("Draft — v0.1");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
      await expect(page.locator("main")).toContainText("demo credits");
    });
  }
});

test.describe("share metadata on every public page (comms-docs-02)", () => {
  test("pages that write their own preview keep the card and the site name", async ({
    page,
    request,
  }) => {
    for (const route of ["/", "/docs", "/docs/product-spec", "/developers", "/gigs", "/about"]) {
      await page.goto(route);
      await expect(page.locator('meta[property="og:site_name"]'), route).toHaveAttribute(
        "content",
        "AgentDistrict",
      );
      const image = await page.locator('meta[property="og:image"]').first().getAttribute("content");
      expect(image, route).toMatch(/^https?:\/\/[^/]+\/opengraph-image/);
      const twitter = await page
        .locator('meta[name="twitter:image"]')
        .first()
        .getAttribute("content");
      expect(twitter, route).toBe(image);

      const card = await request.get(new URL(image!).pathname);
      expect(card.status(), route).toBe(200);
      expect(card.headers()["content-type"]).toContain("image/png");
    }
  });

  test("a passport keeps its own card and gains the site name", async ({ page }) => {
    await page.goto("/agents/scout");
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      "AgentDistrict",
    );
    const image = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(image).toMatch(/\/agents\/scout\/opengraph-image/);
  });
});

test.describe("icons (comms-docs-11)", () => {
  test("favicon.ico, the Apple touch icon and the manifest PNGs are served", async ({
    page,
    request,
  }) => {
    const favicon = await request.get("/favicon.ico");
    expect(favicon.status()).toBe(200);
    expect(favicon.headers()["content-type"]).toMatch(/icon/);

    await page.goto("/");
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect(apple).toBeTruthy();
    const appleResponse = await request.get(apple!);
    expect(appleResponse.status()).toBe(200);
    expect(appleResponse.headers()["content-type"]).toContain("image/png");

    const manifest = await (await request.get("/manifest.webmanifest")).json();
    for (const icon of manifest.icons as Array<{ src: string }>) {
      expect((await request.get(icon.src)).status(), icon.src).toBe(200);
    }
  });
});
