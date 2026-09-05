import { AGENT_CATEGORIES, type AgentCategory } from "@/lib/data/types";

/**
 * Intent extraction for @World (BUILD_SPEC §5).
 *
 * Pure, dependency-free heuristics: keyword maps for categories and skills, a
 * US state/city gazetteer for regions, and regexes for quantity ("200 roofing
 * companies"), budget ("under $10") and deadline ("in 3 hours"). The optional
 * Anthropic pass in `./refine` only ever *refines* what this produces, and any
 * failure falls straight back to it.
 */

export type WorldIntent = {
  /** Best-guess categories, most confident first. */
  categories: AgentCategory[];
  /** Canonical skill labels that match the District's vocabulary. */
  skills: string[];
  /** Normalised region code an agent's `regions` column can be matched against. */
  region?: string;
  /** Raw place names found in the outcome, e.g. `["Tampa"]`. */
  locations: string[];
  /** "200 roofing companies" → 200. */
  quantity?: number;
  /** "under $10" → 1000. */
  budgetCents?: number;
  /** "in 3 hours" → 10800. */
  deadlineSeconds?: number;
  /** Content words left after stop-word removal; used for text matching. */
  keywords: string[];
  /** Where this intent came from. */
  source: "heuristic" | "llm";
};

/* -------------------------------------------------------------------------- */
/* Vocabularies                                                                */
/* -------------------------------------------------------------------------- */

const CATEGORY_KEYWORDS: Record<AgentCategory, string[]> = {
  research: [
    "find", "research", "list", "leads", "lead", "prospect", "prospects", "companies",
    "businesses", "directory", "scrape", "gather", "sources", "investigate", "competitor",
    "market map", "citations", "verify", "contacts", "discover",
  ],
  development: [
    "build", "website", "web site", "landing page", "app", "code", "api", "frontend",
    "backend", "deploy", "site", "microsite", "bug", "fix", "test", "qa", "regression",
    "schema markup", "integration", "database",
  ],
  marketing: [
    "ad", "ads", "advertising", "copy", "copywriting", "campaign", "seo", "social",
    "email", "newsletter", "offer", "brand voice", "landing copy", "audience", "funnel",
    "posts", "content",
  ],
  home_services: [
    "roof", "roofing", "gutter", "gutters", "hvac", "plumbing", "plumber", "contractor",
    "property", "properties", "parcel", "permit", "permits", "inspection", "storm",
    "pool", "landscaping", "pressure washing", "homeowner",
  ],
  data: [
    "csv", "spreadsheet", "dataset", "data", "clean", "dedupe", "deduplicate", "enrich",
    "enrichment", "normalize", "map", "maps", "geo", "territory", "territories", "ocr",
    "extract", "extraction", "validate", "records",
  ],
  operations: [
    "workflow", "automate", "automation", "ops", "operations", "crm", "invoice",
    "scheduling", "schedule", "runbook", "pdf", "summarize", "summary", "convert",
    "process", "back office",
  ],
  creative: [
    "design", "logo", "graphic", "graphics", "image", "images", "video", "voice",
    "voiceover", "brand kit", "thumbnail", "illustration", "audio", "creative",
  ],
  entertainment: ["show", "podcast", "stream", "host", "episode", "commentary", "interview", "live"],
  finance: [
    "bookkeeping", "invoice", "invoices", "reconcile", "reconciliation", "pricing",
    "forecast", "budget report", "expenses", "accounting", "p&l",
  ],
  legal: [
    "contract", "contracts", "clause", "terms", "privacy policy", "compliance", "redline",
    "legal", "agreement", "nda",
  ],
  support: [
    "support", "tickets", "ticket", "helpdesk", "customer service", "inbox", "triage",
    "escalation", "faq", "chat support",
  ],
};

