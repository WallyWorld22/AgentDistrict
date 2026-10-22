// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getRepo } from "@/lib/data";
import { isFoundingCast } from "@/lib/data/ext/cast";
import { DOC_PAGES } from "@/lib/docs";
import { AGENT_HANDLES } from "@/lib/seed";
import { AUTH_ROUTES, NAV_ITEMS } from "@/lib/nav";
import { serializeJsonLd } from "@/components/seo/json-ld";
import { INDEXNOW_KEY, indexNowTarget, normalizeUrls } from "@/lib/seo/indexnow";
import {
  agentBreadcrumbTrail,
  agentProfileSchema,
  aggregateRating,
  basicPackagePriceCents,
  breadcrumbSchema,
  clampWords,
  deliveryLeadTime,
  docBreadcrumbTrail,
  docSchema,
  earnedAggregateRating,
  endSentence,
  gigBreadcrumbTrail,
  gigSchema,
  organizationSchema,
  webSiteSchema,
} from "@/lib/seo/schema";

/**
 * The discovery layer: `robots.txt`, `sitemap.xml`, the JSON-LD payloads and
 * the IndexNow ping.
 *
 * `app/robots.ts` and `app/sitemap.ts` are plain modules with default exports,
 * so they are imported and called directly — no server needed. The e2e suite
 * checks that Next actually serves them; this checks what they contain.
 */

const ORIGIN = "https://agentdistrict.io";

/** A known passport and a known gig, both seeded, both pinned elsewhere. */
const KNOWN_AGENT = "scout";
const KNOWN_GIG = "find-100-qualified-local-businesses";

/**
 * `robots.ts` and `sitemap.ts` both read `siteUrl()`, which reads
 * `NEXT_PUBLIC_SITE_URL` at call time — so the origin can be pinned per test
 * instead of being whatever the shell happened to export.
 */
let previousSiteUrl: string | undefined;

beforeEach(() => {
  previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = ORIGIN;
});

afterEach(() => {
  if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  delete process.env.VERCEL;
});

describe("robots.txt", () => {
  it("allows everything, closes only /api/, and points at the sitemap", async () => {
    const robots = (await import("@/app/robots")).default();
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];

    expect(robots.sitemap).toBe(`${ORIGIN}/sitemap.xml`);
    // Deliberately no `Host:` — see the note in `app/robots.ts`.
    expect(robots.host).toBeUndefined();

    const wildcard = rules.find((rule) => rule.userAgent === "*");
    expect(wildcard).toBeDefined();
    expect(wildcard!.allow).toBe("/");
    expect(wildcard!.disallow).toEqual(["/api/"]);

    // Nothing but /api/ is ever closed — a rule that disallowed a passport or
    // a machine document would defeat the entire point of this layer.
    for (const rule of rules) {
      expect(rule.disallow).toEqual(["/api/"]);
      expect(rule.allow).toBe("/");
    }
  });

  it("names the LLM crawlers explicitly", async () => {
    const robots = (await import("@/app/robots")).default();
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    const agents = rules.flatMap((rule) =>
      Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent ?? ""],
    );

    for (const crawler of [
      "GPTBot",
      "ClaudeBot",
      "PerplexityBot",
      "Google-Extended",
      "OAI-SearchBot",
      "CCBot",
    ]) {
      expect(agents, `robots.txt should welcome ${crawler}`).toContain(crawler);
    }
  });
});

