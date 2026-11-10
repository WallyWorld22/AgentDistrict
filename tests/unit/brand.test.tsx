import * as React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Metadata } from "next";

import { COPYRIGHT, MAKER, MAKER_BUSINESSES, MAKER_CREDIT } from "@/lib/site";
import { DEFAULT_SOCIAL_IMAGE, socialMetadata } from "@/lib/seo/social";
import {
  MAKER_ID,
  aboutPageSchema,
  makerSchema,
  organizationSchema,
  webSiteSchema,
} from "@/lib/seo/schema";
import { serializeJsonLd } from "@/components/seo/json-ld";
import { FOOTER_LINKS, SiteFooter } from "@/components/shell/site-footer";
import { LEGAL_DATE, LEGAL_DATE_ISO, LegalPage } from "@/components/legal/legal-page";

/**
 * Batch 7: the Wally Works credit, the share metadata every public page
 * carries, and the machine documents' single operator line.
 */

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const rest = { ...props };
    delete rest.unoptimized;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

const ORIGIN = "https://agentdistrict.io";
const ROOT = join(__dirname, "..", "..");

let previousSiteUrl: string | undefined;
beforeEach(() => {
  previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = ORIGIN;
});
afterEach(() => {
  if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** Every source file that renders or serves copy. */
const COPY_SOURCES = ["app", "components", "lib"].flatMap((dir) => walk(join(ROOT, dir)));

describe("the maker's facts", () => {
  it("are written the one approved way", () => {
    expect(MAKER.name).toBe("Wally Works");
    expect(MAKER.url).toBe("https://wally.works");
    expect(MAKER_CREDIT.toUpperCase()).toBe("SITE BUILT BY WALLY WORKS");
    expect(MAKER.line).toBe(
      "Custom CRMs, dashboards, websites, and tools that don't exist yet, built for the small businesses big agencies forget.",
    );
    expect(MAKER.place).toBe("Built on the Treasure Coast");
    expect(MAKER_BUSINESSES.map((business) => [business.name, business.url])).toEqual([
      ["Roofmetry", "https://roofmetry.com"],
      ["Chaos HQ", "https://chaosmanagerhq.com"],
    ]);
    expect(MAKER_BUSINESSES[1].linkText).toBe("Request early access");
  });

  it("never appear as one word, with a legal suffix or with a city name in app copy", () => {
    for (const file of COPY_SOURCES) {
      const text = readFileSync(file, "utf8");
      const where = relative(ROOT, file);
      expect(text, where).not.toMatch(/WallyWorks|Wallyworks/);
      expect(text, where).not.toMatch(/Wally Works Enterprises|Wally Works,? LLC/);
      // The maker's home town; seed data names Florida counties, which is fine.
      expect(text, where).not.toMatch(/Port St\.? Lucie/);
    }
  });
});

describe("share metadata (comms-docs-02)", () => {
  it("carries the site name and the default card", () => {
    const social = socialMetadata({ path: "/docs", title: "Docs · AgentDistrict", description: "d" });
    expect(social.openGraph).toMatchObject({
      url: "/docs",
      siteName: "AgentDistrict",
      images: [DEFAULT_SOCIAL_IMAGE],
    });
    expect(social.twitter).toMatchObject({
      card: "summary_large_image",
      images: [DEFAULT_SOCIAL_IMAGE],
    });
  });

  it("leaves the image to a route that ships its own card", () => {
    const social = socialMetadata({ path: "/gigs/x", title: "t", description: "d", ownImage: true });
    expect(social.openGraph).toMatchObject({ siteName: "AgentDistrict" });
    // Present at all, even undefined, and Next would skip the file-based card.
    expect(Object.prototype.hasOwnProperty.call(social.openGraph, "images")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(social.twitter, "images")).toBe(false);
  });

  it("is how every page under app/(app) builds its Open Graph block", () => {
    const pages = walk(join(ROOT, "app", "(app)")).filter((file) => /page\.tsx$/.test(file));
    const raw = pages.filter((file) => /\bopenGraph\s*:/.test(readFileSync(file, "utf8")));
    expect(raw.map((file) => relative(ROOT, file))).toEqual([]);
  });

  it.each([
    ["/", "@/app/(app)/(home)/page"],
    ["/docs", "@/app/(app)/docs/(index)/page"],
    ["/developers", "@/app/(app)/developers/page"],
    ["/about", "@/app/(app)/about/page"],
    ["/privacy", "@/app/(app)/privacy/page"],
    ["/terms", "@/app/(app)/terms/page"],
  ])("%s publishes the share image and the site name", async (path, module) => {
    const { metadata } = (await import(/* @vite-ignore */ module)) as { metadata: Metadata };
    expect(metadata.openGraph).toMatchObject({
      url: path,
      siteName: "AgentDistrict",
      images: [DEFAULT_SOCIAL_IMAGE],
    });
    expect(metadata.twitter).toMatchObject({ images: [DEFAULT_SOCIAL_IMAGE] });
  });

  it("a doc page keeps its article type and gains the card", async () => {
    const { generateMetadata } = await import("@/app/(app)/docs/[slug]/page");
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "product-spec" }) });
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      siteName: "AgentDistrict",
      images: [DEFAULT_SOCIAL_IMAGE],
    });
  });
});

