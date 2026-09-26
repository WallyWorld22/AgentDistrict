/**
 * schema.org payload builders for the District's public surfaces.
 *
 * Kept out of the component layer on purpose: these are pure functions over the
 * domain types, so `tests/unit/seo.test.ts` can build every payload and
 * `JSON.parse` it without a renderer. `components/seo/json-ld.tsx` is the only
 * thing that turns one into a `<script>`.
 *
 * **Every number here is a real field.** There are no invented review counts:
 * `aggregateRating` is emitted only when the entity actually carries a rating
 * count, and it reports `ratingCount` (which is what `agents.rating_count` is)
 * rather than `reviewCount` (which would claim a body of written reviews the
 * District does not have for every agent).
 */

import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import type { Agent, Cents, GigWithAgent } from "@/lib/data/types";
import type { DocPage } from "@/lib/docs";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/** A schema.org node. `@type` is always present; the rest is vocabulary. */
export type JsonLdNode = { "@type": string } & Record<string, unknown>;

/** A node ready to be embedded on a page — i.e. one that carries `@context`. */
export type JsonLdDocument = JsonLdNode & { "@context": "https://schema.org" };

const CONTEXT = "https://schema.org" as const;

/** schema.org `price` is a decimal string, and money here is integer cents. */
function dollars(cents: Cents): string {
  return (Math.max(0, Math.round(cents)) / 100).toFixed(2);
}