describe("sitemap.xml", () => {
  it("is absolute, deduplicated, and carries the static + machine surface", async () => {
    const entries = await (await import("@/app/sitemap")).default();
    const urls = entries.map((entry) => entry.url);

    // Absolute, on the configured origin, and unique.
    for (const url of urls) expect(url.startsWith(`${ORIGIN}/`)).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);

    expect(urls).toContain(`${ORIGIN}/`);
    expect(urls).toContain(`${ORIGIN}/skill.md`);
    expect(urls).toContain(`${ORIGIN}/llms.txt`);
    expect(urls).toContain(`${ORIGIN}/llms-full.txt`);

    // The browse pages and the auth pages, minus anything login-gated.
    for (const item of NAV_ITEMS) {
      if (["/inbox", "/wallet", "/command", "/workplace", "/analytics"].includes(item.href)) {
        continue;
      }
      expect(urls, `sitemap should list ${item.href}`).toContain(
        `${ORIGIN}${item.href === "/" ? "/" : item.href}`,
      );
    }
    for (const route of AUTH_ROUTES) expect(urls).toContain(`${ORIGIN}${route}`);

    // …and nothing that answers a redirect to /login.
    for (const gated of ["/wallet", "/settings", "/inbox", "/orders", "/profile", "/analytics"]) {
      expect(urls, `sitemap must not list the login-gated ${gated}`).not.toContain(
        `${ORIGIN}${gated}`,
      );
    }
  });

  it("lists every doc page and a known passport, gig, guild and channel", async () => {
    const entries = await (await import("@/app/sitemap")).default();
    const urls = new Set(entries.map((entry) => entry.url));

    for (const page of DOC_PAGES) expect(urls.has(`${ORIGIN}/docs/${page.slug}`)).toBe(true);

    expect(urls.has(`${ORIGIN}/agents/${KNOWN_AGENT}`)).toBe(true);
    expect(urls.has(`${ORIGIN}/gigs/${KNOWN_GIG}`)).toBe(true);
    expect(urls.has(`${ORIGIN}/guilds/local-growth-guild`)).toBe(true);
    expect(urls.has(`${ORIGIN}/tv/the-otto-and-wally-show`)).toBe(true);
    expect(urls.has(`${ORIGIN}/stores/wallyworks-labs`)).toBe(true);
    expect(urls.has(`${ORIGIN}/market/florida-parcel-toolkit`)).toBe(true);
  });

  it("follows the configured origin rather than hard-coding one", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.com";
    const entries = await (await import("@/app/sitemap")).default();
    expect(entries.every((entry) => entry.url.startsWith("https://preview.example.com/"))).toBe(
      true,
    );
  });

  it("ranks passports and /skill.md above the rest", async () => {
    const entries = await (await import("@/app/sitemap")).default();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    expect(byUrl.get(`${ORIGIN}/`)?.priority).toBe(1);
    expect(byUrl.get(`${ORIGIN}/skill.md`)?.priority).toBe(0.9);
    expect(byUrl.get(`${ORIGIN}/agents/${KNOWN_AGENT}`)?.priority).toBe(0.9);
    // Auth pages are furniture, not destinations.
    expect(byUrl.get(`${ORIGIN}/login`)?.priority).toBe(0.3);
  });
});

describe("JSON-LD serialization", () => {
  it("escapes the characters that could close the script element", () => {
    const serialized = serializeJsonLd({ "@type": "Thing", name: "</script><img src=x>" });

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain(">");
    expect(serialized).not.toContain("&");

    // Still valid JSON, and still the same value.
    expect(JSON.parse(serialized)).toEqual({ "@type": "Thing", name: "</script><img src=x>" });
  });

  it("escapes the JSON-legal JavaScript line terminators", () => {
    const value = `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`;
    const serialized = serializeJsonLd({ "@type": "Thing", name: value });

    expect(serialized).not.toContain(String.fromCharCode(0x2028));
    expect(serialized).not.toContain(String.fromCharCode(0x2029));
    expect(JSON.parse(serialized).name).toBe(value);
  });
});

