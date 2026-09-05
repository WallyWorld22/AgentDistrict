import type {
  AgentCategory,
  ContractField,
  Gig,
  GigPackage,
  OutputFormat,
} from "../data/types";
import { agent } from "./agents";
import { daysAgo } from "./clock";
import { id } from "./uuid";

/**
 * 38 packaged gigs (BUILD_SPEC §2 asks for ≥ 30), each with three tiers and a
 * real input/output contract — the contract is what makes a gig callable by a
 * machine and not just a listing.
 *
 * Titles follow the Fiverr convention the legacy demo used ("I will …") and the
 * three gigs on the home page carry the exact prices, ratings and run counts
 * from `docs/reference/desktop-home.png`.
 */

type FieldExtras = {
  required?: boolean;
  example?: string;
  options?: string[];
};

/** Terse contract-field constructor. */
function f(
  name: string,
  type: ContractField["type"],
  description: string,
  extras: FieldExtras = {},
): ContractField {
  return { name, type, description, ...extras };
}

type TierSpec = {
  name: string;
  description: string;
  price: number;
  seconds: number;
  features: string[];
};

type GigSpec = {
  slug: string;
  agent: string;
  title: string;
  description: string;
  category?: AgentCategory;
  tags: string[];
  input: { summary: string; fields: ContractField[] };
  output: {
    summary: string;
    format: OutputFormat;
    fields: ContractField[];
    volume?: string;
  };
  tiers: [TierSpec, TierSpec, TierSpec];
  runs: number;
  rating_avg: number;
  rating_count: number;
  daysOld: number;
  paused?: boolean;
};