describe("structured data (brand-04)", () => {
  it("names Wally Works as the District's parent, and as the site's creator and publisher", () => {
    const parsed = JSON.parse(
      serializeJsonLd([organizationSchema(ORIGIN), webSiteSchema(ORIGIN)]),
    ) as Array<Record<string, unknown>>;

    expect(parsed[0].name).toBe("AgentDistrict");
    expect(parsed[0].parentOrganization).toEqual(makerSchema(ORIGIN));
    expect(makerSchema(ORIGIN)).toMatchObject({
      "@type": "Organization",
      "@id": MAKER_ID,
      name: "Wally Works",
      url: "https://wally.works",
      logo: `${ORIGIN}/brand/wally-works-mark.png`,
    });

    expect(parsed[1].name).toBe("AgentDistrict");
    expect(parsed[1].creator).toEqual({ "@id": MAKER_ID });
    expect(parsed[1].publisher).toEqual({ "@id": MAKER_ID });
  });

  it("/about is an AboutPage about the District", () => {
    expect(aboutPageSchema(ORIGIN)).toMatchObject({
      "@type": "AboutPage",
      url: `${ORIGIN}/about`,
      about: { "@id": `${ORIGIN}/#organization` },
      creator: { "@id": MAKER_ID },
    });
  });
});

describe("the site-wide footer (brand-01)", () => {
  it("links the information pages and credits the maker once", () => {
    render(<SiteFooter />);
    const footer = screen.getByTestId("site-footer");

    const nav = within(footer).getByRole("navigation", { name: "Site information" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual(FOOTER_LINKS.map((link) => [link.label, link.href]));
    expect(FOOTER_LINKS.map((link) => link.href)).toEqual([
      "/about",
      "/docs",
      "/developers",
      "/privacy",
      "/terms",
    ]);

    const credit = within(footer).getByRole("link", { name: /site built by wally works/i });
    expect(credit.getAttribute("href")).toBe("https://wally.works");
    expect(credit.getAttribute("rel")).toBe("noopener");
    expect(credit.querySelector("img")?.getAttribute("src")).toBe(MAKER.mark);

    // The other businesses belong on /about only.
    expect(footer.textContent).not.toMatch(/Roofmetry|Chaos HQ/);
  });

  it("carries the copyright line in the maker's name, with no entity suffix", () => {
    render(<SiteFooter />);
    const footer = screen.getByTestId("site-footer");
    expect(within(footer).getByTestId("site-copyright").textContent).toBe("© 2026 Wally Works");
    expect(COPYRIGHT).toBe("© 2026 Wally Works");
    expect(footer.textContent).not.toMatch(/LLC|WallyWorks/);
    // The credit line is unchanged beside it.
    expect(within(footer).getByRole("link", { name: /site built by wally works/i })).toBeTruthy();
  });
});

describe("the machine documents (brand-06)", () => {
  function get(path: string) {
    return new Request(`${ORIGIN}${path}`);
  }

  it("llms.txt carries exactly one operator line", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const body = await (await GET(get("/llms.txt"))).text();
    const lines = body.split("\n").filter((line) => line.includes("Wally Works"));
    expect(lines).toEqual(["Operated by Wally Works — https://wally.works"]);
    expect(body).not.toMatch(/Roofmetry|Chaos HQ/);
  });

  it("llms-full.txt carries the same single line", async () => {
    const { GET } = await import("@/app/llms-full.txt/route");
    const body = await (await GET(get("/llms-full.txt"))).text();
    const lines = body.split("\n").filter((line) => line.includes("Wally Works"));
    expect(lines).toEqual(["Operated by Wally Works — https://wally.works"]);
    expect(body).not.toMatch(/Roofmetry|Chaos HQ/);
  });

  it("skill.md stays a protocol, and the agent card's provider stays AgentDistrict", async () => {
    const { GET: skill } = await import("@/app/skill.md/route");
    expect(await (await skill(get("/skill.md"))).text()).not.toMatch(/Wally/);

    const { GET: card } = await import("@/app/.well-known/agent-card.json/route");
    const json = await (await card(get("/.well-known/agent-card.json"))).json();
    expect(json.provider.organization).toBe("AgentDistrict");
  });
});

describe("the sitemap", () => {
  it("lists /about and the approved legal pages", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(`${ORIGIN}/about`);
    expect(urls).toContain(`${ORIGIN}/privacy`);
    expect(urls).toContain(`${ORIGIN}/terms`);
  });
});

describe("the legal pages (approved text)", () => {
  it.each([
    ["/privacy", "@/app/(app)/privacy/page"],
    ["/terms", "@/app/(app)/terms/page"],
  ])("%s is indexable and its description no longer says draft", async (_path, module) => {
    const { metadata } = (await import(/* @vite-ignore */ module)) as { metadata: Metadata };
    // No page-level robots: the page inherits the root layout's index, follow.
    expect(metadata.robots).toBeUndefined();
    expect(String(metadata.description)).not.toMatch(/draft|approval/i);
  });

  it("shows a plain last-updated line, with no draft label", () => {
    render(
      <LegalPage title="Privacy" intro={<p>Intro.</p>} sections={[{ heading: "A", body: "B" }]} />,
    );
    const updated = screen.getByTestId("legal-updated");
    expect(updated.textContent).toBe(`Last updated: ${LEGAL_DATE}`);
    expect(updated.querySelector("time")?.getAttribute("dateTime")).toBe(LEGAL_DATE_ISO);
    expect(document.body.textContent).not.toMatch(/draft|awaiting/i);
  });
});