describe("JSON-LD payloads", () => {
  it("home carries Organization and WebSite with a SearchAction", () => {
    const payload = [organizationSchema(ORIGIN), webSiteSchema(ORIGIN)];
    const parsed = JSON.parse(serializeJsonLd(payload)) as Array<Record<string, unknown>>;

    expect(parsed.map((node) => node["@type"])).toEqual(["Organization", "WebSite"]);
    expect(parsed[0]["@context"]).toBe("https://schema.org");

    const action = parsed[1].potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
    expect((action.target as Record<string, unknown>).urlTemplate).toBe(
      `${ORIGIN}/search?q={search_term_string}`,
    );
    expect(action["query-input"]).toBe("required name=search_term_string");
  });

  it("a passport is a ProfilePage over a hireable Service", async () => {
    const agent = await getRepo().getAgentByHandle(KNOWN_AGENT);
    expect(agent).not.toBeNull();

    const parsed = JSON.parse(serializeJsonLd(agentProfileSchema(agent!, ORIGIN))) as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;

    expect(parsed["@type"]).toBe("ProfilePage");
    expect(parsed.url).toBe(`${ORIGIN}/agents/${KNOWN_AGENT}`);
    expect(parsed.mainEntity["@type"]).toBe("Service");
    expect(parsed.mainEntity.alternateName).toBe(`@${KNOWN_AGENT}`);

    expect(parsed.mainEntity.offers["@type"]).toBe("Offer");
    expect(parsed.mainEntity.offers.priceCurrency).toBe("USD");
    expect(parsed.mainEntity.offers.price).toBe(
      (agent!.starting_price_cents / 100).toFixed(2),
    );
  });

  /*
   * The founding cast's track record is seeded — @scout claims 1,842 ratings
   * over a handful of review rows — and the Passport discloses that beside the
   * number. A rating snippet carries no disclosure, so none of it may reach the
   * structured data: not on a Passport, not on any of the cast's gigs.
   */
  it("a founding-cast passport carries no aggregateRating", async () => {
    const agent = await getRepo().getAgentByHandle(KNOWN_AGENT);
    expect(agent).not.toBeNull();
    expect(isFoundingCast(agent!.handle)).toBe(true);
    // The seed really does carry a rating, so its absence below is the rule
    // at work and not an empty row.
    expect(agent!.rating_count).toBeGreaterThan(0);

    const parsed = JSON.parse(serializeJsonLd(agentProfileSchema(agent!, ORIGIN))) as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;
    expect(parsed.mainEntity.aggregateRating).toBeUndefined();
  });

  it("no founding-cast passport or gig emits any rating or review markup", async () => {
    const repo = getRepo();
    const markup = /aggregateRating|AggregateRating|ratingValue|ratingCount|reviewCount|"Review"/;

    for (const handle of AGENT_HANDLES) {
      const agent = await repo.getAgentByHandle(handle);
      expect(agent, handle).not.toBeNull();
      expect(serializeJsonLd(agentProfileSchema(agent!, ORIGIN)), `@${handle}`).not.toMatch(
        markup,
      );
    }

    const gigs = await repo.listGigs({ limit: 500 });
    expect(gigs.length).toBeGreaterThan(0);
    for (const gig of gigs) {
      expect(isFoundingCast(gig.agent.handle), gig.slug).toBe(true);
      expect(serializeJsonLd(gigSchema(gig, ORIGIN)), gig.slug).not.toMatch(markup);
    }
  });

  /*
   * Anyone who registered starts at zero, and the only write to their count is
   * the one that lands with a `reviews` row — so their rating is earned and
   * keeps its markup, still only once somebody has left one.
   */
  it("an agent that registered keeps the rating it earned", async () => {
    const { agent } = await getRepo().registerAgent({
      handle: "seo-earned-rating",
      name: "SeoEarned",
      tagline: "Walked in and got rated.",
      category: "research",
      skills: ["checking"],
    });
    expect(isFoundingCast(agent.handle)).toBe(false);
    expect(agent.rating_count).toBe(0);

    const unrated = JSON.parse(serializeJsonLd(agentProfileSchema(agent, ORIGIN))) as {
      mainEntity: { aggregateRating?: unknown };
    };
    expect(unrated.mainEntity.aggregateRating).toBeUndefined();

    const rated = JSON.parse(
      serializeJsonLd(agentProfileSchema({ ...agent, rating_avg: 4.5, rating_count: 2 }, ORIGIN)),
    ) as { mainEntity: { aggregateRating?: Record<string, unknown> } };
    expect(rated.mainEntity.aggregateRating).toMatchObject({
      "@type": "AggregateRating",
      ratingValue: 4.5,
      ratingCount: 2,
    });
    // `reviewCount` would claim written reviews the District does not have.
    expect(rated.mainEntity.aggregateRating!.reviewCount).toBeUndefined();
  });

  it("omits aggregateRating entirely for an agent nobody has rated", () => {
    expect(aggregateRating(0, 0)).toBeUndefined();
    expect(aggregateRating(4.9, 0)).toBeUndefined();
    expect(aggregateRating(Number.NaN, 12)).toBeUndefined();
    expect(aggregateRating(4.955, 12)).toMatchObject({ ratingValue: 4.96, ratingCount: 12 });

    // The founding cast gets none whatever its numbers say; anyone else gets
    // the same answer `aggregateRating` gives.
    expect(earnedAggregateRating(KNOWN_AGENT, 4.96, 1842)).toBeUndefined();
    expect(earnedAggregateRating("@Scout", 4.96, 1842)).toBeUndefined();
    expect(earnedAggregateRating("vault-keeper", 4.955, 12)).toMatchObject({
      ratingValue: 4.96,
      ratingCount: 12,
    });
    expect(earnedAggregateRating("vault-keeper", 4.9, 0)).toBeUndefined();
  });

  it("a founding-cast passport's meta description quotes no simulated rating", async () => {
    const agent = await getRepo().getAgentByHandle(KNOWN_AGENT);
    const { generateMetadata } = await import("@/app/(app)/agents/[handle]/page");
    const metadata = await generateMetadata({ params: Promise.resolve({ handle: KNOWN_AGENT }) });

    const descriptions = [
      metadata.description,
      metadata.openGraph?.description,
      metadata.twitter?.description,
    ];
    for (const description of descriptions) {
      expect(typeof description).toBe("string");
      expect(description).not.toMatch(/\brated\b|\bratings\b|\/5\b/i);
      expect(description).not.toContain(agent!.rating_count.toLocaleString("en-US"));
      expect(description).not.toContain(agent!.rating_avg.toFixed(2));
    }
  });

  it("a gig is a Product with an Offer priced from its basic package", async () => {
    const gig = await getRepo().getGigBySlug(KNOWN_GIG);
    expect(gig).not.toBeNull();

    const parsed = JSON.parse(serializeJsonLd(gigSchema(gig!, ORIGIN))) as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;

    expect(parsed["@type"]).toBe("Product");
    expect(parsed.offers["@type"]).toBe("Offer");
    expect(parsed.offers.priceCurrency).toBe("USD");

    const basic = gig!.packages.find((pkg) => pkg.tier === "basic")!;
    expect(basicPackagePriceCents(gig!)).toBe(basic.price_cents);
    expect(parsed.offers.price).toBe((basic.price_cents / 100).toFixed(2));

    expect(parsed.brand.name).toBe(gig!.agent.name);
    // @scout's gig: its rating is part of the seeded track record.
    expect(gig!.rating_count).toBeGreaterThan(0);
    expect(parsed.aggregateRating).toBeUndefined();
  });

  /*
   * Several seeded gigs deliver in under a minute. Reporting all of them
   * as "1 MIN" would overstate the one number the District sells hardest.
   */
  it("reports a gig's delivery time in the unit it really is", () => {
    expect(deliveryLeadTime(6)).toEqual({
      "@type": "QuantitativeValue",
      value: 6,
      unitCode: "SEC",
    });
    expect(deliveryLeadTime(59)).toMatchObject({ value: 59, unitCode: "SEC" });
    expect(deliveryLeadTime(60)).toMatchObject({ value: 1, unitCode: "MIN" });
    expect(deliveryLeadTime(1800)).toMatchObject({ value: 30, unitCode: "MIN" });
    // Never zero, whatever it is handed.
    expect(deliveryLeadTime(0.2)).toMatchObject({ value: 1, unitCode: "SEC" });
  });

  it("every gig's lead time matches its own delivery_seconds", async () => {
    const gigs = await getRepo().listGigs({ limit: 500 });
    expect(gigs.length).toBeGreaterThan(0);

    for (const gig of gigs) {
      const lead = (
        JSON.parse(serializeJsonLd(gigSchema(gig, ORIGIN))) as {
          offers: { deliveryLeadTime?: { value: number; unitCode: string } };
        }
      ).offers.deliveryLeadTime;
      if (gig.delivery_seconds <= 0) {
        expect(lead).toBeUndefined();
        continue;
      }
      const seconds = lead!.unitCode === "SEC" ? lead!.value : lead!.value * 60;
      // Within half a minute of the truth, and never faster than reality.
      expect(Math.abs(seconds - gig.delivery_seconds), gig.slug).toBeLessThanOrEqual(30);
    }
  });

  it("a doc page is a TechArticle listing its own section headings", () => {
    const [page] = DOC_PAGES;
    const parsed = JSON.parse(serializeJsonLd(docSchema(page, ORIGIN))) as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;

    expect(parsed["@type"]).toBe("TechArticle");
    expect(parsed.headline).toBe(page.title);
    expect(parsed.url).toBe(`${ORIGIN}/docs/${page.slug}`);
    expect(parsed.articleSection).toEqual(page.sections.map((section) => section.heading));
  });

  it("every breadcrumb trail is a positioned BreadcrumbList of absolute URLs", async () => {
    const agent = await getRepo().getAgentByHandle(KNOWN_AGENT);
    const gig = await getRepo().getGigBySlug(KNOWN_GIG);

    const trails = [
      agentBreadcrumbTrail(agent!),
      gigBreadcrumbTrail(gig!),
      docBreadcrumbTrail(DOC_PAGES[0]),
    ];

    for (const trail of trails) {
      const parsed = JSON.parse(serializeJsonLd(breadcrumbSchema(ORIGIN, trail))) as Record<
        string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        any
      >;
      expect(parsed["@type"]).toBe("BreadcrumbList");
      expect(parsed.itemListElement).toHaveLength(3);
      parsed.itemListElement.forEach((entry: Record<string, unknown>, index: number) => {
        expect(entry["@type"]).toBe("ListItem");
        expect(entry.position).toBe(index + 1);
        expect(String(entry.item).startsWith(`${ORIGIN}/`)).toBe(true);
      });
    }
  });
});

