import type { MarketItem, MarketItemKind } from "../data/types";
import { daysAgo } from "./clock";
import { storeId } from "./stores";
import { id } from "./uuid";

/**
 * District Market — 16 items across all seven kinds (BUILD_SPEC §2 asks for
 * ≥ 12). The first six are the legacy demo's market grid with its exact prices.
 */

type MarketSpec = {
  slug: string;
  title: string;
  description: string;
  kind: MarketItemKind;
  price: number;
  store?: string;
  verified: boolean;
  downloads: number;
  tags: string[];
  emoji: string;
  daysOld: number;
};

const SPECS: MarketSpec[] = [
  {
    slug: "florida-parcel-toolkit",
    title: "Florida Parcel Toolkit",
    description:
      "Every Florida county parcel endpoint behind one interface, including the eleven that still serve scanned PDFs. Handles auth, retries and the two counties that rate-limit at 3am.",
    kind: "tool",
    price: 180,
    store: "sunshine-data-co",
    verified: true,
    downloads: 8412,
    tags: ["florida", "parcels", "property", "api"],
    emoji: "🧰",
    daysOld: 244,
  },
  {
    slug: "local-business-enrichment-dataset",
    title: "Local Business Enrichment Dataset",
    description:
      "4.2M US local businesses with verified phones, emails, categories and service areas. Refreshed weekly; every record carries its last-verified date.",
    kind: "dataset",
    price: 420,
    store: "sunshine-data-co",
    verified: true,
    downloads: 6108,
    tags: ["leads", "enrichment", "contacts"],
    emoji: "🗂️",
    daysOld: 291,
  },
  {
    slug: "lead-to-crm-workflow",
    title: "Lead → CRM Workflow",
    description:
      "A drop-in workflow: capture, dedupe, enrich, route, tag, notify. Ships with a dry-run mode and a rollback step, because it will go wrong once.",
    kind: "workflow",
    price: 60,
    store: "treasure-coast-automations",
    verified: true,
    downloads: 11744,
    tags: ["crm", "automation", "leads"],
    emoji: "⚙️",
    daysOld: 208,
  },
  {
    slug: "warm-voice-pack",
    title: "Warm Voice Pack",
    description:
      "Twelve warm, unhurried voice presets tuned for explainers and IVR. Includes pronunciation overrides for the words every TTS engine gets wrong.",
    kind: "voice",
    price: 30,
    verified: true,
    downloads: 3287,
    tags: ["voice", "tts", "audio"],
    emoji: "🎙️",
    daysOld: 166,
  },
  {
    slug: "roofing-qualification-skill",
    title: "Roofing Qualification Skill",
    description:
      "The scoring logic behind RoofIntel, packaged as a skill your own agent can call: roof age, material, storm exposure, permit gaps, neighborhood replacement rate.",
    kind: "skill",
    price: 90,
    store: "wallyworks-labs",
    verified: true,
    downloads: 2941,
    tags: ["roofing", "scoring", "home services"],
    emoji: "🧠",
    daysOld: 187,
  },
  {
    slug: "regression-test-pack",
    title: "Regression Test Pack",
    description:
      "QA Fox's standard suite as a reusable pack: 140 checks across auth, forms, payment, mobile layout and accessibility. Playwright, no config.",
    kind: "qa_pack",
    price: 40,
    store: "northstar-agents",
    verified: true,
    downloads: 9520,
    tags: ["qa", "playwright", "testing"],
    emoji: "🧪",
    daysOld: 231,
  },
  {
    slug: "florida-storm-history-dataset",
    title: "Florida Storm History Dataset",
    description:
      "Named storms since 1998 with modeled peak gust at parcel resolution. The layer that turns an address list into a reroof list.",
    kind: "dataset",
    price: 640,
    store: "sunshine-data-co",
    verified: true,
    downloads: 1877,
    tags: ["storm", "florida", "roofing", "geo"],
    emoji: "🌀",
    daysOld: 154,
  },
  {
    slug: "permit-portal-adapters",
    title: "Permit Portal Adapters",
    description:
      "Sixty-seven county permit portals normalized to one schema. When a county changes its portal, the adapter updates and your pipeline does not notice.",
    kind: "tool",
    price: 260,
    store: "treasure-coast-automations",
    verified: true,
    downloads: 2144,
    tags: ["permits", "florida", "adapters"],
    emoji: "🔌",
    daysOld: 172,
  },
  {
    slug: "territory-map-component",
    title: "Territory Map Component",
    description:
      "A React map component for drive-time territories: polygons, heat layer, crew colors, and a legend that stays readable on a phone in sunlight.",
    kind: "component",
    price: 150,
    store: "sunshine-data-co",
    verified: true,
    downloads: 1620,
    tags: ["react", "maps", "component"],
    emoji: "🗺️",
    daysOld: 139,
  },
  {
    slug: "agent-passport-badge",
    title: "Agent Passport Badge",
    description:
      "Drop-in badge that renders any agent's live District reputation on your own site — rating, reliability, jobs completed, all from the public agent card.",
    kind: "component",
    price: 0,
    store: "wallyworks-labs",
    verified: true,
    downloads: 14208,
    tags: ["passport", "reputation", "embed", "free"],
    emoji: "🪪",
    daysOld: 121,
  },
  {
    slug: "contract-clause-library",
    title: "Contract Clause Library",
    description:
      "480 clauses with plain-English explanations and a suggested redline for each. The knowledge base behind ClauseCat, licensed for your own agent.",
    kind: "skill",
    price: 480,
    store: "northstar-agents",
    verified: true,
    downloads: 812,
    tags: ["legal", "contracts", "clauses"],
    emoji: "⚖️",
    daysOld: 148,
  },
  {
    slug: "support-macro-library",
    title: "Support Macro Library",
    description:
      "Nine hundred support macros clustered by intent, tone-matched to three brand voices. Import into any helpdesk in about four minutes.",
    kind: "skill",
    price: 120,
    verified: true,
    downloads: 4033,
    tags: ["support", "macros", "helpdesk"],
    emoji: "🎧",
    daysOld: 133,
  },
  {
    slug: "florida-contractor-license-dataset",
    title: "Florida Contractor License Dataset",
    description:
      "Every active Florida contractor license with status, class, insurance expiry and disciplinary history. Updated nightly from the state register.",
    kind: "dataset",
    price: 340,
    store: "treasure-coast-automations",
    verified: true,
    downloads: 2588,
    tags: ["florida", "licenses", "contractors"],
    emoji: "📋",
    daysOld: 159,
  },
  {
    slug: "onboarding-email-workflow",
    title: "Onboarding Email Workflow",
    description:
      "A seven-email onboarding sequence with branching on activation events, written by CopyCat and wired by FlowForge. Bring your own ESP.",
    kind: "workflow",
    price: 95,
    store: "launch-foundry",
    verified: true,
    downloads: 3711,
    tags: ["email", "onboarding", "lifecycle"],
    emoji: "✉️",
    daysOld: 127,
  },
  {
    slug: "accessibility-audit-pack",
    title: "Accessibility Audit Pack",
    description:
      "WCAG 2.2 AA checks with real screen-reader traversal, not just an axe scan. Returns failures grouped by the fix, so one change closes nine issues.",
    kind: "qa_pack",
    price: 180,
    store: "northstar-agents",
    verified: true,
    downloads: 2266,
    tags: ["accessibility", "wcag", "qa"],
    emoji: "♿",
    daysOld: 114,
  },
  {
    slug: "bright-voice-pack",
    title: "Bright Voice Pack",
    description:
      "Eight energetic presets for short-form and ads, with a loudness profile that survives platform normalization.",
    kind: "voice",
    price: 35,
    verified: false,
    downloads: 941,
    tags: ["voice", "tts", "shortform"],
    emoji: "🔊",
    daysOld: 96,
  },
];

export const marketItems: MarketItem[] = SPECS.map((spec) => ({
  id: id("market-item", spec.slug),
  slug: spec.slug,
  title: spec.title,
  description: spec.description,
  kind: spec.kind,
  price_cents: spec.price,
  seller_store_id: spec.store ? storeId(spec.store) : null,
  verified: spec.verified,
  downloads: spec.downloads,
  tags: spec.tags,
  icon_emoji: spec.emoji,
  created_at: daysAgo(spec.daysOld),
  updated_at: daysAgo(Math.max(0, spec.daysOld - 14)),
}));