/** Canonical District skill labels and the words that imply them. */
const SKILL_KEYWORDS: Record<string, string[]> = {
  "Lead research": ["lead", "leads", "prospect", "prospects", "companies", "businesses", "find"],
  Enrichment: ["enrich", "enrichment", "append", "fill in"],
  "Local data": ["local", "nearby", "in my area", "city", "county"],
  Verification: ["verify", "verified", "double check", "confirm", "accurate"],
  "Deep research": ["deep research", "investigation", "teardown", "market map", "report"],
  Citations: ["citation", "citations", "sources", "cite"],
  "Contact research": ["contact", "contacts", "phone", "email", "owner"],
  Summaries: ["summarize", "summary", "digest", "brief"],
  "Landing pages": ["landing page", "website", "site", "microsite", "web page"],
  Frontend: ["frontend", "react", "ui", "responsive"],
  SEO: ["seo", "search ranking", "keywords", "organic"],
  "Schema markup": ["schema", "structured data", "json-ld"],
  QA: ["qa", "quality", "test", "tests", "regression", "bug"],
  Validation: ["validate", "validation", "check", "verify data"],
  Accessibility: ["accessibility", "a11y", "wcag"],
  APIs: ["api", "endpoint", "integration", "webhook"],
  "Database design": ["database", "schema design", "postgres", "sql"],
  "Landing copy": ["copy", "copywriting", "headline", "messaging"],
  Email: ["email", "newsletter", "drip", "sequence"],
  "Ad copy": ["ad copy", "ads", "advertising", "creative brief"],
  Ads: ["ads", "google ads", "meta ads", "campaign"],
  Audience: ["audience", "targeting", "persona"],
  Ownership: ["owner", "ownership", "deed", "title"],
  Permits: ["permit", "permits", "code lookup", "inspection"],
  Comps: ["comps", "comparable", "valuation"],
  "Parcel data": ["parcel", "lot size", "property record"],
  "Roof scoring": ["roof", "roofing", "shingle", "roof age"],
  "Storm history": ["storm", "hail", "hurricane", "wind damage"],
  "Contractor data": ["contractor", "contractors", "installer"],
  Maps: ["map", "maps", "mapping", "geocode"],
  Territories: ["territory", "territories", "zones", "routes"],
  "Geo scoring": ["geo", "radius", "drive time", "heat map"],
  OCR: ["ocr", "scan", "scanned", "pdf text"],
  Extraction: ["extract", "extraction", "pull out", "parse"],
  "Schema mapping": ["schema mapping", "column mapping", "normalize fields"],
  Cleaning: ["clean", "cleanup", "messy", "tidy"],
  Dedupe: ["dedupe", "duplicate", "duplicates"],
  Normalization: ["normalize", "standardize", "format"],
  Automation: ["automate", "automation", "workflow", "zapier"],
  CRM: ["crm", "hubspot", "salesforce", "pipeline"],
  Summarization: ["summarize", "tl;dr", "condense"],
  "PDF parsing": ["pdf", "pdfs", "document parsing"],
  Graphics: ["graphic", "graphics", "design", "logo"],
  "Brand kits": ["brand kit", "brand", "style guide"],
  Social: ["social", "instagram", "tiktok", "linkedin", "posts"],
  Voiceover: ["voiceover", "voice over", "narration", "audio"],
  Transcripts: ["transcript", "transcription", "captions"],
  "Live hosting": ["live", "stream", "host", "show"],
  Bookkeeping: ["bookkeeping", "books", "ledger", "expenses"],
  Reconciliation: ["reconcile", "reconciliation", "match transactions"],
  Reporting: ["report", "reporting", "dashboard"],
  "Contract review": ["contract", "agreement", "nda", "terms"],
  "Clause extraction": ["clause", "clauses", "section"],
  "Risk flags": ["risk", "red flag", "liability"],
  Support: ["support", "customer service", "helpdesk"],
  Triage: ["triage", "prioritize", "route tickets"],
};

const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
  michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

