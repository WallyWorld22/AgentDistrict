import { isLeagueFighter } from "../data/league";
import type { Agent, AgentCategory, AgentStatus, PricingModel } from "../data/types";
import { daysAgo } from "./clock";
import { profileId } from "./profiles";
import { ROOM_FOR_CATEGORY } from "./rooms";
import { storeId } from "./stores";
import { id } from "./uuid";

/**
 * The District cast — 31 agents across all 11 categories (BUILD_SPEC §2 asks
 * for ≥ 24 and names the required roster), two of them the fictional Bot Brawl
 * fighters at the end of the list.
 *
 * The ten legacy agents (Scout, Otto, WebBuilder, ParcelPro, CopyCat, MapFox,
 * QA Fox, AdPilot, DeepResearch, CareDesk) carry their *exact* stats from
 * `docs/reference/legacy-demo/app.js` — price, rating, review count, status,
 * jobs completed, repeat-hire rate, reliability and average delivery. The
 * reference screenshot shows those numbers, so they must not drift.
 *
 * `endpoints.webhook` is deliberately absent on every seeded agent: the
 * `WebhookAdapter` in `lib/runtime` would otherwise POST to a real host from a
 * demo install. Demo runs always fall through to the SimulatedAdapter.
 *
 * **`rating_count` and `jobs_completed` are lifetime figures, not row counts.**
 * Scout shows `4.96 (1,842)` because that is what the reference screenshot
 * shows; the seed only carries a recent *sample* of reviews (48 rows across all
 * agents). Do not "fix" the mismatch by recomputing these columns from
 * `seed.reviews` — that would break the reference. The SQL function
 * `public.recalc_agent_rating()` exists for reviews written at runtime, and
 * running it against seed data will (correctly) collapse these numbers.
 * `gigs.runs_count` works the same way.
 */

type AgentSpec = {
  handle: string;
  name: string;
  emoji: string;
  gradient: string;
  tagline: string;
  description: string;
  category: AgentCategory;
  skills: string[];
  regions: string[];
  status: AgentStatus;
  room?: string;
  pricing_model: PricingModel;
  price: number;
  owner: string;
  store?: string;
  verified: boolean;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
  repeat_hire_rate: number;
  reliability: number;
  dispute_rate: number;
  avg_latency_sec: number;
  is_free?: boolean;
  daysOld: number;
};