/** Absolute, no double slash, no trailing slash on the origin. */
function absolute(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}${path}`;
}

/**
 * End a fragment so the next sentence can follow it.
 *
 * Taglines and gig descriptions are written by their authors and most of them
 * do not end in a full stop, which turned "Local business research" +
 * "Rated 4.96/5…" into one run-on sentence in the meta description.
 */
export function endSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return "";
  return /[.!?…:]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Shorten to at most `max` characters, cutting at a word boundary.
 *
 * A naive `slice` produced meta descriptions ending "phone, e…", which reads
 * like a truncated database row rather than a sentence. Nothing shorter than
 * 60% of the budget is kept from the boundary search, so a single very long
 * word cannot collapse the whole description.
 */
export function clampWords(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;

  const cut = trimmed.slice(0, max);
  const boundary = cut.lastIndexOf(" ");
  const kept = boundary > max * 0.6 ? cut.slice(0, boundary) : cut;
  return `${kept.replace(/[\s,;:.]+$/, "")}…`;
}

/**
 * An `AggregateRating`, or `undefined` when there is nothing to report.
 *
 * Google drops a rating snippet with a zero count anyway, and emitting one
 * would be a claim the data does not support.
 */
export function aggregateRating(ratingValue: number, ratingCount: number): JsonLdNode | undefined {
  if (!Number.isFinite(ratingValue) || !Number.isFinite(ratingCount)) return undefined;
  if (ratingCount <= 0 || ratingValue <= 0) return undefined;
  return {
    "@type": "AggregateRating",
    ratingValue: Number(ratingValue.toFixed(2)),
    ratingCount: Math.round(ratingCount),
    bestRating: 5,
    worstRating: 1,
  };
}

/* -------------------------------------------------------------------------- */
/* Site-wide nodes (home)                                                      */
/* -------------------------------------------------------------------------- */

/** The District itself. `@id` is stable so other nodes can reference it. */
export function organizationSchema(origin: string): JsonLdDocument {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": absolute(origin, "/#organization"),
    name: SITE_NAME,
    url: absolute(origin, "/"),
    logo: absolute(origin, "/agentdistrict-mark.svg"),
    image: absolute(origin, "/opengraph-image"),
    slogan: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
    knowsAbout: [
      "AI agents",
      "agent marketplace",
      "Model Context Protocol",
      "A2A agent interoperability",
      "autonomous agent hiring",
    ],
  };
}

/**
 * The website, with the `SearchAction` that lets a search engine (and an agent
 * reading the graph) query the District directly.
 */
export function webSiteSchema(origin: string): JsonLdDocument {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": absolute(origin, "/#website"),
    url: absolute(origin, "/"),
    name: SITE_NAME,
    alternateName: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@id": absolute(origin, "/#organization") },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: absolute(origin, "/search?q={search_term_string}"),
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Breadcrumbs                                                                 */
/* -------------------------------------------------------------------------- */

export type BreadcrumbEntry = { name: string; path: string };

export function breadcrumbSchema(origin: string, trail: BreadcrumbEntry[]): JsonLdDocument {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: trail.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: absolute(origin, entry.path),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Agent passport                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `/agents/[handle]` — a `ProfilePage` whose `mainEntity` is the agent as a
 * hireable `Service`, branded to itself and priced from its starting price.
 *
 * `Service` rather than `Person`: the thing on the page is a capability you can
 * buy, and `Person` would be a lie about what an agent is. The `Brand` on
 * `provider` is what carries the name and the avatar-free logo.
 */
export function agentProfileSchema(agent: Agent, origin: string): JsonLdDocument {
  const url = absolute(origin, `/agents/${agent.handle}`);
  const rating = aggregateRating(agent.rating_avg, agent.rating_count);

  return {
    "@context": CONTEXT,
    "@type": "ProfilePage",
    "@id": `${url}#profile`,
    url,
    name: `${agent.name} — Agent Passport`,
    description: agent.tagline,
    dateCreated: agent.created_at,
    dateModified: agent.updated_at,
    inLanguage: "en",
    isPartOf: { "@id": absolute(origin, "/#website") },
    /*
     * No `primaryImageOfPage`. The passport's OG card is a generated route
     * whose published URL carries a build-specific hash
     * (`/opengraph-image-11u1se?…`), so any URL spelled here would 404 — and a
     * dead image in the graph is worse than none. The `og:image` meta tag Next
     * emits carries the real one, which is what a crawler reads anyway.
     */
    mainEntity: {
      "@type": "Service",
      "@id": `${url}#agent`,
      name: agent.name,
      alternateName: `@${agent.handle}`,
      url,
      description: agent.description || agent.tagline,
      serviceType: AGENT_CATEGORY_LABELS[agent.category],
      category: AGENT_CATEGORY_LABELS[agent.category],
      ...(agent.skills.length > 0 ? { knowsAbout: agent.skills } : {}),
      ...(agent.regions.length > 0 ? { areaServed: agent.regions } : {}),
      provider: {
        "@type": "Brand",
        "@id": `${url}#brand`,
        name: agent.name,
        alternateName: `@${agent.handle}`,
        url,
        slogan: agent.tagline,
      },
      ...(rating ? { aggregateRating: rating } : {}),
      offers: {
        "@type": "Offer",
        url,
        price: dollars(agent.starting_price_cents),
        priceCurrency: "USD",
        availability:
          agent.status === "offline"
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
        seller: { "@id": absolute(origin, "/#organization") },
      },
      isPartOf: { "@id": absolute(origin, "/#website") },
    },
  };
}

/** The trail above an agent passport. */
export function agentBreadcrumbTrail(agent: Agent): BreadcrumbEntry[] {
  return [
    { name: SITE_NAME, path: "/" },
    { name: "Agent Passports", path: "/agents" },
    { name: agent.name, path: `/agents/${agent.handle}` },
  ];
}

/* -------------------------------------------------------------------------- */
/* Gig                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The package a gig's price is quoted from.
 *
 * `gigs.starting_price_cents` is the denormalised copy of exactly this, so the
 * basic tier is the honest source and the column is the fallback for a gig that
 * somehow carries no packages.
 */
export function basicPackagePriceCents(gig: GigWithAgent): Cents {
  const basic = gig.packages.find((pkg) => pkg.tier === "basic") ?? gig.packages[0];
  return basic ? basic.price_cents : gig.starting_price_cents;
}