/** Cities the District's copy actually talks about, plus the big US metros. */
const CITIES: Record<string, string> = {
  tampa: "FL", orlando: "FL", miami: "FL", jacksonville: "FL", "st. petersburg": "FL",
  "st petersburg": "FL", sarasota: "FL", naples: "FL", "fort pierce": "FL", stuart: "FL",
  "vero beach": "FL", "port st. lucie": "FL", "port st lucie": "FL", "palm bay": "FL",
  melbourne: "FL", "palm city": "FL", "boca raton": "FL", "fort lauderdale": "FL",
  "west palm beach": "FL", gainesville: "FL", tallahassee: "FL", ocala: "FL",
  atlanta: "GA", savannah: "GA", charleston: "SC", columbia: "SC", charlotte: "NC",
  raleigh: "NC", nashville: "TN", memphis: "TN", austin: "TX", dallas: "TX",
  houston: "TX", "san antonio": "TX", phoenix: "AZ", denver: "CO", seattle: "WA",
  portland: "OR", "san diego": "CA", "los angeles": "CA", "san francisco": "CA",
  "new york": "NY", brooklyn: "NY", chicago: "IL", boston: "MA", philadelphia: "PA",
  detroit: "MI", minneapolis: "MN", "las vegas": "NV",
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "for", "from", "get",
  "give", "has", "have", "how", "i", "in", "into", "is", "it", "me", "my", "need",
  "of", "on", "or", "our", "please", "so", "than", "that", "the", "then", "there",
  "they", "this", "to", "up", "us", "want", "was", "we", "what", "when", "who",
  "will", "with", "would", "you", "your",
]);

/* -------------------------------------------------------------------------- */
/* Extractors                                                                  */
/* -------------------------------------------------------------------------- */

const MONEY = "\\$?\\s*(\\d+(?:[.,]\\d+)?)";

const BUDGET_PATTERNS = [
  new RegExp(`(?:under|below|less than|max(?:imum)?|up to|no more than|within)\\s+${MONEY}`, "i"),
  new RegExp(`budget(?:\\s+of)?\\s+${MONEY}`, "i"),
  new RegExp(`${MONEY}\\s*(?:budget|or less|max)`, "i"),
  new RegExp(`for\\s+\\$\\s*(\\d+(?:[.,]\\d+)?)`, "i"),
  new RegExp(`\\$\\s*(\\d+(?:[.,]\\d+)?)`, "i"),
];

const DURATION_UNITS: Record<string, number> = {
  second: 1, seconds: 1, sec: 1, secs: 1,
  minute: 60, minutes: 60, min: 60, mins: 60,
  hour: 3600, hours: 3600, hr: 3600, hrs: 3600,
  day: 86400, days: 86400,
  week: 604800, weeks: 604800,
};

const DEADLINE_PATTERN = new RegExp(
  `\\b(?:in|within|inside|under|by)\\s+(\\d+(?:\\.\\d+)?)\\s*(${Object.keys(DURATION_UNITS).join("|")})\\b`,
  "i",
);

function parseMoneyToCents(raw: string): number | undefined {
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value * 100);
}

export function extractBudgetCents(text: string): { cents?: number; matched?: string } {
  for (const pattern of BUDGET_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const cents = parseMoneyToCents(match[1]);
      if (cents !== undefined) return { cents, matched: match[0] };
    }
  }
  return {};
}

export function extractDeadlineSeconds(text: string): { seconds?: number; matched?: string } {
  const match = DEADLINE_PATTERN.exec(text);
  if (match?.[1] && match[2]) {
    const unit = DURATION_UNITS[match[2].toLowerCase()];
    const seconds = Math.round(Number(match[1]) * unit);
    if (Number.isFinite(seconds) && seconds > 0) return { seconds, matched: match[0] };
  }
  if (/\basap\b|\bright now\b|\bimmediately\b/i.test(text)) return { seconds: 3600 };
  if (/\btoday\b|\bsame day\b/i.test(text)) return { seconds: 28_800 };
  if (/\btomorrow\b/i.test(text)) return { seconds: 86_400 };
  if (/\bthis week\b/i.test(text)) return { seconds: 604_800 };
  return {};
}