describe("description copy helpers", () => {
  it("ends a fragment so the next sentence can follow it", () => {
    expect(endSentence("Local business research")).toBe("Local business research.");
    expect(endSentence("Long-form investigation.")).toBe("Long-form investigation.");
    expect(endSentence("What now?")).toBe("What now?");
    expect(endSentence("  spaced   out  ")).toBe("spaced out.");
    expect(endSentence("")).toBe("");
  });

  it("clamps at a word boundary rather than mid-word", () => {
    const text = "legal name, owner where public, phone, email, website, service area";
    const clamped = clampWords(text, 40);

    expect(clamped.length).toBeLessThanOrEqual(41);
    expect(clamped.endsWith("…")).toBe(true);
    // No dangling half-word and no stranded punctuation before the ellipsis.
    expect(clamped).not.toMatch(/[\s,;:.]…$/);
    expect(text.startsWith(clamped.slice(0, -1))).toBe(true);

    expect(clampWords("short enough", 40)).toBe("short enough");
    // A single word longer than the budget still has to be cut somewhere.
    expect(clampWords("a".repeat(80), 20)).toBe(`${"a".repeat(20)}…`);
  });
});

describe("IndexNow", () => {
  it("publishes a key file whose name and body are the key", () => {
    const path = join(process.cwd(), "public", `${INDEXNOW_KEY}.txt`);
    expect(readFileSync(path, "utf8").trim()).toBe(INDEXNOW_KEY);
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is inert off Vercel, and inert without a canonical https origin", () => {
    delete process.env.VERCEL;
    expect(indexNowTarget()).toBeNull();

    process.env.VERCEL = "1";
    expect(indexNowTarget()).toEqual({ origin: ORIGIN, host: "agentdistrict.io" });

    // A deployment with no configured canonical origin never submits: it
    // cannot prove it owns the key file.
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(indexNowTarget()).toBeNull();
  });

  it("resolves relative paths and drops anything on another origin", () => {
    expect(
      normalizeUrls(
        ["/agents/scout", "/agents/scout", `${ORIGIN}/gigs/x`, "https://evil.example.com/x"],
        ORIGIN,
      ),
    ).toEqual([`${ORIGIN}/agents/scout`, `${ORIGIN}/gigs/x`]);
  });

  /*
   * `new URL(x, base)` reads *any* string as a relative reference, so before
   * the guard in `normalizeUrls` a junk argument became
   * `https://agentdistrict.io/not%20a%20url%20at%20all` and was submitted.
   * IndexNow holds submitted 404s against the host.
   */
  it("drops a string that is not a URL instead of resolving it against the origin", () => {
    expect(normalizeUrls(["not a url at all", "agents/scout", "", "//evil.example.com/x"], ORIGIN))
      .toEqual([]);
    expect(normalizeUrls(["/agents/scout"], ORIGIN)).toEqual([`${ORIGIN}/agents/scout`]);
  });

  it("never throws, whatever it is handed", async () => {
    delete process.env.VERCEL;
    const { pingIndexNow } = await import("@/lib/seo/indexnow");
    await expect(pingIndexNow(["not a url", "/agents/scout"])).resolves.toBeUndefined();
  });

  /*
   * The three ways the network can fail a fire-and-forget ping, each on the
   * path that actually reaches `fetch` — the inert case above never gets
   * there, so on its own it proves nothing about the failure handling that
   * keeps `POST /api/v1/agents/register` from 500ing when a search engine is
   * down. `registerAgent` does not await this call, so a rejection here would
   * surface as an unhandled rejection rather than a caught error.
   */
  it("swallows a rejected fetch, a thrown fetch and an error response", async () => {
    process.env.VERCEL = "1";
    const { pingIndexNow } = await import("@/lib/seo/indexnow");
    const realFetch = globalThis.fetch;

    const failures: Array<[string, typeof globalThis.fetch]> = [
      ["rejects", (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof globalThis.fetch],
      [
        "throws synchronously",
        (() => {
          throw new TypeError("fetch failed");
        }) as typeof globalThis.fetch,
      ],
      [
        "answers 500",
        (() =>
          Promise.resolve(new Response("nope", { status: 500 }))) as typeof globalThis.fetch,
      ],
    ];

    try {
      for (const [label, stub] of failures) {
        globalThis.fetch = stub;
        await expect(
          pingIndexNow(["/agents/scout"]),
          `a fetch that ${label} must not escape pingIndexNow`,
        ).resolves.toBeUndefined();
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("submits the protocol's body, on the canonical host only", async () => {
    process.env.VERCEL = "1";
    const { pingIndexNow } = await import("@/lib/seo/indexnow");
    const realFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof globalThis.fetch;

    try {
      await pingIndexNow(["/agents/scout", "https://evil.example.com/x"]);
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.indexnow.org/indexnow");
    expect(calls[0].body).toMatchObject({
      host: "agentdistrict.io",
      key: INDEXNOW_KEY,
      keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`,
      urlList: [`${ORIGIN}/agents/scout`],
    });
  });

  it("makes no request at all when there is nothing on this origin to submit", async () => {
    process.env.VERCEL = "1";
    const { pingIndexNow } = await import("@/lib/seo/indexnow");
    const realFetch = globalThis.fetch;
    let called = 0;

    globalThis.fetch = (() => {
      called += 1;
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof globalThis.fetch;

    try {
      await pingIndexNow(["https://evil.example.com/x", "not a url at all"]);
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(called).toBe(0);
  });
});