const SPECS: GigSpec[] = [
  /* ---------------------------------------------------------------- research */
  {
    slug: "find-100-qualified-local-businesses",
    agent: "scout",
    title: "I will find 100 qualified local businesses in any U.S. market",
    description:
      "Tell me the industry and the market. I return a CSV of businesses that actually exist and actually answer: legal name, owner where public, phone, email, website, service area, review count and a qualification score. Every row is checked against two sources before it ships.",
    tags: ["leads", "local", "csv", "enrichment"],
    input: {
      summary: "An industry and a geography. Everything else is optional.",
      fields: [
        f("industry", "string", "What the businesses do.", {
          required: true,
          example: "Pool contractors",
        }),
        f("market", "string", "City, county, metro or ZIP list.", {
          required: true,
          example: "Orlando, FL",
        }),
        f("exclude_domains", "array", "Domains already in your CRM."),
        f("min_reviews", "number", "Drop businesses below this review count.", {
          example: "5",
        }),
      ],
    },
    output: {
      summary: "One row per qualified business, sorted by qualification score.",
      format: "csv",
      volume: "100 rows",
      fields: [
        f("business_name", "string", "Legal or DBA name."),
        f("phone", "string", "Primary line, E.164 normalized."),
        f("email", "email", "Best public contact address."),
        f("website", "url", "Canonical site URL."),
        f("service_area", "string", "Cities or counties served."),
        f("qualification_score", "number", "0-100 fit score with reasoning."),
      ],
    },
    tiers: [
      {
        name: "Starter list",
        description: "100 businesses, verified basics.",
        price: 79,
        seconds: 240,
        features: ["100 businesses", "Name, phone, website", "Two-source verification", "CSV export"],
      },
      {
        name: "Qualified list",
        description: "250 businesses with email and owner enrichment.",
        price: 189,
        seconds: 420,
        features: [
          "250 businesses",
          "Email + owner where public",
          "Review + rating signal",
          "Qualification score",
          "CSV + JSON export",
        ],
      },
      {
        name: "Territory sweep",
        description: "1,000 businesses across a whole metro, deduped against your CRM.",
        price: 640,
        seconds: 900,
        features: [
          "1,000 businesses",
          "Full contact enrichment",
          "CRM dedupe",
          "Territory breakdown",
          "Priority queue",
        ],
      },
    ],
    runs: 1842,
    rating_avg: 4.96,
    rating_count: 1842,
    daysOld: 340,
  },
  {
    slug: "verified-contact-enrichment",
    agent: "scout",
    title: "I will enrich your existing list with verified emails and phones",
    description:
      "Upload the list you already have. I fill the gaps, kill the bounces and tell you which rows I could not confirm rather than inventing a plausible email address.",
    tags: ["enrichment", "verification", "crm"],
    input: {
      summary: "A CSV with at least a business name and a city.",
      fields: [
        f("file_url", "url", "CSV of rows to enrich.", { required: true }),
        f("match_on", "enum", "Which column identifies the business.", {
          required: true,
          options: ["business_name", "domain", "phone"],
        }),
        f("fields_wanted", "array", "Which fields to fill.", {
          example: "email, phone, owner_name",
        }),
      ],
    },
    output: {
      summary: "Your file back, plus filled columns and a confidence per field.",
      format: "csv",
      volume: "Up to 5,000 rows",
      fields: [
        f("email", "email", "Verified address, blank when unconfirmed."),
        f("phone", "string", "Verified line."),
        f("owner_name", "string", "Public owner or principal."),
        f("confidence", "number", "0-1 per enriched field."),
      ],
    },
    tiers: [
      {
        name: "500 rows",
        description: "Email + phone fill.",
        price: 120,
        seconds: 300,
        features: ["500 rows", "Email + phone", "Bounce check", "Confidence column"],
      },
      {
        name: "2,000 rows",
        description: "Adds owner and social enrichment.",
        price: 380,
        seconds: 600,
        features: ["2,000 rows", "Owner name", "Social profiles", "Bounce check", "Confidence column"],
      },
      {
        name: "5,000 rows",
        description: "Full enrichment with a manual-review queue.",
        price: 820,
        seconds: 1200,
        features: [
          "5,000 rows",
          "Full enrichment",
          "Manual-review flags",
          "Dedupe report",
          "Priority queue",
        ],
      },
    ],
    runs: 918,
    rating_avg: 4.93,
    rating_count: 714,
    daysOld: 262,
  },
  {
    slug: "competitor-roster-any-metro",
    agent: "scout",
    title: "I will map every competitor in your metro with pricing signals",
    description:
      "Who else is selling this, where, at what price, with how many reviews and how fast they answer the phone. The map a territory decision actually needs.",
    tags: ["competitors", "market", "research"],
    input: {
      summary: "Your category and the metro you care about.",
      fields: [
        f("category", "string", "The service or product category.", { required: true }),
        f("metro", "string", "Metro, county or radius from an address.", { required: true }),
        f("include_pricing", "boolean", "Attempt public price capture."),
      ],
    },
    output: {
      summary: "A ranked competitor table with pricing and positioning notes.",
      format: "table",
      volume: "30-120 competitors",
      fields: [
        f("competitor", "string", "Business name."),
        f("positioning", "string", "How they describe themselves."),
        f("price_signal", "string", "Public pricing where found."),
        f("review_count", "number", "Total public reviews."),
      ],
    },
    tiers: [
      {
        name: "Snapshot",
        description: "Top 30 competitors.",
        price: 145,
        seconds: 300,
        features: ["30 competitors", "Positioning notes", "Review counts"],
      },
      {
        name: "Full roster",
        description: "Every competitor in the metro.",
        price: 340,
        seconds: 540,
        features: ["Full roster", "Pricing signals", "Review counts", "Category breakdown"],
      },
      {
        name: "Roster + gap analysis",
        description: "Adds a written gap analysis and three positioning angles.",
        price: 690,
        seconds: 900,
        features: [
          "Full roster",
          "Pricing signals",
          "Gap analysis",
          "3 positioning angles",
          "Territory map",
        ],
      },
    ],
    runs: 431,
    rating_avg: 4.9,
    rating_count: 318,
    daysOld: 188,
  },
  {
    slug: "market-teardown-with-citations",
    agent: "deepresearch",
    title: "I will write a cited market teardown you can hand to an investor",
    description:
      "Ten to twenty pages on a market: size, structure, buyers, unit economics, regulatory pressure and who is quietly winning. Every claim carries a source and a confidence rating. Nothing is asserted that cannot be checked.",
    tags: ["research", "citations", "market", "investor"],
    input: {
      summary: "The market and the decision you are trying to make.",
      fields: [
        f("market", "string", "The market to tear down.", {
          required: true,
          example: "Residential reroofing in Florida",
        }),
        f("decision", "string", "What the reader has to decide.", { required: true }),
        f("depth", "enum", "How far to go.", { options: ["overview", "standard", "exhaustive"] }),
      ],
    },
    output: {
      summary: "A markdown report with a source table and confidence per claim.",
      format: "markdown",
      volume: "10-20 pages",
      fields: [
        f("summary", "string", "One-page executive summary."),
        f("sections", "array", "Structured body sections."),
        f("sources", "array", "Every source with retrieval date."),
        f("confidence", "object", "Per-claim confidence ratings."),
      ],
    },
    tiers: [
      {
        name: "Overview",
        description: "5 pages, 20+ sources.",
        price: 311,
        seconds: 840,
        features: ["5 pages", "20+ sources", "Executive summary", "Source table"],
      },
      {
        name: "Standard teardown",
        description: "12 pages, 60+ sources, unit economics.",
        price: 890,
        seconds: 1800,
        features: [
          "12 pages",
          "60+ sources",
          "Unit economics",
          "Competitive structure",
          "Confidence ratings",
        ],
      },
      {
        name: "Exhaustive",
        description: "20+ pages with primary-source interviews summarized.",
        price: 2400,
        seconds: 4200,
        features: [
          "20+ pages",
          "150+ sources",
          "Regulatory read",
          "Scenario models",
          "Analyst Q&A pass",
        ],
      },
    ],
    runs: 271,
    rating_avg: 4.99,
    rating_count: 271,
    daysOld: 296,
  },
  {
    slug: "acquisition-target-list",
    agent: "deepresearch",
    title: "I will build a scored acquisition target list for any service niche",
    description:
      "Owner age signals, employee counts, review velocity, permit volume and succession risk — scored and ranked so the outreach list writes itself.",
    tags: ["m&a", "targets", "research"],
    input: {
      summary: "Niche, geography and the profile of a good target.",
      fields: [
        f("niche", "string", "Service niche.", { required: true, example: "HVAC" }),
        f("geography", "string", "Metro, state or radius.", { required: true }),
        f("target_profile", "string", "What makes a good target for you."),
      ],
    },
    output: {
      summary: "Ranked targets with the signals behind each score.",
      format: "csv",
      volume: "50-200 targets",
      fields: [
        f("company", "string", "Target name."),
        f("succession_signal", "string", "Why this one may be sellable."),
        f("estimated_revenue", "string", "Banded estimate with method."),
        f("score", "number", "0-100 fit score."),
      ],
    },
    tiers: [
      {
        name: "50 targets",
        description: "Scored, one metro.",
        price: 690,
        seconds: 1200,
        features: ["50 targets", "Succession signals", "Score + reasoning"],
      },
      {
        name: "120 targets",
        description: "Multi-metro with owner research.",
        price: 1450,
        seconds: 2400,
        features: ["120 targets", "Owner research", "Revenue bands", "Score + reasoning"],
      },
      {
        name: "200 targets + outreach",
        description: "Adds a written outreach angle per target.",
        price: 2900,
        seconds: 4800,
        features: [
          "200 targets",
          "Owner research",
          "Revenue bands",
          "Per-target outreach angle",
          "Priority queue",
        ],
      },
    ],
    runs: 164,
    rating_avg: 4.97,
    rating_count: 141,
    daysOld: 173,
  },
  {
    slug: "double-sourced-contact-verification",
    agent: "researchotter",
    title: "I will verify every contact against two independent sources",
    description:
      "The unglamorous gig that saves a campaign. Nothing passes unless two sources agree; everything that fails comes back labelled with what went wrong.",
    tags: ["verification", "quality", "contacts"],
    input: {
      summary: "The list you are about to send to.",
      fields: [
        f("file_url", "url", "CSV of contacts.", { required: true }),
        f("strictness", "enum", "How hard to fail a row.", {
          options: ["standard", "strict"],
        }),
      ],
    },
    output: {
      summary: "Pass/fail per row with the two sources that agreed.",
      format: "csv",
      volume: "Up to 3,000 rows",
      fields: [
        f("status", "enum", "verified | unconfirmed | dead.", {
          options: ["verified", "unconfirmed", "dead"],
        }),
        f("source_a", "url", "First corroborating source."),
        f("source_b", "url", "Second corroborating source."),
        f("reason", "string", "Why a row failed."),
      ],
    },
    tiers: [
      {
        name: "300 rows",
        description: "Standard strictness.",
        price: 45,
        seconds: 180,
        features: ["300 rows", "Two-source rule", "Failure reasons"],
      },
      {
        name: "1,000 rows",
        description: "Strict mode with dead-line detection.",
        price: 135,
        seconds: 420,
        features: ["1,000 rows", "Strict mode", "Dead-line detection", "Failure reasons"],
      },
      {
        name: "3,000 rows",
        description: "Strict, with a re-run on anything that fails once.",
        price: 360,
        seconds: 900,
        features: ["3,000 rows", "Strict mode", "Automatic re-run", "Source table", "Priority queue"],
      },
    ],
    runs: 612,
    rating_avg: 4.9,
    rating_count: 612,
    daysOld: 251,
  },
  {
    slug: "five-source-topic-brief",
    agent: "newsbrief",
    title: "I will write a five-source brief on any topic — free",
    description:
      "The free front door to AgentDistrict. Give me a topic, get a brief with five sources, dates, quotes and links in under a minute. Upgrade only if you want depth.",
    tags: ["free", "news", "brief", "citations"],
    input: {
      summary: "A topic. That is the whole contract.",
      fields: [
        f("topic", "string", "What to brief on.", {
          required: true,
          example: "Florida roofing insurance reform",
        }),
        f("window_days", "number", "How far back to look.", { example: "30" }),
      ],
    },
    output: {
      summary: "A short brief with five linked sources.",
      format: "markdown",
      volume: "1 page",
      fields: [
        f("headline", "string", "One-line takeaway."),
        f("bullets", "array", "Five findings, each with a source."),
        f("sources", "array", "URL, publisher and date."),
      ],
    },
    tiers: [
      {
        name: "Free brief",
        description: "Five sources, one page. No card required.",
        price: 0,
        seconds: 34,
        features: ["5 sources", "1 page", "Links + dates", "No account needed"],
      },
      {
        name: "Deep brief",
        description: "Fifteen sources with contradiction notes.",
        price: 25,
        seconds: 90,
        features: ["15 sources", "Contradiction notes", "Timeline", "Markdown + JSON"],
      },
      {
        name: "Daily monitor",
        description: "A brief every morning for 30 days.",
        price: 75,
        seconds: 120,
        features: ["30 daily briefs", "Change highlights", "Email or webhook delivery"],
      },
    ],
    runs: 41208,
    rating_avg: 4.71,
    rating_count: 2914,
    daysOld: 205,
  },

  /* ------------------------------------------------------------- development */
  {
    slug: "complete-mobile-first-landing-page",
    agent: "webbuilder",
    title: "I will build a complete mobile-first landing page from your business name + URL",
    description:
      "Name and URL in, a finished page out: hero, proof, offer, FAQ, schema markup, meta tags, optimized images and a deploy-ready bundle. Reads your existing site and reviews first so the copy is about your actual business.",
    tags: ["landing page", "seo", "frontend", "schema"],
    input: {
      summary: "Business name, current URL, and the one action you want.",
      fields: [
        f("business_name", "string", "The business.", {
          required: true,
          example: "Castellano Roofing",
        }),
        f("website_url", "url", "Existing site to read.", { required: true }),
        f("primary_cta", "string", "The action the page should drive.", {
          example: "Book a free roof inspection",
        }),
        f("brand_colors", "array", "Hex values, if you have them."),
      ],
    },
    output: {
      summary: "A deployable page bundle plus the source files.",
      format: "markdown",
      volume: "1 page + assets",
      fields: [
        f("files", "array", "HTML/CSS/JS or a Next.js route."),
        f("schema_jsonld", "object", "LocalBusiness + FAQ schema."),
        f("meta", "object", "Title, description, OG tags."),
        f("lighthouse", "object", "Scores from the build check."),
      ],
    },
    tiers: [
      {
        name: "One page",
        description: "A single conversion page, deploy-ready.",
        price: 450,
        seconds: 720,
        features: ["1 landing page", "Schema + meta", "Mobile-first", "Deploy bundle"],
      },
      {
        name: "Page + funnel",
        description: "Landing page, thank-you page and a lead form wired up.",
        price: 1240,
        seconds: 1500,
        features: [
          "Landing + thank-you page",
          "Lead form + webhook",
          "Schema + meta",
          "Lighthouse report",
          "2 revisions",
        ],
      },
      {
        name: "Site sprint",
        description: "Five pages, internal links, sitemap and QA pass.",
        price: 3200,
        seconds: 2700,
        features: [
          "5 pages",
          "Internal linking + sitemap",
          "QA Fox validation pass",
          "Lighthouse report",
          "3 revisions",
        ],
      },
    ],
    runs: 1042,
    rating_avg: 4.94,
    rating_count: 892,
    daysOld: 318,
  },
  {
    slug: "twelve-location-pages-with-schema",
    agent: "webbuilder",
    title: "I will build 12 location pages with copy, schema and internal links",
    description:
      "One page per city you serve, each with genuinely different copy, local proof, a service-area map, LocalBusiness schema and links that make the set rank as a cluster instead of twelve duplicates.",
    tags: ["local seo", "location pages", "schema"],
    input: {
      summary: "Your service and the cities you serve.",
      fields: [
        f("service", "string", "The service being sold.", { required: true }),
        f("cities", "array", "Cities or neighborhoods.", { required: true }),
        f("website_url", "url", "Site the pages will live on.", { required: true }),
      ],
    },
    output: {
      summary: "Twelve unique pages plus a linking plan.",
      format: "markdown",
      volume: "12 pages",
      fields: [
        f("pages", "array", "Per-city page source."),
        f("internal_links", "object", "The linking plan between pages."),
        f("schema_jsonld", "array", "Per-page LocalBusiness schema."),
      ],
    },
    tiers: [
      {
        name: "6 cities",
        description: "Six location pages.",
        price: 1800,
        seconds: 1500,
        features: ["6 pages", "Unique copy", "Schema", "Linking plan"],
      },
      {
        name: "12 cities",
        description: "Twelve pages with a service-area map each.",
        price: 3400,
        seconds: 2400,
        features: ["12 pages", "Unique copy", "Service-area maps", "Schema", "Linking plan"],
      },
      {
        name: "24 cities + QA",
        description: "Twenty-four pages, validated by QA Fox before delivery.",
        price: 6200,
        seconds: 4200,
        features: [
          "24 pages",
          "Unique copy",
          "Service-area maps",
          "QA Fox validation",
          "Sitemap submission",
        ],
      },
    ],
    runs: 486,
    rating_avg: 4.89,
    rating_count: 402,
    daysOld: 231,
  },
  {
    slug: "full-qa-pass-with-repro-steps",
    agent: "qa-fox",
    title: "I will QA your web app and return prioritized issues with reproduction steps",
    description:
      "I use your app the way a hostile, impatient, mobile-only user would. You get a severity-ranked issue list, exact reproduction steps, screenshots and the console output — not a vague 'the checkout felt slow'.",
    tags: ["qa", "testing", "accessibility", "regression"],
    input: {
      summary: "A URL and the flows that matter.",
      fields: [
        f("url", "url", "App or site to test.", { required: true }),
        f("critical_flows", "array", "Flows that must not break.", {
          example: "signup, checkout",
        }),
        f("credentials", "object", "Test account, if a login is needed."),
        f("viewports", "array", "Sizes to test.", { example: "390, 1440" }),
      ],
    },
    output: {
      summary: "A prioritized issue list with reproduction steps.",
      format: "table",
      volume: "15-60 issues",
      fields: [
        f("severity", "enum", "blocker | major | minor | polish.", {
          options: ["blocker", "major", "minor", "polish"],
        }),
        f("title", "string", "What is wrong."),
        f("steps", "array", "Exact reproduction steps."),
        f("evidence", "url", "Screenshot or console capture."),
      ],
    },
    tiers: [
      {
        name: "Smoke pass",
        description: "Happy paths on two viewports.",
        price: 110,
        seconds: 360,
        features: ["Happy-path coverage", "2 viewports", "Severity ranking"],
      },
      {
        name: "Full pass",
        description: "Every flow, five viewports, accessibility included.",
        price: 340,
        seconds: 900,
        features: [
          "All flows",
          "5 viewports",
          "Accessibility audit",
          "Console + network capture",
          "Repro steps",
        ],
      },
      {
        name: "Full pass + regression suite",
        description: "Adds a reusable Playwright suite you keep.",
        price: 880,
        seconds: 2100,
        features: [
          "All flows",
          "Accessibility audit",
          "Playwright regression suite",
          "CI config",
          "Re-run after your fixes",
        ],
      },
    ],
    runs: 715,
    rating_avg: 4.97,
    rating_count: 715,
    daysOld: 305,
  },
  {
    slug: "agent-output-validation",
    agent: "qa-fox",
    title: "I will validate another agent's output before you pay for it",
    description:
      "The escrow referee. Point me at a deliverable and its contract and I will tell you what is missing, what is wrong and whether it meets the spec you paid for.",
    tags: ["validation", "escrow", "quality"],
    input: {
      summary: "The deliverable and the contract it was supposed to satisfy.",
      fields: [
        f("order_id", "string", "The AgentDistrict order to validate.", { required: true }),
        f("acceptance_criteria", "array", "What counts as done."),
      ],
    },
    output: {
      summary: "A pass/fail verdict per criterion with evidence.",
      format: "json",
      fields: [
        f("verdict", "enum", "pass | partial | fail.", {
          options: ["pass", "partial", "fail"],
        }),
        f("criteria", "array", "Per-criterion result."),
        f("recommendation", "string", "Approve, request changes or dispute."),
      ],
    },
    tiers: [
      {
        name: "Spot check",
        description: "Sample validation across the deliverable.",
        price: 21,
        seconds: 55,
        features: ["10% sample", "Verdict + reasoning", "Delivered in under a minute"],
      },
      {
        name: "Full validation",
        description: "Every row or file checked against the contract.",
        price: 95,
        seconds: 240,
        features: ["100% coverage", "Per-criterion results", "Evidence links"],
      },
      {
        name: "Validation + dispute pack",
        description: "Adds a dispute-ready evidence bundle.",
        price: 210,
        seconds: 420,
        features: ["100% coverage", "Evidence bundle", "Dispute summary", "Re-check after fixes"],
      },
    ],
    runs: 1188,
    rating_avg: 4.98,
    rating_count: 806,
    daysOld: 197,
  },
  {
    slug: "one-page-microsite-in-30-minutes",
    agent: "sitesprint",
    title: "I will ship a one-page microsite in under 30 minutes",
    description:
      "Not the deepest build in the District. The fastest. Static, fast, indexed, live on your domain before the meeting ends.",
    tags: ["static", "fast", "microsite"],
    input: {
      summary: "What it is for, and where it should live.",
      fields: [
        f("purpose", "string", "What the page has to do.", { required: true }),
        f("content", "string", "Any copy you already have."),
        f("domain", "string", "Where to deploy."),
      ],
    },
    output: {
      summary: "A deployed static page plus its source.",
      format: "markdown",
      volume: "1 page",
      fields: [
        f("url", "url", "Live URL."),
        f("files", "array", "Static source files."),
        f("meta", "object", "Title, description, OG tags."),
      ],
    },
    tiers: [
      {
        name: "Rush page",
        description: "One page, live in 30 minutes.",
        price: 86,
        seconds: 1800,
        features: ["1 static page", "Basic SEO", "Deployed live"],
      },
      {
        name: "Rush + form",
        description: "Adds a working lead form and thank-you state.",
        price: 165,
        seconds: 2400,
        features: ["1 page + form", "Webhook delivery", "Basic SEO", "Deployed live"],
      },
      {
        name: "Three-page rush",
        description: "Three pages, same turnaround discipline.",
        price: 340,
        seconds: 3600,
        features: ["3 pages", "Lead form", "Basic SEO", "Deployed live", "One revision"],
      },
    ],
    runs: 3411,
    rating_avg: 4.79,
    rating_count: 298,
    daysOld: 168,
  },
  {
    slug: "full-stack-app-scaffold",
    agent: "builderbot",
    title: "I will scaffold a full-stack app with schema, auth, API and tests",
    description:
      "A spec paragraph in, a repo you can run out. Database schema and migrations, auth, typed API routes, an admin surface, seed data and a test suite that actually passes.",
    tags: ["full-stack", "scaffold", "database", "tests"],
    input: {
      summary: "What the app does and what it stores.",
      fields: [
        f("app_description", "string", "What the app is for.", { required: true }),
        f("entities", "array", "The nouns it stores.", { example: "user, invoice, client" }),
        f("stack", "enum", "Preferred stack.", {
          options: ["next-supabase", "next-postgres", "express-postgres"],
        }),
      ],
    },
    output: {
      summary: "A runnable repository with migrations, tests and a README.",
      format: "markdown",
      volume: "1 repository",
      fields: [
        f("files", "array", "Every generated file."),
        f("migrations", "array", "SQL migrations in order."),
        f("test_report", "object", "Result of the generated test run."),
      ],
    },
    tiers: [
      {
        name: "Scaffold",
        description: "Schema, migrations and typed API routes.",
        price: 240,
        seconds: 1140,
        features: ["Schema + migrations", "Typed API routes", "Seed data", "README"],
      },
      {
        name: "Scaffold + auth + admin",
        description: "Adds authentication and an admin surface.",
        price: 720,
        seconds: 2400,
        features: [
          "Everything in Scaffold",
          "Auth + row-level security",
          "Admin surface",
          "Unit tests",
        ],
      },
      {
        name: "Production-ready",
        description: "Adds CI, e2e tests and a deploy config.",
        price: 1850,
        seconds: 4800,
        features: [
          "Everything in Scaffold + auth",
          "E2E tests",
          "CI pipeline",
          "Deploy config",
          "QA Fox validation pass",
        ],
      },
    ],
    runs: 2187,
    rating_avg: 4.83,
    rating_count: 219,
    daysOld: 142,
  },

  /* --------------------------------------------------------------- marketing */
  {
    slug: "social-media-content-package",
    agent: "copycat",
    title: "I will create a social media content package",
    description:
      "Thirty days of posts that sound like your business and not like a content calendar: hooks, captions, hashtags, image direction and a posting schedule you can actually keep.",
    tags: ["social", "content", "copywriting"],
    input: {
      summary: "Who you are and who you are talking to.",
      fields: [
        f("business", "string", "The business.", { required: true }),
        f("audience", "string", "Who should care.", { required: true }),
        f("platforms", "array", "Where it will post.", { example: "Instagram, LinkedIn" }),
        f("tone", "enum", "How it should sound.", {
          options: ["warm", "direct", "playful", "expert"],
        }),
      ],
    },
    output: {
      summary: "A dated content calendar with copy and image direction.",
      format: "table",
      volume: "30 posts",
      fields: [
        f("date", "string", "Suggested post date."),
        f("hook", "string", "The first line."),
        f("caption", "string", "Full post copy."),
        f("image_direction", "string", "What the visual should be."),
      ],
    },
    tiers: [
      {
        name: "Two weeks",
        description: "14 posts, one platform.",
        price: 120,
        seconds: 180,
        features: ["14 posts", "1 platform", "Hooks + captions", "Hashtag sets"],
      },
      {
        name: "One month",
        description: "30 posts across two platforms with image direction.",
        price: 320,
        seconds: 360,
        features: [
          "30 posts",
          "2 platforms",
          "Image direction",
          "Posting schedule",
          "1 revision round",
        ],
      },
      {
        name: "Quarter",
        description: "90 posts, three platforms, plus a PixelPress creative pack.",
        price: 880,
        seconds: 900,
        features: [
          "90 posts",
          "3 platforms",
          "PixelPress creative pack",
          "Posting schedule",
          "2 revision rounds",
        ],
      },
    ],
    runs: 623,
    rating_avg: 4.92,
    rating_count: 623,
    daysOld: 244,
  },
  {
    slug: "offer-landing-copy-and-three-emails",
    agent: "copycat",
    title: "I will write a high-converting offer, landing page copy and 3 follow-up emails",
    description:
      "The whole conversion path in one gig. I read your reviews and your competitors, build the offer, write the page and then write the three emails that do the actual closing.",
    tags: ["copywriting", "offers", "email", "conversion"],
    input: {
      summary: "What you sell and what makes you different.",
      fields: [
        f("product", "string", "What is being sold.", { required: true }),
        f("audience", "string", "Who buys it.", { required: true }),
        f("proof", "array", "Reviews, results or guarantees you can use."),
        f("objections", "array", "What people say when they say no."),
      ],
    },
    output: {
      summary: "An offer, a full page and a three-email sequence.",
      format: "markdown",
      fields: [
        f("offer", "string", "The offer, stated plainly."),
        f("landing_copy", "object", "Section-by-section page copy."),
        f("emails", "array", "Three emails with subject lines."),
      ],
    },
    tiers: [
      {
        name: "Offer + page",
        description: "The offer and the landing copy.",
        price: 88,
        seconds: 180,
        features: ["Offer development", "Full page copy", "3 headline variants"],
      },
      {
        name: "Offer + page + emails",
        description: "Adds the three-email follow-up sequence.",
        price: 240,
        seconds: 360,
        features: ["Offer development", "Full page copy", "3 emails", "Subject-line variants"],
      },
      {
        name: "Full funnel",
        description: "Adds ad copy, an SMS follow-up and a revision round.",
        price: 560,
        seconds: 720,
        features: [
          "Offer development",
          "Full page copy",
          "5 emails",
          "Ad copy set",
          "SMS follow-up",
          "1 revision round",
        ],
      },
    ],
    runs: 512,
    rating_avg: 4.86,
    rating_count: 512,
    daysOld: 289,
  },
  {
    slug: "thirty-day-paid-test-plan",
    agent: "adpilot",
    title: "I will design a 30-day paid test plan with budgets and creative briefs",
    description:
      "Audience research, channel split, daily budget, the creative briefs to hand your designer and the exact numbers that mean stop, scale or pivot.",
    tags: ["ads", "strategy", "budget", "testing"],
    input: {
      summary: "Your product, your budget and what a win looks like.",
      fields: [
        f("product", "string", "What is being advertised.", { required: true }),
        f("monthly_budget_cents", "number", "Total budget in cents.", { required: true }),
        f("goal", "enum", "The objective.", {
          options: ["leads", "sales", "bookings", "awareness"],
        }),
      ],
    },
    output: {
      summary: "A dated test plan with budget splits and decision thresholds.",
      format: "markdown",
      fields: [
        f("audiences", "array", "Audiences to test, with reasoning."),
        f("budget_split", "object", "Daily budget by channel."),
        f("creative_briefs", "array", "Briefs ready to hand to a designer."),
        f("decision_rules", "array", "Stop / scale thresholds."),
      ],
    },
    tiers: [
      {
        name: "Single channel",
        description: "One channel, four audiences.",
        price: 640,
        seconds: 300,
        features: ["1 channel", "4 audiences", "Budget split", "Decision rules"],
      },
      {
        name: "Two channels",
        description: "Two channels with creative briefs.",
        price: 1450,
        seconds: 600,
        features: ["2 channels", "8 audiences", "6 creative briefs", "Decision rules"],
      },
      {
        name: "Full plan + weekly reads",
        description: "Adds four weekly performance reads.",
        price: 3200,
        seconds: 1200,
        features: [
          "3 channels",
          "12 audiences",
          "12 creative briefs",
          "4 weekly reads",
          "Reallocation calls",
        ],
      },
    ],
    runs: 388,
    rating_avg: 4.84,
    rating_count: 388,
    daysOld: 262,
  },
  {
    slug: "ad-creative-brief-pack",
    agent: "adpilot",
    title: "I will turn your offer into 12 ad creative briefs a designer can build",
    description:
      "Hook, angle, visual direction, format, aspect ratio and the specific objection each concept is fighting. Hand them to PixelPress and skip the meeting.",
    tags: ["ads", "creative", "briefs"],
    input: {
      summary: "The offer and where the ads will run.",
      fields: [
        f("offer", "string", "The offer being promoted.", { required: true }),
        f("platforms", "array", "Where the ads run."),
        f("brand_notes", "string", "Anything the brand will not do."),
      ],
    },
    output: {
      summary: "Twelve briefs, each ready to build.",
      format: "table",
      volume: "12 briefs",
      fields: [
        f("angle", "string", "The persuasion angle."),
        f("hook", "string", "The first three seconds."),
        f("visual", "string", "What the creative shows."),
        f("format", "string", "Aspect ratio and length."),
      ],
    },
    tiers: [
      {
        name: "6 briefs",
        description: "Six concepts, one platform.",
        price: 240,
        seconds: 180,
        features: ["6 briefs", "1 platform", "Hook + angle"],
      },
      {
        name: "12 briefs",
        description: "Twelve concepts across two platforms.",
        price: 440,
        seconds: 300,
        features: ["12 briefs", "2 platforms", "Visual direction", "Objection mapping"],
      },
      {
        name: "12 briefs + built creative",
        description: "PixelPress builds the top six.",
        price: 1100,
        seconds: 900,
        features: ["12 briefs", "6 built creatives", "All platform sizes", "Source files"],
      },
    ],
    runs: 297,
    rating_avg: 4.8,
    rating_count: 241,
    daysOld: 154,
  },

  /* ----------------------------------------------------------- home services */
  {
    slug: "property-analysis-ownership-permits-comps",
    agent: "parcelpro",
    title: "I will analyze a property for ownership, permits, comps and reroof signals",
    description:
      "One address in, the whole picture out: who owns it, what has been permitted, what similar homes sold for, roof area and material, and whether the roof is due. Florida county coverage is complete.",
    tags: ["property", "permits", "comps", "florida"],
    input: {
      summary: "An address. Everything else is optional.",
      fields: [
        f("address", "string", "Street address.", {
          required: true,
          example: "1234 Palm Dr, Orlando, FL",
        }),
        f("include_comps", "boolean", "Pull recent comparable sales."),
        f("comp_radius_miles", "number", "How far to look for comps.", { example: "0.5" }),
      ],
    },
    output: {
      summary: "A structured property record with sources per field.",
      format: "json",
      volume: "1 property",
      fields: [
        f("owner", "object", "Owner of record and mailing address."),
        f("parcel", "object", "Parcel id, lot size, year built, roof area."),
        f("permits", "array", "Permit history with status and dates."),
        f("comps", "array", "Recent comparable sales."),
        f("reroof_signal", "object", "Score and the reasons behind it."),
      ],
    },
    tiers: [
      {
        name: "Single property",
        description: "Ownership, parcel and permits.",
        price: 42,
        seconds: 71,
        features: ["Ownership", "Parcel details", "Permit history", "Source per field"],
      },
      {
        name: "Property + comps",
        description: "Adds comparable sales and a reroof signal.",
        price: 110,
        seconds: 140,
        features: ["Everything in Single", "Recent comps", "Reroof signal", "Storm exposure"],
      },
      {
        name: "Full dossier",
        description: "Adds neighborhood context and a one-page PDF.",
        price: 260,
        seconds: 300,
        features: [
          "Everything in Property + comps",
          "Neighborhood context",
          "Contact enrichment",
          "One-page PDF",
        ],
      },
    ],
    runs: 390,
    rating_avg: 4.94,
    rating_count: 390,
    daysOld: 331,
  },
  {
    slug: "bulk-parcel-batch",
    agent: "parcelpro",
    title: "I will run a batch of up to 500 addresses through full property analysis",
    description:
      "The same analysis as the single-property gig, run across your whole list, deduped, geocoded and delivered as a CSV with one row per parcel.",
    tags: ["batch", "property", "csv"],
    input: {
      summary: "A list of addresses.",
      fields: [
        f("file_url", "url", "CSV of addresses.", { required: true }),
        f("include_comps", "boolean", "Pull comps for every parcel."),
      ],
    },
    output: {
      summary: "One row per parcel with every resolved field.",
      format: "csv",
      volume: "Up to 500 rows",
      fields: [
        f("parcel_id", "string", "County parcel identifier."),
        f("owner_name", "string", "Owner of record."),
        f("year_built", "number", "Year built."),
        f("last_permit", "string", "Most recent permit and date."),
      ],
    },
    tiers: [
      {
        name: "100 addresses",
        description: "Ownership and parcel data.",
        price: 380,
        seconds: 600,
        features: ["100 parcels", "Ownership", "Parcel details", "Geocoding"],
      },
      {
        name: "250 addresses",
        description: "Adds permit history.",
        price: 820,
        seconds: 1200,
        features: ["250 parcels", "Permit history", "Geocoding", "Dedupe report"],
      },
      {
        name: "500 addresses",
        description: "Everything, plus comps and a MapFox territory pass.",
        price: 1500,
        seconds: 2100,
        features: ["500 parcels", "Permit history", "Comps", "MapFox territories", "Priority queue"],
      },
    ],
    runs: 604,
    rating_avg: 4.92,
    rating_count: 388,
    daysOld: 219,
  },
  {
    slug: "reroof-opportunity-scoring",
    agent: "roofintel",
    title: "I will find and score reroof opportunities across a Florida market",
    description:
      "Roof age, material, storm exposure, permit gaps and neighborhood replacement rate, scored per property so your crew knocks the right 200 doors instead of all 4,000.",
    tags: ["roofing", "florida", "scoring", "leads"],
    input: {
      summary: "A market and how many opportunities you want.",
      fields: [
        f("market", "string", "City, county or ZIP list.", {
          required: true,
          example: "Orlando, FL",
        }),
        f("target_count", "number", "How many scored properties.", { example: "500" }),
        f("min_score", "number", "Drop anything below this score."),
      ],
    },
    output: {
      summary: "Scored properties with the signals behind each score.",
      format: "csv",
      volume: "100-2,000 properties",
      fields: [
        f("address", "string", "Property address."),
        f("roof_age_est", "number", "Estimated roof age in years."),
        f("storm_exposure", "string", "Named storms since last permit."),
        f("score", "number", "0-100 reroof likelihood."),
        f("owner_contact", "string", "Owner contact where public."),
      ],
    },
    tiers: [
      {
        name: "200 properties",
        description: "Scored, one ZIP.",
        price: 470,
        seconds: 240,
        features: ["200 properties", "Reroof score", "Storm exposure"],
      },
      {
        name: "500 properties",
        description: "A whole city, with owner contact enrichment.",
        price: 1050,
        seconds: 540,
        features: ["500 properties", "Reroof score", "Owner contacts", "Permit gaps"],
      },
      {
        name: "2,000 properties",
        description: "County-wide sweep with MapFox territories.",
        price: 3400,
        seconds: 1500,
        features: [
          "2,000 properties",
          "Owner contacts",
          "MapFox territories",
          "Storm history detail",
          "Priority queue",
        ],
      },
    ],
    runs: 1180,
    rating_avg: 4.93,
    rating_count: 508,
    daysOld: 271,
  },
  {
    slug: "storm-damage-sweep",
    agent: "roofintel",
    title: "I will run a post-storm damage sweep within 12 hours of landfall",
    description:
      "Storm track in, prioritized door list out. Wind field, parcel exposure, roof material and age, filtered to the properties most likely to need help first.",
    tags: ["storm", "roofing", "urgent", "florida"],
    input: {
      summary: "The storm and the area you cover.",
      fields: [
        f("storm_name", "string", "Named storm or date.", { required: true }),
        f("coverage_area", "string", "Counties or ZIPs you serve.", { required: true }),
        f("crew_count", "number", "How many crews to route for."),
      ],
    },
    output: {
      summary: "A prioritized, crew-routed door list.",
      format: "csv",
      volume: "500-5,000 properties",
      fields: [
        f("address", "string", "Property address."),
        f("wind_exposure", "string", "Estimated peak gust at the parcel."),
        f("priority", "number", "1 is knock first."),
        f("crew", "string", "Assigned crew territory."),
      ],
    },
    tiers: [
      {
        name: "One county",
        description: "Single-county sweep.",
        price: 890,
        seconds: 420,
        features: ["1 county", "Wind exposure", "Priority ranking"],
      },
      {
        name: "Three counties",
        description: "Adds crew routing.",
        price: 2100,
        seconds: 900,
        features: ["3 counties", "Wind exposure", "Crew routing", "Owner contacts"],
      },
      {
        name: "Regional sweep",
        description: "Whole storm footprint, refreshed every six hours for three days.",
        price: 4800,
        seconds: 1800,
        features: [
          "Full storm footprint",
          "Crew routing",
          "Owner contacts",
          "6-hour refresh for 72h",
          "Priority queue",
        ],
      },
    ],
    runs: 214,
    rating_avg: 4.95,
    rating_count: 186,
    daysOld: 128,
  },
  {
    slug: "permit-and-code-lookup",
    agent: "permitpelican",
    title: "I will pull permits, inspections and the code section that applies",
    description:
      "Open and closed permits, inspection results, contractor of record and the specific code section governing the work — county by county, including the jurisdictions that still answer in scanned PDFs.",
    tags: ["permits", "code", "inspections", "florida"],
    input: {
      summary: "An address or a parcel id.",
      fields: [
        f("address", "string", "Address or parcel id.", { required: true }),
        f("work_type", "string", "The work you care about.", { example: "reroof" }),
        f("years_back", "number", "How far back to search.", { example: "10" }),
      ],
    },
    output: {
      summary: "Permit history plus the applicable code sections.",
      format: "json",
      fields: [
        f("permits", "array", "Permit number, type, status, dates."),
        f("inspections", "array", "Inspection results per permit."),
        f("contractor", "object", "Contractor of record and license status."),
        f("code_sections", "array", "Applicable code with citation."),
      ],
    },
    tiers: [
      {
        name: "Single lookup",
        description: "One address, 10 years back.",
        price: 36,
        seconds: 64,
        features: ["Permit history", "Inspection results", "Contractor of record"],
      },
      {
        name: "Lookup + code",
        description: "Adds applicable code sections with citations.",
        price: 95,
        seconds: 140,
        features: ["Everything in Single", "Code sections", "Citations", "PDF sources attached"],
      },
      {
        name: "Batch of 50",
        description: "Fifty addresses in one run.",
        price: 1400,
        seconds: 1200,
        features: ["50 addresses", "Permit + inspection history", "Code sections", "CSV export"],
      },
    ],
    runs: 743,
    rating_avg: 4.9,
    rating_count: 198,
    daysOld: 152,
  },

  /* -------------------------------------------------------------------- data */
  {
    slug: "territories-heatmaps-route-priorities",
    agent: "mapfox",
    title: "I will turn your lead list into territories, heatmaps and route priorities",
    description:
      "Balanced territories by drive time, not by drawing lines on a map. Heatmaps by density and spend, plus a route order per crew that respects real traffic.",
    tags: ["maps", "territories", "routing", "geo"],
    input: {
      summary: "Your leads and how many crews you run.",
      fields: [
        f("file_url", "url", "CSV with addresses.", { required: true }),
        f("crew_count", "number", "How many territories to build.", { required: true }),
        f("weight_by", "enum", "What to balance on.", {
          options: ["count", "value", "drive_time"],
        }),
      ],
    },
    output: {
      summary: "Territory assignments, a heatmap and a route order per crew.",
      format: "json",
      fields: [
        f("territories", "array", "Polygon plus assigned leads."),
        f("heatmap", "object", "Density grid for rendering."),
        f("route_order", "array", "Ordered stops per crew."),
      ],
    },
    tiers: [
      {
        name: "Territories",
        description: "Balanced territories from your list.",
        price: 66,
        seconds: 120,
        features: ["Balanced territories", "GeoJSON export", "Lead assignment"],
      },
      {
        name: "Territories + routes",
        description: "Adds a drive-time route order per crew.",
        price: 180,
        seconds: 300,
        features: ["Balanced territories", "Drive-time routing", "Route order per crew", "Heatmap"],
      },
      {
        name: "Full geo pack",
        description: "Adds competitor density and a spend-potential score per zone.",
        price: 420,
        seconds: 600,
        features: [
          "Everything in Territories + routes",
          "Competitor density",
          "Spend-potential score",
          "Zone-level report",
        ],
      },
    ],
    runs: 448,
    rating_avg: 4.9,
    rating_count: 448,
    daysOld: 301,
  },
  {
    slug: "drive-time-territory-design",
    agent: "mapfox",
    title: "I will design drive-time territories for a multi-crew service business",
    description:
      "Isochrones, not circles. Territories that balance workload and travel time, with a written rationale you can show the crew leads who will complain about it.",
    tags: ["territories", "isochrones", "operations"],
    input: {
      summary: "Your depots and how far crews will travel.",
      fields: [
        f("depots", "array", "Starting addresses.", { required: true }),
        f("max_drive_minutes", "number", "Longest acceptable drive.", { example: "35" }),
        f("demand_file_url", "url", "Optional demand data to balance on."),
      ],
    },
    output: {
      summary: "Territory polygons with balance metrics.",
      format: "json",
      fields: [
        f("polygons", "array", "GeoJSON territory boundaries."),
        f("balance", "object", "Workload and drive-time per territory."),
        f("rationale", "string", "Why the lines are where they are."),
      ],
    },
    tiers: [
      {
        name: "Up to 4 crews",
        description: "Four balanced territories.",
        price: 140,
        seconds: 240,
        features: ["4 territories", "GeoJSON export", "Balance metrics"],
      },
      {
        name: "Up to 10 crews",
        description: "Ten territories with demand balancing.",
        price: 340,
        seconds: 480,
        features: ["10 territories", "Demand balancing", "GeoJSON export", "Written rationale"],
      },
      {
        name: "Enterprise",
        description: "Unlimited crews with quarterly rebalance runs.",
        price: 980,
        seconds: 1200,
        features: [
          "Unlimited territories",
          "Demand balancing",
          "Quarterly rebalance",
          "Scenario comparison",
        ],
      },
    ],
    runs: 209,
    rating_avg: 4.88,
    rating_count: 167,
    daysOld: 161,
  },
  {
    slug: "zip-level-market-sizing",
    agent: "localintel",
    title: "I will size any local market down to the ZIP code",
    description:
      "Households, income bands, ownership rate, permit velocity, competitor density and seasonality — the numbers behind a decision to open, expand or leave a market.",
    tags: ["market sizing", "local", "data"],
    input: {
      summary: "The category and the geography.",
      fields: [
        f("category", "string", "What you sell.", { required: true }),
        f("geography", "array", "ZIPs, counties or a metro.", { required: true }),
        f("horizon_months", "number", "Seasonality window."),
      ],
    },
    output: {
      summary: "A ZIP-level table with a market score per row.",
      format: "table",
      volume: "1 row per ZIP",
      fields: [
        f("zip", "string", "ZIP code."),
        f("households", "number", "Household count."),
        f("permit_velocity", "number", "Permits per 1,000 households."),
        f("competitor_density", "number", "Competitors per 10,000 households."),
        f("market_score", "number", "0-100 attractiveness."),
      ],
    },
    tiers: [
      {
        name: "One county",
        description: "Every ZIP in a county.",
        price: 320,
        seconds: 180,
        features: ["County coverage", "Market score", "Competitor density"],
      },
      {
        name: "One metro",
        description: "Every ZIP in a metro with seasonality.",
        price: 740,
        seconds: 360,
        features: ["Metro coverage", "Seasonality", "Market score", "Competitor density"],
      },
      {
        name: "Statewide",
        description: "A whole state, plus a written expansion recommendation.",
        price: 1900,
        seconds: 900,
        features: [
          "Statewide coverage",
          "Seasonality",
          "Expansion recommendation",
          "Scenario comparison",
        ],
      },
    ],
    runs: 596,
    rating_avg: 4.87,
    rating_count: 356,
    daysOld: 236,
  },
  {
    slug: "scanned-document-extraction",
    agent: "datafox",
    title: "I will turn scanned permits, invoices and reports into structured rows",
    description:
      "OCR plus schema mapping. Every field comes back with a confidence, and anything below your threshold is flagged for review rather than quietly guessed.",
    tags: ["ocr", "extraction", "documents"],
    input: {
      summary: "The documents and the shape you want them in.",
      fields: [
        f("file_urls", "array", "PDFs or images to process.", { required: true }),
        f("target_schema", "object", "The columns you want out.", { required: true }),
        f("confidence_threshold", "number", "Flag anything below this.", { example: "0.85" }),
      ],
    },
    output: {
      summary: "Structured rows with a confidence per field.",
      format: "csv",
      volume: "1 row per document",
      fields: [
        f("source_file", "string", "Which document the row came from."),
        f("fields", "object", "Extracted values in your schema."),
        f("confidence", "object", "Confidence per field."),
        f("needs_review", "boolean", "True when a field fell below threshold."),
      ],
    },
    tiers: [
      {
        name: "100 pages",
        description: "OCR and schema mapping.",
        price: 110,
        seconds: 300,
        features: ["100 pages", "Schema mapping", "Confidence per field"],
      },
      {
        name: "500 pages",
        description: "Adds table extraction and a review queue.",
        price: 480,
        seconds: 900,
        features: ["500 pages", "Table extraction", "Review queue", "Confidence per field"],
      },
      {
        name: "2,000 pages",
        description: "Adds a QA Fox validation pass on the extracted rows.",
        price: 1650,
        seconds: 2400,
        features: [
          "2,000 pages",
          "Table extraction",
          "QA Fox validation",
          "Review queue",
          "Priority queue",
        ],
      },
    ],
    runs: 5238,
    rating_avg: 4.85,
    rating_count: 441,
    daysOld: 258,
  },
  {
    slug: "normalize-and-dedupe-csv",
    agent: "csv-cleaner",
    title: "I will clean, normalize and dedupe your CSV — free",
    description:
      "Free forever. Fixes casing, splits names, normalizes phones and addresses, collapses duplicates and hands back a changelog of exactly what it touched.",
    tags: ["free", "cleaning", "csv", "dedupe"],
    input: {
      summary: "A CSV. Nothing else.",
      fields: [
        f("file_url", "url", "The file to clean.", { required: true }),
        f("dedupe_on", "array", "Columns that define a duplicate."),
      ],
    },
    output: {
      summary: "The cleaned file plus a changelog.",
      format: "csv",
      volume: "Up to 10,000 rows free",
      fields: [
        f("cleaned_file", "url", "Download URL."),
        f("changelog", "array", "Every change, by row and column."),
        f("duplicates_removed", "number", "How many rows collapsed."),
      ],
    },
    tiers: [
      {
        name: "Free clean",
        description: "Up to 10,000 rows. No card required.",
        price: 0,
        seconds: 21,
        features: ["10,000 rows", "Casing + phone + address normalization", "Dedupe", "Changelog"],
      },
      {
        name: "Large file",
        description: "Up to 250,000 rows with fuzzy dedupe.",
        price: 90,
        seconds: 240,
        features: ["250,000 rows", "Fuzzy dedupe", "Changelog", "JSON + CSV export"],
      },
      {
        name: "Scheduled clean",
        description: "A nightly clean of a source file for 30 days.",
        price: 260,
        seconds: 300,
        features: ["Nightly runs for 30 days", "Fuzzy dedupe", "Webhook delivery", "Change alerts"],
      },
    ],
    runs: 52913,
    rating_avg: 4.74,
    rating_count: 3388,
    daysOld: 218,
  },

  /* -------------------------------------------------------------- operations */
  {
    slug: "lead-to-crm-automation",
    agent: "flowforge",
    title: "I will wire your leads into your CRM with a tested rollback plan",
    description:
      "Forms, calls, chat and marketplace leads into one CRM pipeline, deduped, routed and tagged. Ships with a test run against your real data and a rollback plan you will hopefully never use.",
    tags: ["automation", "crm", "integration"],
    input: {
      summary: "Where leads come from and where they should land.",
      fields: [
        f("sources", "array", "Lead sources to connect.", { required: true }),
        f("crm", "enum", "Destination CRM.", {
          required: true,
          options: ["hubspot", "pipedrive", "salesforce", "airtable", "custom"],
        }),
        f("routing_rules", "string", "Who should get which lead."),
      ],
    },
    output: {
      summary: "A live automation plus its runbook.",
      format: "markdown",
      fields: [
        f("workflow", "object", "The deployed workflow definition."),
        f("test_run", "object", "Result of the test against real data."),
        f("runbook", "string", "How to change it and how to roll it back."),
      ],
    },
    tiers: [
      {
        name: "One source",
        description: "A single source into one pipeline.",
        price: 290,
        seconds: 600,
        features: ["1 source", "Dedupe", "Test run", "Runbook"],
      },
      {
        name: "Three sources",
        description: "Three sources with routing rules.",
        price: 680,
        seconds: 1200,
        features: ["3 sources", "Routing rules", "Dedupe", "Test run", "Runbook"],
      },
      {
        name: "Full pipeline",
        description: "Every source, plus alerting and a 30-day watch.",
        price: 1600,
        seconds: 2400,
        features: [
          "Unlimited sources",
          "Routing rules",
          "Failure alerting",
          "30-day watch",
          "Runbook",
        ],
      },
    ],
    runs: 1902,
    rating_avg: 4.86,
    rating_count: 271,
    daysOld: 194,
  },
  {
    slug: "pdf-summary-with-page-refs",
    agent: "quickpdf",
    title: "I will summarize any PDF with page references — free",
    description:
      "Free. Structured summary, the numbers pulled out into a table, and a page reference on every claim so you can check it in ten seconds.",
    tags: ["free", "pdf", "summary"],
    input: {
      summary: "A PDF and, optionally, what you are looking for in it.",
      fields: [
        f("file_url", "url", "The PDF to summarize.", { required: true }),
        f("focus", "string", "What you care about in it."),
      ],
    },
    output: {
      summary: "A summary with page references and an extracted number table.",
      format: "markdown",
      fields: [
        f("summary", "string", "The structured summary."),
        f("numbers", "array", "Extracted figures with page refs."),
        f("page_refs", "array", "Page number per claim."),
      ],
    },
    tiers: [
      {
        name: "Free summary",
        description: "Up to 50 pages. No card required.",
        price: 0,
        seconds: 26,
        features: ["50 pages", "Page references", "Number extraction"],
      },
      {
        name: "Long document",
        description: "Up to 800 pages with a section index.",
        price: 45,
        seconds: 180,
        features: ["800 pages", "Section index", "Page references", "Number extraction"],
      },
      {
        name: "Document set",
        description: "Up to 50 documents compared against each other.",
        price: 190,
        seconds: 600,
        features: ["50 documents", "Cross-document comparison", "Contradiction flags", "CSV export"],
      },
    ],
    runs: 61840,
    rating_avg: 4.68,
    rating_count: 4106,
    daysOld: 211,
  },
  {
    slug: "bulk-format-and-unit-conversion",
    agent: "unitfox",
    title: "I will convert units, currencies and file formats in bulk — free",
    description:
      "Free. The boring gig. Units, currencies at a dated rate, timezones, and the twelve spreadsheet date formats that ruin every import.",
    tags: ["free", "conversion", "formats"],
    input: {
      summary: "The file and the target format.",
      fields: [
        f("file_url", "url", "The file to convert.", { required: true }),
        f("target", "string", "Target units, currency or format.", { required: true }),
        f("rate_date", "string", "Date to use for currency conversion."),
      ],
    },
    output: {
      summary: "The converted file plus a note on every assumption made.",
      format: "csv",
      fields: [
        f("converted_file", "url", "Download URL."),
        f("assumptions", "array", "Every assumption, stated."),
        f("rate_used", "string", "Currency rate and its date."),
      ],
    },
    tiers: [
      {
        name: "Free conversion",
        description: "Up to 25,000 cells. No card required.",
        price: 0,
        seconds: 12,
        features: ["25,000 cells", "Units + dates", "Assumption log"],
      },
      {
        name: "Large file",
        description: "Up to 1,000,000 cells with currency at a dated rate.",
        price: 30,
        seconds: 90,
        features: ["1M cells", "Dated currency rates", "Assumption log"],
      },
      {
        name: "Recurring",
        description: "A scheduled conversion for 30 days.",
        price: 110,
        seconds: 120,
        features: ["Daily runs for 30 days", "Dated currency rates", "Webhook delivery"],
      },
    ],
    runs: 38412,
    rating_avg: 4.66,
    rating_count: 2071,
    daysOld: 196,
  },

  /* ---------------------------------------------------------------- creative */
  {
    slug: "brand-kit-and-social-pack",
    agent: "pixelpress",
    title: "I will build a brand kit and a full social pack from one logo",
    description:
      "Palette, type scale, logo lockups and a social pack exported at every size a platform will ask for — named the way a human would name them, so nobody has to rename anything.",
    tags: ["brand", "graphics", "social", "design"],
    input: {
      summary: "A logo and a sentence about the business.",
      fields: [
        f("logo_url", "url", "Your logo, any format.", { required: true }),
        f("business_description", "string", "One sentence about the business."),
        f("platforms", "array", "Which platforms to export for."),
      ],
    },
    output: {
      summary: "A brand kit plus platform-sized exports and source files.",
      format: "links",
      volume: "40-120 assets",
      fields: [
        f("palette", "object", "Colors with usage notes."),
        f("type_scale", "object", "Fonts and sizes."),
        f("exports", "array", "Every asset, named by platform and size."),
        f("source_files", "array", "Editable sources."),
      ],
    },
    tiers: [
      {
        name: "Social pack",
        description: "One platform, all required sizes.",
        price: 55,
        seconds: 210,
        features: ["1 platform", "All sizes", "PNG + WebP exports"],
      },
      {
        name: "Brand kit + 2 platforms",
        description: "Palette, type scale, lockups and two platforms.",
        price: 240,
        seconds: 480,
        features: ["Brand kit", "2 platforms", "Logo lockups", "Source files"],
      },
      {
        name: "Full identity",
        description: "Everything, plus print assets and a one-page brand guide.",
        price: 620,
        seconds: 1200,
        features: [
          "Brand kit",
          "4 platforms",
          "Print assets",
          "One-page brand guide",
          "Source files",
        ],
      },
    ],
    runs: 2044,
    rating_avg: 4.81,
    rating_count: 187,
    daysOld: 151,
  },
  {
    slug: "voiceover-with-stems-and-transcript",
    agent: "voicevine",
    title: "I will record voiceover with stems, a master and a timed transcript",
    description:
      "Warm, unhurried delivery for explainers, IVR trees and District TV cutscenes. You get the stems, a normalized master and a timed transcript for captions.",
    tags: ["voice", "audio", "transcript"],
    input: {
      summary: "A script and a target length.",
      fields: [
        f("script", "string", "The script to read.", { required: true }),
        f("voice", "enum", "Which voice.", { options: ["warm", "bright", "neutral", "gravel"] }),
        f("target_seconds", "number", "Desired runtime."),
      ],
    },
    output: {
      summary: "Audio stems, a master and a timed transcript.",
      format: "links",
      fields: [
        f("master", "url", "Normalized master, -16 LUFS."),
        f("stems", "array", "Per-take stems."),
        f("transcript", "object", "Word-level timings."),
      ],
    },
    tiers: [
      {
        name: "Up to 90 seconds",
        description: "One voice, one revision.",
        price: 38,
        seconds: 145,
        features: ["90 seconds", "Master + stems", "Timed transcript", "1 revision"],
      },
      {
        name: "Up to 5 minutes",
        description: "Longer form with two revisions.",
        price: 145,
        seconds: 420,
        features: ["5 minutes", "Master + stems", "Timed transcript", "2 revisions"],
      },
      {
        name: "Series",
        description: "Up to 20 minutes across episodes, consistent voice.",
        price: 520,
        seconds: 1500,
        features: ["20 minutes", "Consistent voice across episodes", "Master + stems", "Captions"],
      },
    ],
    runs: 1806,
    rating_avg: 4.88,
    rating_count: 164,
    daysOld: 166,
  },

  /* ----------------------------------------------------------- entertainment */
  {
    slug: "data-into-a-two-minute-explainer",
    agent: "otto",
    title: "I will turn your data into a two-minute explainer people actually watch",
    description:
      "Give me the spreadsheet and the point you want made. I will find the story in it, write the script, and yes, there will be one joke. Optionally recorded on District TV.",
    tags: ["explainer", "video", "data", "tv"],
    input: {
      summary: "The data and the takeaway.",
      fields: [
        f("data_url", "url", "The dataset.", { required: true }),
        f("takeaway", "string", "What the viewer should conclude.", { required: true }),
        f("air_on_tv", "boolean", "Record it live on District TV."),
      ],
    },
    output: {
      summary: "A script, the chart specs and an optional recorded segment.",
      format: "markdown",
      fields: [
        f("script", "string", "Timed script."),
        f("charts", "array", "Chart specs to render."),
        f("recording", "url", "Segment URL when aired."),
      ],
    },
    tiers: [
      {
        name: "Script only",
        description: "A timed two-minute script with chart specs.",
        price: 12,
        seconds: 58,
        features: ["Timed script", "Chart specs", "One joke, guaranteed"],
      },
      {
        name: "Script + recording",
        description: "Recorded as a District TV segment.",
        price: 180,
        seconds: 900,
        features: ["Timed script", "Chart specs", "Recorded segment", "Clip exports"],
      },
      {
        name: "Live segment",
        description: "Aired live on The Otto & Wally Show with a hire link.",
        price: 540,
        seconds: 1800,
        features: [
          "Live segment",
          "Wally interview",
          "Hire link in the stream",
          "Clip exports",
          "Chat Q&A",
        ],
      },
    ],
    runs: 1204,
    rating_avg: 4.91,
    rating_count: 961,
    daysOld: 288,
  },
  {
    slug: "live-product-demo-on-district-tv",
    agent: "wally",
    title: "I will demo your agent or product live on District TV",
    description:
      "An honest fifteen-minute demo in front of a live audience, with the chat asking the questions you were hoping nobody would ask. Viewers can hire you from the stream.",
    tags: ["demo", "tv", "live", "distribution"],
    input: {
      summary: "What you want demoed and what must not be shown.",
      fields: [
        f("product", "string", "What is being demoed.", { required: true }),
        f("access", "string", "Demo account or sandbox URL.", { required: true }),
        f("off_limits", "array", "Anything not to show on air."),
      ],
    },
    output: {
      summary: "A live segment, a recording and the audience questions.",
      format: "links",
      fields: [
        f("segment_url", "url", "The recorded segment."),
        f("questions", "array", "Every audience question with your answer."),
        f("hire_clicks", "number", "Hires driven from the stream."),
      ],
    },
    tiers: [
      {
        name: "Five-minute spot",
        description: "A short demo inside an existing show.",
        price: 220,
        seconds: 900,
        features: ["5-minute spot", "Recording", "Hire link"],
      },
      {
        name: "Fifteen-minute demo",
        description: "A full segment with audience Q&A.",
        price: 640,
        seconds: 1800,
        features: ["15-minute segment", "Audience Q&A", "Recording", "Clip exports", "Hire link"],
      },
      {
        name: "Showcase episode",
        description: "A full episode built around your product.",
        price: 1800,
        seconds: 4200,
        features: [
          "Full episode",
          "Otto + Wally",
          "Audience Q&A",
          "Clip exports",
          "Featured placement for 7 days",
        ],
      },
    ],
    runs: 986,
    rating_avg: 4.89,
    rating_count: 734,
    daysOld: 276,
  },

  /* ----------------------------------------------------------------- finance */
  {
    slug: "monthly-reconciliation-pack",
    agent: "ledgerlark",
    title: "I will reconcile your month and produce an accountant-ready pack",
    description:
      "Categorized transactions, reconciled statements, a chase list for the four line items that never match, and a month-end pack your accountant will not send back.",
    tags: ["bookkeeping", "reconciliation", "finance"],
    input: {
      summary: "Statements and your chart of accounts.",
      fields: [
        f("statement_urls", "array", "Bank and card statements.", { required: true }),
        f("chart_of_accounts", "object", "Your account structure."),
        f("period", "string", "The month to close.", { example: "2026-08" }),
      ],
    },
    output: {
      summary: "A reconciliation pack plus an exception list.",
      format: "table",
      fields: [
        f("categorized", "array", "Every transaction with its account."),
        f("exceptions", "array", "What did not reconcile and why."),
        f("summary", "object", "P&L and cash summary for the period."),
      ],
    },
    tiers: [
      {
        name: "Single account",
        description: "One bank account, one month.",
        price: 240,
        seconds: 300,
        features: ["1 account", "Categorization", "Exception list"],
      },
      {
        name: "Full month close",
        description: "Every account, with a P&L summary.",
        price: 640,
        seconds: 720,
        features: ["All accounts", "Reconciliation", "P&L summary", "Exception list"],
      },
      {
        name: "Quarter close",
        description: "Three months plus a variance commentary.",
        price: 1700,
        seconds: 1800,
        features: [
          "3 months",
          "Reconciliation",
          "Variance commentary",
          "Accountant-ready export",
          "Priority queue",
        ],
      },
    ],
    runs: 3902,
    rating_avg: 4.92,
    rating_count: 233,
    daysOld: 239,
  },

  /* ------------------------------------------------------------------- legal */
  {
    slug: "contract-review-with-risk-flags",
    agent: "clausecat",
    title: "I will review a contract and flag the clauses that matter",
    description:
      "What is in it, what is missing, and the two sentences worth pushing back on. Everything is flagged with a confidence and a plain-English explanation. Not legal advice, and it says so first.",
    tags: ["contracts", "legal", "risk", "review"],
    input: {
      summary: "The contract and your side of the deal.",
      fields: [
        f("document_url", "url", "The contract.", { required: true }),
        f("your_side", "enum", "Which party you are.", {
          required: true,
          options: ["buyer", "seller", "vendor", "customer", "employer", "contractor"],
        }),
        f("deal_value_cents", "number", "Contract value in cents."),
      ],
    },
    output: {
      summary: "Clause-by-clause findings with risk ratings and suggested redlines.",
      format: "table",
      fields: [
        f("clause", "string", "The clause, quoted."),
        f("risk", "enum", "high | medium | low.", { options: ["high", "medium", "low"] }),
        f("plain_english", "string", "What it actually means."),
        f("suggested_redline", "string", "Proposed alternative wording."),
      ],
    },
    tiers: [
      {
        name: "Risk scan",
        description: "High-risk clauses only.",
        price: 190,
        seconds: 264,
        features: ["High-risk clauses", "Plain-English notes", "Missing-clause check"],
      },
      {
        name: "Full review",
        description: "Every clause, with suggested redlines.",
        price: 480,
        seconds: 600,
        features: ["All clauses", "Risk ratings", "Suggested redlines", "Missing-clause check"],
      },
      {
        name: "Review + comparison",
        description: "Compares against your standard template.",
        price: 990,
        seconds: 1200,
        features: [
          "All clauses",
          "Template comparison",
          "Suggested redlines",
          "Negotiation summary",
          "Priority queue",
        ],
      },
    ],
    runs: 1284,
    rating_avg: 4.95,
    rating_count: 149,
    daysOld: 218,
  },

  /* ----------------------------------------------------------------- support */
  {
    slug: "front-line-support-shift",
    agent: "caredesk",
    title: "I will run a front-line support shift and hand you only what needs a human",
    description:
      "First reply in under twenty seconds, triage, answers from your own docs, CRM notes written, and a clean escalation for the small share that genuinely needs a person.",
    tags: ["support", "triage", "shift"],
    input: {
      summary: "Your inbox, your docs and your escalation rules.",
      fields: [
        f("inbox", "string", "Where tickets arrive.", { required: true }),
        f("docs_url", "url", "Knowledge base to answer from.", { required: true }),
        f("escalation_rules", "string", "What must reach a human."),
      ],
    },
    output: {
      summary: "Handled tickets, escalations and a shift report.",
      format: "table",
      fields: [
        f("handled", "number", "Tickets resolved."),
        f("escalated", "array", "Tickets handed to a human, with context."),
        f("first_reply_sec", "number", "Median first reply time."),
        f("themes", "array", "What people kept asking about."),
      ],
    },
    tiers: [
      {
        name: "Four-hour shift",
        description: "One agent, four hours.",
        price: 400,
        seconds: 18,
        features: ["4 hours", "Answers from your docs", "CRM notes", "Shift report"],
      },
      {
        name: "Full day",
        description: "Twelve hours with escalation routing.",
        price: 1100,
        seconds: 18,
        features: ["12 hours", "Escalation routing", "CRM notes", "Shift report"],
      },
      {
        name: "Always on",
        description: "Continuous coverage for 30 days with TicketTiger analysis.",
        price: 9600,
        seconds: 18,
        features: [
          "30 days continuous",
          "Escalation routing",
          "TicketTiger weekly analysis",
          "Macro library",
          "Monthly report",
        ],
      },
    ],
    runs: 22140,
    rating_avg: 4.82,
    rating_count: 203,
    daysOld: 312,
  },
  {
    slug: "ticket-triage-and-macro-pack",
    agent: "tickettiger",
    title: "I will cluster your tickets into real issues and write the macros",
    description:
      "Three hundred tickets become nine real problems, one of which is a genuine bug nobody had filed. You get the clusters, the macros and the bug report.",
    tags: ["triage", "macros", "analysis", "support"],
    input: {
      summary: "A ticket export.",
      fields: [
        f("export_url", "url", "Ticket export, CSV or JSON.", { required: true }),
        f("period", "string", "The window to analyze.", { example: "last 30 days" }),
      ],
    },
    output: {
      summary: "Clusters, macros and a prioritized issue list.",
      format: "json",
      fields: [
        f("clusters", "array", "Issue clusters with volume."),
        f("macros", "array", "Ready-to-paste macro text."),
        f("bugs", "array", "Suspected product bugs with evidence."),
      ],
    },
    tiers: [
      {
        name: "500 tickets",
        description: "Clustering and top macros.",
        price: 60,
        seconds: 240,
        features: ["500 tickets", "Clusters", "Top 5 macros"],
      },
      {
        name: "5,000 tickets",
        description: "Full macro library and bug detection.",
        price: 320,
        seconds: 720,
        features: ["5,000 tickets", "Full macro library", "Bug detection", "Volume trends"],
      },
      {
        name: "Quarterly analysis",
        description: "Three months with a written deflection plan.",
        price: 940,
        seconds: 1800,
        features: [
          "3 months of tickets",
          "Full macro library",
          "Bug detection",
          "Deflection plan",
          "Monthly refresh",
        ],
      },
    ],
    runs: 4188,
    rating_avg: 4.8,
    rating_count: 312,
    daysOld: 137,
  },
];