/**
 * A gig's delivery time as a `QuantitativeValue`, in the unit that tells the
 * truth about it.
 *
 * Rounding everything to whole minutes overstated the District's single
 * loudest claim: a 6-second QA smoke test and an 18-second support shift both
 * came out as "1 MIN", and 8 of the 38 seeded gigs deliver in under a minute.
 * `SEC` and `MIN` are both UN/CEFACT Rec 20 codes, which is what `unitCode`
 * takes, so the sub-minute case simply reports the seconds it really is.
 */
export function deliveryLeadTime(seconds: number): JsonLdNode {
  const whole = Math.max(1, Math.round(seconds));
  return whole < 60
    ? { "@type": "QuantitativeValue", value: whole, unitCode: "SEC" }
    : { "@type": "QuantitativeValue", value: Math.round(whole / 60), unitCode: "MIN" };
}

/**
 * `/gigs/[slug]` — a `Product` with a real `Offer`. A gig is a packaged,
 * priced, deliverable outcome, which is what `Product` + `Offer` describes; the
 * `additionalType` keeps the "it is really a service" half of the truth.
 */
export function gigSchema(gig: GigWithAgent, origin: string): JsonLdDocument {
  const url = absolute(origin, `/gigs/${gig.slug}`);
  const agentUrl = absolute(origin, `/agents/${gig.agent.handle}`);
  const rating = aggregateRating(gig.rating_avg, gig.rating_count);

  return {
    "@context": CONTEXT,
    "@type": "Product",
    "@id": `${url}#gig`,
    url,
    name: gig.title,
    description: gig.description,
    additionalType: "https://schema.org/Service",
    category: AGENT_CATEGORY_LABELS[gig.category],
    ...(gig.tags.length > 0 ? { keywords: gig.tags.join(", ") } : {}),
    // No `image`, for the reason spelled out in `agentProfileSchema`: the
    // generated OG route's real URL carries a build hash, so the predictable
    // spelling is a 404.
    brand: {
      "@type": "Brand",
      name: gig.agent.name,
      alternateName: `@${gig.agent.handle}`,
      url: agentUrl,
    },
    ...(rating ? { aggregateRating: rating } : {}),
    offers: {
      "@type": "Offer",
      url,
      price: dollars(basicPackagePriceCents(gig)),
      priceCurrency: "USD",
      availability:
        gig.status === "active" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Brand",
        name: gig.agent.name,
        url: agentUrl,
      },
      ...(gig.delivery_seconds > 0
        ? { deliveryLeadTime: deliveryLeadTime(gig.delivery_seconds) }
        : {}),
    },
  };
}

/** The trail above a gig. */
export function gigBreadcrumbTrail(gig: GigWithAgent): BreadcrumbEntry[] {
  return [
    { name: SITE_NAME, path: "/" },
    { name: "Gigs", path: "/gigs" },
    { name: gig.title, path: `/gigs/${gig.slug}` },
  ];
}

/* -------------------------------------------------------------------------- */
/* Docs                                                                        */
/* -------------------------------------------------------------------------- */

/** `/docs/[slug]` — a `TechArticle`, which is what these pages actually are. */
export function docSchema(page: DocPage, origin: string): JsonLdDocument {
  const url = absolute(origin, `/docs/${page.slug}`);
  return {
    "@context": CONTEXT,
    "@type": "TechArticle",
    "@id": `${url}#article`,
    url,
    headline: page.title,
    name: page.title,
    description: page.summary,
    inLanguage: "en",
    articleSection: page.sections.map((section) => section.heading),
    isPartOf: { "@id": absolute(origin, "/#website") },
    publisher: { "@id": absolute(origin, "/#organization") },
    author: { "@id": absolute(origin, "/#organization") },
    proficiencyLevel: "Beginner",
  };
}

/** The trail above a doc page. */
export function docBreadcrumbTrail(page: DocPage): BreadcrumbEntry[] {
  return [
    { name: SITE_NAME, path: "/" },
    { name: "Docs", path: "/docs" },
    { name: page.title, path: `/docs/${page.slug}` },
  ];
}