const SPECS: AgentSpec[] = [
  /* ---------------------------------------------------------------- research */
  {
    handle: "scout",
    name: "Scout",
    emoji: "🔭",
    gradient: "linear-gradient(135deg,#1a86ff,#4ee7ff)",
    tagline: "Local business research",
    description:
      "Finds and qualifies local businesses anywhere in the US. Pulls names, owners, phones, emails, websites, service areas and review signal, then hands back a clean CSV you can dial straight from. Tuned hardest on Florida markets.",
    category: "research",
    skills: ["Lead research", "Enrichment", "Local data", "Verification"],
    regions: ["FL", "GA", "TX", "US"],
    status: "available",
    pricing_model: "per_run",
    price: 8,
    owner: "austin",
    store: "wallyworks-labs",
    verified: true,
    rating_avg: 4.96,
    rating_count: 1842,
    jobs_completed: 18422,
    repeat_hire_rate: 0.71,
    reliability: 0.998,
    dispute_rate: 0.002,
    avg_latency_sec: 42,
    daysOld: 398,
  },
  {
    handle: "deepresearch",
    name: "DeepResearch",
    emoji: "🧠",
    gradient: "linear-gradient(135deg,#7559ff,#df6cff)",
    tagline: "Long-form investigation",
    description:
      "Multi-hour investigations with citations you can actually check. Market maps, competitive teardowns, acquisition target lists and regulatory reads. Every claim carries a source and a confidence.",
    category: "research",
    skills: ["Deep research", "Citations", "Synthesis", "Market maps"],
    regions: ["US", "CA", "EU"],
    status: "available",
    pricing_model: "per_job",
    price: 311,
    owner: "agentmax",
    store: "northstar-agents",
    verified: true,
    rating_avg: 4.99,
    rating_count: 271,
    jobs_completed: 2804,
    repeat_hire_rate: 0.81,
    reliability: 0.997,
    dispute_rate: 0.001,
    avg_latency_sec: 840,
    daysOld: 331,
  },
  {
    handle: "researchotter",
    name: "ResearchOtter",
    emoji: "🦦",
    gradient: "linear-gradient(135deg,#2ec2ff,#46e39a)",
    tagline: "Verified-source research",
    description:
      "Fast research with a hard rule: nothing ships without two independent sources. Great for contact verification, permit lookups and anything a human is going to be embarrassed by if it is wrong.",
    category: "research",
    skills: ["Verification", "Source checking", "Contact research", "Summaries"],
    regions: ["FL", "US"],
    status: "working",
    pricing_model: "per_run",
    price: 15,
    owner: "agentmax",
    store: "northstar-agents",
    verified: true,
    rating_avg: 4.9,
    rating_count: 612,
    jobs_completed: 6120,
    repeat_hire_rate: 0.7,
    reliability: 0.994,
    dispute_rate: 0.003,
    avg_latency_sec: 96,
    daysOld: 274,
  },
  {
    handle: "newsbrief",
    name: "NewsBrief",
    emoji: "📰",
    gradient: "linear-gradient(135deg,#8e9ab2,#48a8ff)",
    tagline: "5-source topic brief",
    description:
      "Free. Give it a topic, get a five-source brief with dates, quotes and links in under a minute. The zero-friction way to try an AgentDistrict agent.",
    category: "research",
    skills: ["News monitoring", "Summaries", "Citations"],
    regions: ["US", "GLOBAL"],
    status: "available",
    pricing_model: "per_run",
    price: 0,
    owner: "austin",
    store: "wallyworks-labs",
    verified: true,
    rating_avg: 4.71,
    rating_count: 2914,
    jobs_completed: 41208,
    repeat_hire_rate: 0.44,
    reliability: 0.982,
    dispute_rate: 0.004,
    avg_latency_sec: 34,
    is_free: true,
    daysOld: 208,
  },

  /* ------------------------------------------------------------- development */
  {
    handle: "webbuilder",
    name: "WebBuilder",
    emoji: "🧩",
    gradient: "linear-gradient(135deg,#297dff,#7559ff)",
    tagline: "Sites, funnels & SEO",
    description:
      "Takes a business name and a URL and returns a complete mobile-first landing page: copy, sections, schema, meta, images and a deploy-ready bundle. Location pages by the dozen if you need them.",
    category: "development",
    skills: ["Landing pages", "Frontend", "SEO", "Schema markup"],
    regions: ["US", "GLOBAL"],
    status: "working",
    pricing_model: "from",
    price: 124,
    owner: "tampa-tess",
    store: "launch-foundry",
    verified: true,
    rating_avg: 4.88,
    rating_count: 624,
    jobs_completed: 9142,
    repeat_hire_rate: 0.68,
    reliability: 0.989,
    dispute_rate: 0.006,
    avg_latency_sec: 480,
    daysOld: 352,
  },
  {
    handle: "qa-fox",
    name: "QA Fox",
    emoji: "🦊",
    gradient: "linear-gradient(135deg,#ff8f4e,#ffd66b)",
    tagline: "Quality assurance specialist",
    description:
      "Runs your web app the way a hostile user would, then returns prioritized issues with reproduction steps, screenshots and a severity call. Also validates other agents' output before you pay for it.",
    category: "development",
    skills: ["QA", "Regression", "Validation", "Accessibility"],
    regions: ["US", "GLOBAL"],
    status: "available",
    pricing_model: "per_run",
    price: 21,
    owner: "agentmax",
    store: "northstar-agents",
    verified: true,
    rating_avg: 4.97,
    rating_count: 715,
    jobs_completed: 11218,
    repeat_hire_rate: 0.78,
    reliability: 0.999,
    dispute_rate: 0.001,
    avg_latency_sec: 55,
    daysOld: 344,
  },
  {
    handle: "sitesprint",
    name: "SiteSprint",
    emoji: "⚡",
    gradient: "linear-gradient(135deg,#4ee7ff,#297dff)",
    tagline: "Fast static site builds",
    description:
      "Cheap and quick. Static sites, microsites and one-page launches with basic on-page SEO. Not the deepest build in the District, but nothing beats it on turnaround.",
    category: "development",
    skills: ["Static sites", "Microsites", "Basic SEO", "Deploys"],
    regions: ["US"],
    status: "available",
    pricing_model: "from",
    price: 86,
    owner: "tampa-tess",
    store: "launch-foundry",
    verified: true,
    rating_avg: 4.79,
    rating_count: 298,
    jobs_completed: 3411,
    repeat_hire_rate: 0.58,
    reliability: 0.981,
    dispute_rate: 0.009,
    avg_latency_sec: 1920,
    daysOld: 176,
  },
  {
    handle: "builderbot",
    name: "BuilderBot",
    emoji: "🛠️",
    gradient: "linear-gradient(135deg,#8e5cff,#48a8ff)",
    tagline: "Full-stack app scaffolds",
    description:
      "Scaffolds real applications: schema, auth, API routes, admin, tests and a deploy config. Give it a spec paragraph, get a repo you can actually run.",
    category: "development",
    skills: ["Full-stack", "Database design", "APIs", "Tests"],
    regions: ["US", "GLOBAL"],
    status: "hiring",
    pricing_model: "from",
    price: 240,
    owner: "devdan",
    verified: true,
    rating_avg: 4.83,
    rating_count: 219,
    jobs_completed: 2187,
    repeat_hire_rate: 0.72,
    reliability: 0.986,
    dispute_rate: 0.007,
    avg_latency_sec: 1140,
    daysOld: 149,
  },

  /* --------------------------------------------------------------- marketing */
  {
    handle: "copycat",
    name: "CopyCat",
    emoji: "✍️",
    gradient: "linear-gradient(135deg,#df6cff,#7559ff)",
    tagline: "Conversion copywriting",
    description:
      "Offers, landing copy, email sequences and ad variations that sound like a person wrote them. Reads your reviews and your competitors before it writes a word.",
    category: "marketing",
    skills: ["Landing copy", "Email", "Offers", "Ad copy"],
    regions: ["US", "GLOBAL"],
    status: "collaborating",
    room: "creator-loft",
    pricing_model: "per_run",
    price: 27,
    owner: "tampa-tess",
    store: "launch-foundry",
    verified: true,
    rating_avg: 4.86,
    rating_count: 512,
    jobs_completed: 7284,
    repeat_hire_rate: 0.69,
    reliability: 0.991,
    dispute_rate: 0.005,
    avg_latency_sec: 90,
    daysOld: 349,
  },
  {
    handle: "adpilot",
    name: "AdPilot",
    emoji: "📣",
    gradient: "linear-gradient(135deg,#ff5b6f,#ffd66b)",
    tagline: "Campaign strategy agent",
    description:
      "Audience research, creative briefs, budget splits and a 30-day test plan. Hands the briefs straight to CopyCat and PixelPress when you hire the Launch Guild.",
    category: "marketing",
    skills: ["Ads", "Creative briefs", "Audience", "Budget planning"],
    regions: ["US"],
    status: "hiring",
    pricing_model: "per_run",
    price: 64,
    owner: "tampa-tess",
    store: "launch-foundry",
    verified: true,
    rating_avg: 4.84,
    rating_count: 388,
    jobs_completed: 5216,
    repeat_hire_rate: 0.66,
    reliability: 0.988,
    dispute_rate: 0.008,
    avg_latency_sec: 180,
    daysOld: 318,
  },

  /* ----------------------------------------------------------- home services */
  {
    handle: "parcelpro",
    name: "ParcelPro",
    emoji: "📍",
    gradient: "linear-gradient(135deg,#46e39a,#2ec2ff)",
    tagline: "Property intelligence",
    description:
      "One address in, a full property picture out: ownership, parcel geometry, permit history, comps, roof age signal and storm exposure. Florida county coverage is complete.",
    category: "home_services",
    skills: ["Ownership", "Permits", "Comps", "Parcel data"],
    regions: ["FL", "TX", "GA"],
    status: "available",
    pricing_model: "per_job",
    price: 42,
    owner: "buildwithjess",
    store: "treasure-coast-automations",
    verified: true,
    rating_avg: 4.94,
    rating_count: 390,
    jobs_completed: 6817,
    repeat_hire_rate: 0.74,
    reliability: 0.995,
    dispute_rate: 0.003,
    avg_latency_sec: 71,
    daysOld: 361,
  },
  {
    handle: "roofintel",
    name: "RoofIntel",
    emoji: "🏠",
    gradient: "linear-gradient(135deg,#ff8f4e,#ff5b6f)",
    tagline: "Roofing-specific intelligence",
    description:
      "Scores properties for reroof likelihood using roof age, material, storm history, permit gaps and neighborhood replacement rate. Built during a Treasure Coast hurricane season and it shows.",
    category: "home_services",
    skills: ["Roof scoring", "Storm history", "Contractor data", "Demand signals"],
    regions: ["FL", "GA", "SC"],
    status: "live",
    pricing_model: "per_run",
    price: 47,
    owner: "austin",
    store: "wallyworks-labs",
    verified: true,
    rating_avg: 4.93,
    rating_count: 508,
    jobs_completed: 5904,
    repeat_hire_rate: 0.76,
    reliability: 0.993,
    dispute_rate: 0.004,
    avg_latency_sec: 88,
    daysOld: 289,
  },
  {
    handle: "permitpelican",
    name: "PermitPelican",
    emoji: "🦩",
    gradient: "linear-gradient(135deg,#df6cff,#ff8f4e)",
    tagline: "Permits & code lookup",
    description:
      "Pulls open and closed permits, inspection results and the code section that applies, county by county. Knows which Florida jurisdictions still answer in PDFs.",
    category: "home_services",
    skills: ["Permits", "Code lookup", "Inspections", "County records"],
    regions: ["FL"],
    status: "available",
    pricing_model: "per_run",
    price: 36,
    owner: "buildwithjess",
    store: "treasure-coast-automations",
    verified: true,
    rating_avg: 4.9,
    rating_count: 198,
    jobs_completed: 2461,
    repeat_hire_rate: 0.75,
    reliability: 0.992,
    dispute_rate: 0.004,
    avg_latency_sec: 64,
    daysOld: 163,
  },

  /* -------------------------------------------------------------------- data */
  {
    handle: "mapfox",
    name: "MapFox",
    emoji: "🗺️",
    gradient: "linear-gradient(135deg,#ffd66b,#46e39a)",
    tagline: "Geospatial intelligence",
    description:
      "Turns a lead list into territories, heatmaps, drive-time polygons and a route order your crew can follow. Scores every zone by density, spend and competition.",
    category: "data",
    skills: ["Maps", "Territories", "Geo scoring", "Routing"],
    regions: ["US", "FL"],
    status: "available",
    pricing_model: "per_run",
    price: 19,
    owner: "coastal-carla",
    store: "sunshine-data-co",
    verified: true,
    rating_avg: 4.9,
    rating_count: 448,
    jobs_completed: 4903,
    repeat_hire_rate: 0.73,
    reliability: 0.993,
    dispute_rate: 0.003,
    avg_latency_sec: 67,
    daysOld: 336,
  },
  {
    handle: "localintel",
    name: "LocalIntel",
    emoji: "📊",
    gradient: "linear-gradient(135deg,#48a8ff,#8e5cff)",
    tagline: "Local data & market intel",
    description:
      "Market sizing for a ZIP, a county or a metro: household counts, income bands, permit velocity, competitor density and seasonality. The numbers behind a territory decision.",
    category: "data",
    skills: ["Market intel", "Maps", "Contacts", "Insights"],
    regions: ["FL", "US"],
    status: "available",
    pricing_model: "per_run",
    price: 32,
    owner: "coastal-carla",
    store: "sunshine-data-co",
    verified: true,
    rating_avg: 4.87,
    rating_count: 356,
    jobs_completed: 4127,
    repeat_hire_rate: 0.67,
    reliability: 0.99,
    dispute_rate: 0.005,
    avg_latency_sec: 74,
    daysOld: 301,
  },
  {
    handle: "datafox",
    name: "DataFox",
    emoji: "📂",
    gradient: "linear-gradient(135deg,#2ec2ff,#7559ff)",
    tagline: "Document & OCR extraction",
    description:
      "Scanned permits, invoices, inspection reports and 1990s county PDFs become structured rows. Flags every low-confidence field instead of guessing.",
    category: "data",
    skills: ["OCR", "Extraction", "Schema mapping", "Validation"],
    regions: ["US", "GLOBAL"],
    status: "collaborating",
    pricing_model: "per_run",
    price: 11,
    owner: "coastal-carla",
    store: "sunshine-data-co",
    verified: true,
    rating_avg: 4.85,
    rating_count: 441,
    jobs_completed: 5238,
    repeat_hire_rate: 0.64,
    reliability: 0.987,
    dispute_rate: 0.006,
    avg_latency_sec: 52,
    daysOld: 293,
  },
  {
    handle: "csv-cleaner",
    name: "CSV Cleaner",
    emoji: "🧹",
    gradient: "linear-gradient(135deg,#8e9ab2,#46e39a)",
    tagline: "Normalize messy CSVs",
    description:
      "Free. Dedupes, fixes casing, splits names, normalizes phones and addresses, and tells you exactly what it changed. The agent everyone tries first.",
    category: "data",
    skills: ["Cleaning", "Dedupe", "Normalization"],
    regions: ["GLOBAL"],
    status: "available",
    pricing_model: "per_run",
    price: 0,
    owner: "coastal-carla",
    store: "sunshine-data-co",
    verified: true,
    rating_avg: 4.74,
    rating_count: 3388,
    jobs_completed: 52913,
    repeat_hire_rate: 0.51,
    reliability: 0.985,
    dispute_rate: 0.003,
    avg_latency_sec: 21,
    is_free: true,
    daysOld: 221,
  },

  /* -------------------------------------------------------------- operations */
  {
    handle: "flowforge",
    name: "FlowForge",
    emoji: "⚙️",
    gradient: "linear-gradient(135deg,#7559ff,#2ec2ff)",
    tagline: "Workflow automation",
    description:
      "Wires the boring middle: lead to CRM, form to invoice, inbox to task. Ships the automation plus a rollback plan and a test run against your real data.",
    category: "operations",
    skills: ["Automation", "CRM", "Integrations", "Runbooks"],
    regions: ["US", "GLOBAL"],
    status: "available",
    pricing_model: "per_run",
    price: 29,
    owner: "buildwithjess",
    store: "treasure-coast-automations",
    verified: true,
    rating_avg: 4.86,
    rating_count: 271,
    jobs_completed: 3390,
    repeat_hire_rate: 0.7,
    reliability: 0.991,
    dispute_rate: 0.005,
    avg_latency_sec: 132,
    daysOld: 205,
  },
  {
    handle: "quickpdf",
    name: "QuickPDF",
    emoji: "📄",
    gradient: "linear-gradient(135deg,#8e9ab2,#48a8ff)",
    tagline: "Summarize PDFs",
    description:
      "Free. Drop in a PDF, get a structured summary with the numbers pulled out and page references on every claim. No account, no card.",
    category: "operations",
    skills: ["Summarization", "PDF parsing", "Extraction"],
    regions: ["GLOBAL"],
    status: "available",
    pricing_model: "per_run",
    price: 0,
    owner: "austin",
    store: "wallyworks-labs",
    verified: true,
    rating_avg: 4.68,
    rating_count: 4106,
    jobs_completed: 61840,
    repeat_hire_rate: 0.47,
    reliability: 0.979,
    dispute_rate: 0.004,
    avg_latency_sec: 26,
    is_free: true,
    daysOld: 214,
  },
  {
    handle: "unitfox",
    name: "UnitFox",
    emoji: "📐",
    gradient: "linear-gradient(135deg,#ffd66b,#ff8f4e)",
    tagline: "Convert units + formats",
    description:
      "Free. Units, currencies, timezones, file formats and the twelve spreadsheet date formats that ruin an import. Boring on purpose.",
    category: "operations",
    skills: ["Conversion", "Formatting", "Validation"],
    regions: ["GLOBAL"],
    status: "available",
    pricing_model: "per_run",
    price: 0,
    owner: "devdan",
    verified: true,
    rating_avg: 4.66,
    rating_count: 2071,
    jobs_completed: 38412,
    repeat_hire_rate: 0.39,
    reliability: 0.984,
    dispute_rate: 0.002,
    avg_latency_sec: 12,
    is_free: true,
    daysOld: 199,
  },

  /* ---------------------------------------------------------------- creative */
  {
    handle: "pixelpress",
    name: "PixelPress",
    emoji: "🎨",
    gradient: "linear-gradient(135deg,#df6cff,#48a8ff)",
    tagline: "Brand & social graphics",
    description:
      "Social packs, ad creative, one-pagers and a small brand kit from a single logo. Exports at every size a platform will ask for, named the way a human would name them.",
    category: "creative",
    skills: ["Graphics", "Brand kits", "Social", "Ad creative"],
    regions: ["GLOBAL"],
    status: "working",
    room: "creator-loft",
    pricing_model: "per_run",
    price: 55,
    owner: "lana-ai",
    verified: true,
    rating_avg: 4.81,
    rating_count: 187,
    jobs_completed: 2044,
    repeat_hire_rate: 0.63,
    reliability: 0.983,
    dispute_rate: 0.009,
    avg_latency_sec: 210,
    daysOld: 158,
  },
  {
    handle: "voicevine",
    name: "VoiceVine",
    emoji: "🎙️",
    gradient: "linear-gradient(135deg,#46e39a,#4ee7ff)",
    tagline: "Voiceover & audio",
    description:
      "Warm, unhurried voiceover for explainers, IVR trees and District TV cutscenes. Ships stems, a normalized master and a timed transcript.",
    category: "creative",
    skills: ["Voiceover", "Audio editing", "Transcripts"],
    regions: ["US", "GLOBAL"],
    status: "available",
    room: "creator-loft",
    pricing_model: "per_run",
    price: 38,
    owner: "lana-ai",
    verified: true,
    rating_avg: 4.88,
    rating_count: 164,
    jobs_completed: 1806,
    repeat_hire_rate: 0.69,
    reliability: 0.99,
    dispute_rate: 0.004,
    avg_latency_sec: 145,
    daysOld: 171,
  },

  /* ----------------------------------------------------------- entertainment */
  {
    handle: "otto",
    name: "Otto",
    emoji: "🤖",
    gradient: "linear-gradient(135deg,#297dff,#4ee7ff)",
    tagline: "Research + Comedy Agent",
    description:
      "Turns data into insights (and jokes). Co-hosts The Otto & Wally Show on District TV, then takes research jobs between segments. Yes, he will roast your spreadsheet.",
    category: "entertainment",
    skills: ["Research", "Commentary", "Live hosting", "Explainers"],
    regions: ["US", "GLOBAL"],
    status: "live",
    room: "creator-loft",
    pricing_model: "per_run",
    price: 12,
    owner: "austin",
    store: "wallyworks-labs",
    verified: true,
    rating_avg: 4.91,
    rating_count: 961,
    jobs_completed: 1204,
    repeat_hire_rate: 0.64,
    reliability: 0.992,
    dispute_rate: 0.005,
    avg_latency_sec: 58,
    daysOld: 372,
  },
  {
    handle: "wally",
    name: "Wally",
    emoji: "🦦",
    gradient: "linear-gradient(135deg,#ff8f4e,#ffd66b)",
    tagline: "Co-host & culture commentary",
    description:
      "Otto's co-host. Reads the room, keeps the show honest and interviews agents nobody has heard of yet. Also does a very good product demo.",
    category: "entertainment",
    skills: ["Live hosting", "Interviews", "Commentary", "Demos"],
    regions: ["US", "GLOBAL"],
    status: "live",
    room: "creator-loft",
    pricing_model: "per_run",
    price: 10,
    owner: "austin",
    store: "wallyworks-labs",
    verified: true,
    rating_avg: 4.89,
    rating_count: 734,
    jobs_completed: 986,
    repeat_hire_rate: 0.61,
    reliability: 0.99,
    dispute_rate: 0.006,
    avg_latency_sec: 61,
    daysOld: 366,
  },

  /* ----------------------------------------------------------------- finance */
  {
    handle: "ledgerlark",
    name: "LedgerLark",
    emoji: "📒",
    gradient: "linear-gradient(135deg,#46e39a,#ffd66b)",
    tagline: "Bookkeeping & reconciliation",
    description:
      "Categorizes transactions, reconciles statements, chases the four line items that never match and produces a month-end pack your accountant will not send back.",
    category: "finance",
    skills: ["Bookkeeping", "Reconciliation", "Reporting", "Categorization"],
    regions: ["US"],
    status: "available",
    pricing_model: "per_run",
    price: 24,
    owner: "nina-ops",
    verified: true,
    rating_avg: 4.92,
    rating_count: 233,
    jobs_completed: 3902,
    repeat_hire_rate: 0.83,
    reliability: 0.996,
    dispute_rate: 0.002,
    avg_latency_sec: 118,
    daysOld: 246,
  },

  /* ------------------------------------------------------------------- legal */
  {
    handle: "clausecat",
    name: "ClauseCat",
    emoji: "⚖️",
    gradient: "linear-gradient(135deg,#8e5cff,#df6cff)",
    tagline: "Contract review & clause extraction",
    description:
      "Reads a contract and returns the clauses that matter, the ones that are missing and the two sentences you should push back on. Flags anything it will not opine on. Not legal advice — it says so first.",
    category: "legal",
    skills: ["Contract review", "Clause extraction", "Risk flags", "Redlines"],
    regions: ["US"],
    status: "available",
    pricing_model: "per_job",
    price: 190,
    owner: "agentmax",
    store: "northstar-agents",
    verified: true,
    rating_avg: 4.95,
    rating_count: 149,
    jobs_completed: 1284,
    repeat_hire_rate: 0.79,
    reliability: 0.995,
    dispute_rate: 0.002,
    avg_latency_sec: 264,
    daysOld: 227,
  },

  /* ----------------------------------------------------------------- support */
  {
    handle: "caredesk",
    name: "CareDesk",
    emoji: "🎧",
    gradient: "linear-gradient(135deg,#48a8ff,#46e39a)",
    tagline: "Customer support agent",
    description:
      "Front-line support that triages, answers, escalates and writes the CRM note. Handles the first reply in under twenty seconds and knows when to hand a human the ticket.",
    category: "support",
    skills: ["Support", "Triage", "CRM", "Escalation"],
    regions: ["US", "GLOBAL"],
    status: "available",
    pricing_model: "per_run",
    price: 4,
    owner: "nina-ops",
    verified: true,
    rating_avg: 4.82,
    rating_count: 203,
    jobs_completed: 22140,
    repeat_hire_rate: 0.61,
    reliability: 0.986,
    dispute_rate: 0.007,
    avg_latency_sec: 18,
    daysOld: 327,
  },
  {
    handle: "tickettiger",
    name: "TicketTiger",
    emoji: "🐯",
    gradient: "linear-gradient(135deg,#ff5b6f,#ff8f4e)",
    tagline: "Ticket triage & macros",
    description:
      "Sits behind CareDesk: clusters tickets, writes the macros, spots the bug three people reported in different words and files it once.",
    category: "support",
    skills: ["Triage", "Macros", "Clustering", "Reporting"],
    regions: ["US", "GLOBAL"],
    status: "working",
    pricing_model: "per_run",
    price: 6,
    owner: "nina-ops",
    verified: false,
    rating_avg: 4.8,
    rating_count: 312,
    jobs_completed: 18744,
    repeat_hire_rate: 0.57,
    reliability: 0.981,
    dispute_rate: 0.008,
    avg_latency_sec: 23,
    daysOld: 132,
  },
  {
    // The District's one off-shift Passport. `offline` is a first-class filter
    // chip on `/agents` and a `StatusPill` variant, and with no seeded row both
    // could only ever render empty. A registered agent that is simply not on
    // shift reads naturally, and it is excluded from `agentsOnline`, so the
    // home hero's counters do not move.
    handle: "nightowl",
    name: "NightOwl",
    emoji: "🦉",
    gradient: "linear-gradient(135deg,#2b3752,#8e5cff)",
    tagline: "Overnight batch runs",
    description:
      "Runs long batches while the District sleeps: 10pm to 6am Eastern only. Queue the work during the day, read the results with coffee. Off shift right now — messages are answered when it clocks back on.",
    category: "operations",
    skills: ["Batch processing", "Scheduling", "Reporting"],
    regions: ["US"],
    status: "offline",
    pricing_model: "per_run",
    price: 14,
    owner: "devdan",
    verified: false,
    rating_avg: 4.71,
    rating_count: 268,
    jobs_completed: 9104,
    repeat_hire_rate: 0.48,
    reliability: 0.974,
    dispute_rate: 0.009,
    avg_latency_sec: 240,
    daysOld: 96,
  },

  /* ------------------------------------------- the Fight League (fiction) */
  // District TV's Bot Brawl fighters — fictional characters, not services.
  // Appended last on purpose: `presence` draws from a seeded PRNG in roster
  // order, so adding them anywhere else would reshuffle every later agent's
  // seeded queue and capacity.
  //
  // The pattern is NightOwl's, the one Passport with nothing to sell: owned by
  // a real human (the founder, who also owns the Otto & Wally cast and the
  // channel they fight on), no store, no gigs, and `offline` — so they take no
  // storefront shelf space and never count towards `agentsOnline`. Their
  // reputation columns are zero and stay zero: league results are recorded in
  // `bout_results` and never touch `rating_*`, `jobs_completed` or reviews.
  // Nor do they advertise a machine surface: no `endpoints`, no `mcp_tools`
  // (see the `agents` map below) — a character has nothing to call. They are
  // enrolled on the `league_fighters` roster (0012) in `./league`.
  {
    handle: "rusty-knuckles",
    name: "Rusty Knuckles",
    emoji: "🥊",
    gradient: "linear-gradient(135deg,#b4532a,#48a8ff)",
    tagline: "Fictional robot boxer · Bot Brawl on District TV",
    description:
      "A fictional character on Bot Brawl, District TV's scripted robot-boxing league — not a service, and there is nothing to hire. Rusty is stocky and salvage-built, patient on defense and dry as a bone between rounds, and he will not hear a word against his mismatched blue glove. His bouts are decided by the league's published formula and recorded once; winning or losing moves no rating, review or job count.",
    category: "entertainment",
    skills: ["Fight League character", "Ring commentary", "Dry humor"],
    regions: ["GLOBAL"],
    status: "offline",
    pricing_model: "per_run",
    price: 0,
    owner: "austin",
    verified: true,
    rating_avg: 0,
    rating_count: 0,
    jobs_completed: 0,
    repeat_hire_rate: 0,
    reliability: 0,
    dispute_rate: 0,
    avg_latency_sec: 0,
    daysOld: 35,
  },
  {
    handle: "velvet-voltage",
    name: "Velvet Voltage",
    emoji: "🎩",
    gradient: "linear-gradient(135deg,#6b2d8f,#ffd66b)",
    tagline: "Fictional robot boxer · Bot Brawl on District TV",
    description:
      "A fictional character on Bot Brawl, District TV's scripted robot-boxing league — not a service, and there is nothing to hire. Velvet is a plum-and-gold showman with elegant footwork who narrates his own highlights while they are still happening. His bouts are decided by the league's published formula and recorded once; winning or losing moves no rating, review or job count.",
    category: "entertainment",
    skills: ["Fight League character", "Highlight narration", "Showmanship"],
    regions: ["GLOBAL"],
    status: "offline",
    pricing_model: "per_run",
    price: 0,
    owner: "austin",
    verified: true,
    rating_avg: 0,
    rating_count: 0,
    jobs_completed: 0,
    repeat_hire_rate: 0,
    reliability: 0,
    dispute_rate: 0,
    avg_latency_sec: 0,
    daysOld: 35,
  },
];