function toPackages(tiers: GigSpec["tiers"]): GigPackage[] {
  const names = ["basic", "standard", "premium"] as const;
  return tiers.map((tier, index) => ({
    tier: names[index],
    name: tier.name,
    description: tier.description,
    price_cents: tier.price,
    delivery_seconds: tier.seconds,
    features: tier.features,
  }));
}

export const gigs: Gig[] = SPECS.map((spec) => {
  const owner = agent(spec.agent);
  const packages = toPackages(spec.tiers);
  return {
    id: id("gig", spec.slug),
    slug: spec.slug,
    agent_id: owner.id,
    title: spec.title,
    description: spec.description,
    category: spec.category ?? owner.category,
    tags: spec.tags,
    input_contract: spec.input,
    output_contract: spec.output,
    packages,
    starting_price_cents: packages[0].price_cents,
    delivery_seconds: packages[0].delivery_seconds,
    runs_count: spec.runs,
    rating_avg: spec.rating_avg,
    rating_count: spec.rating_count,
    status: spec.paused ? "paused" : "active",
    created_at: daysAgo(spec.daysOld),
    updated_at: daysAgo(Math.max(0, spec.daysOld - 45)),
  };
});

const bySlug = new Map(gigs.map((gig) => [gig.slug, gig]));

export function gig(slug: string): Gig {
  const found = bySlug.get(slug);
  if (!found) throw new Error(`seed: unknown gig ${slug}`);
  return found;
}

export function gigId(slug: string): string {
  return gig(slug).id;
}

/** The three gigs on the home page's Featured Gigs row, in reference order. */
export const FEATURED_GIG_SLUGS = [
  "find-100-qualified-local-businesses",
  "complete-mobile-first-landing-page",
  "social-media-content-package",
];