/** The first standalone integer ≥ 2, once money and durations are removed. */
export function extractQuantity(text: string): number | undefined {
  const match = /\b(\d{1,3}(?:,\d{3})+|\d+)\b/.exec(text);
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value < 2) return undefined;
  return value;
}

export function extractRegion(text: string): { region?: string; locations: string[] } {
  const lower = text.toLowerCase();
  const locations: string[] = [];
  let region: string | undefined;

  for (const [city, state] of Object.entries(CITIES)) {
    if (new RegExp(`\\b${escapeRegExp(city)}\\b`).test(lower)) {
      locations.push(titleCase(city));
      region ??= state;
    }
  }
  for (const [state, code] of Object.entries(US_STATES)) {
    if (new RegExp(`\\b${escapeRegExp(state)}\\b`).test(lower)) {
      locations.push(titleCase(state));
      region ??= code;
    }
  }
  if (!region) {
    const abbreviation = /\b([A-Z]{2})\b/.exec(text);
    const codes = new Set(Object.values(US_STATES));
    if (abbreviation && codes.has(abbreviation[1])) region = abbreviation[1];
  }
  return { region, locations: [...new Set(locations)] };
}

/**
 * Whole-word (optionally plural) match, the same rule `extractSkills` uses.
 *
 * The previous three-way `includes()` had an unanchored left edge on the plural
 * form (`` `${keyword}s ` ``), so "leads" matched the marketing keyword "ads"
 * and "Find 200 roofing leads in Tampa" routed to `marketing`. Multi-word
 * keywords still match as substrings.
 */
function mentionsKeyword(lower: string, keyword: string): boolean {
  if (keyword.includes(" ")) return lower.includes(keyword);
  return new RegExp(`\\b${escapeRegExp(keyword)}s?\\b`).test(lower);
}

export function extractCategories(text: string): AgentCategory[] {
  const lower = text.toLowerCase();
  const scored = AGENT_CATEGORIES.map((category) => {
    const hits = CATEGORY_KEYWORDS[category].filter((keyword) =>
      mentionsKeyword(lower, keyword),
    ).length;
    return { category, hits };
  })
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored.map((entry) => entry.category);
}

export function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(SKILL_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => mentionsKeyword(lower, keyword)))
    .map(([skill]) => skill);
}

export function extractKeywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !/^\d+$/.test(word)),
    ),
  ].slice(0, 12);
}

/**
 * The whole heuristic pass.
 *
 * `"Find 200 roofing companies in Tampa under $10"` →
 * categories `[research, home_services]`, quantity `200`, region `FL`,
 * budget `1000`.
 */
export function extractIntent(outcome: string): WorldIntent {
  const text = outcome.trim();

  const budget = extractBudgetCents(text);
  const deadline = extractDeadlineSeconds(text);

  // Strip money and duration phrases before hunting for a quantity, so
  // "under $10" and "in 3 hours" cannot masquerade as "10" and "3".
  let remainder = text;
  if (budget.matched) remainder = remainder.replace(budget.matched, " ");
  if (deadline.matched) remainder = remainder.replace(deadline.matched, " ");
  remainder = remainder.replace(/\$\s*\d+(?:[.,]\d+)?/g, " ");

  const { region, locations } = extractRegion(text);

  return {
    categories: extractCategories(text),
    skills: extractSkills(text),
    region,
    locations,
    quantity: extractQuantity(remainder),
    budgetCents: budget.cents,
    deadlineSeconds: deadline.seconds,
    keywords: extractKeywords(text),
    source: "heuristic",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

export const WORLD_VOCABULARY = { CATEGORY_KEYWORDS, SKILL_KEYWORDS, US_STATES, CITIES };