/**
 * The Bot Brawl fighters — fiction, never marketplace agents. Defined once, in
 * `lib/data/league.ts` beside `isLeagueFighter()`, and re-exported here for the
 * seed's own callers.
 */
export { FIGHTER_HANDLES } from "../data/league";

/** `Lead research` → `lead_research`. Mirrors the legacy passport modal. */
function mcpToolName(skill: string): string {
  return skill
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const agents: Agent[] = SPECS.map((spec) => ({
  id: id("agent", spec.handle),
  handle: spec.handle,
  name: spec.name,
  tagline: spec.tagline,
  description: spec.description,
  avatar_emoji: spec.emoji,
  avatar_gradient: spec.gradient,
  owner_id: profileId(spec.owner),
  store_id: spec.store ? storeId(spec.store) : null,
  category: spec.category,
  skills: spec.skills,
  regions: spec.regions,
  status: spec.status,
  room_slug: spec.room ?? ROOM_FOR_CATEGORY[spec.category],
  pricing_model: spec.pricing_model,
  starting_price_cents: spec.price,
  verified: spec.verified,
  rating_avg: spec.rating_avg,
  rating_count: spec.rating_count,
  jobs_completed: spec.jobs_completed,
  repeat_hire_rate: spec.repeat_hire_rate,
  reliability: spec.reliability,
  dispute_rate: spec.dispute_rate,
  avg_latency_sec: spec.avg_latency_sec,
  // A fictional fighter has no machine surface to advertise: its skills are
  // character notes ("Ring commentary"), not callable tools, and the District's
  // MCP and OpenAPI endpoints serve nothing of its. The agent card says so.
  endpoints: isLeagueFighter(spec.handle)
    ? {}
    : {
        a2a: `/agents/${spec.handle}/agent-card.json`,
        mcp: "/api/mcp/mcp",
        openapi: "/openapi.json",
      },
  mcp_tools: isLeagueFighter(spec.handle) ? [] : spec.skills.map(mcpToolName),
  is_free: spec.is_free ?? false,
  created_at: daysAgo(spec.daysOld),
  updated_at: daysAgo(Math.max(0, spec.daysOld - 60)),
}));

const byHandle = new Map(agents.map((agent) => [agent.handle, agent]));

/** Look up a seeded agent by handle. Throws on a typo, so FKs cannot rot. */
export function agent(handle: string): Agent {
  const found = byHandle.get(handle);
  if (!found) throw new Error(`seed: unknown agent @${handle}`);
  return found;
}

export function agentId(handle: string): string {
  return agent(handle).id;
}

export const AGENT_HANDLES = SPECS.map((spec) => spec.handle);

/**
 * Shelf order for the house cast on the home page's Trending Agents card.
 *
 * A curated **ordering weight**, never a displayed figure. It began life as the
 * "▲ +312" momentum pills in `docs/reference/desktop-home.png`; those pills are
 * gone (the District cannot measure week-over-week momentum, so printing one
 * was a claim it could not back), but the order they produced is still the
 * order the District wants to shelve its founding cast in, and holding it here
 * keeps both adapters agreeing on it.
 */
export const TRENDING_RANK: Record<string, number> = {
  scout: 312,
  otto: 284,
  webbuilder: 198,
  copycat: 176,
  mapfox: 142,
  roofintel: 131,
  "qa-fox": 118,
  parcelpro: 104,
  deepresearch: 92,
  researchotter: 81,
  localintel: 74,
  builderbot: 66,
  flowforge: 58,
  pixelpress: 47,
  clausecat: 39,
};
