import type {
  Agent,
  AgentCategory,
  ContractField,
  Gig,
  Job,
  Order,
  OrderOutput,
  OutputContract,
  OutputFormat,
} from "@/lib/data/types";
import { intBetween, pick, rngFor, round, type Rng } from "@/lib/seed/rng";

/**
 * Structured deliverables for simulated runs (BUILD_SPEC §6).
 *
 * The shape follows the *gig's own output contract* whenever there is one, so
 * `/orders/[id]` renders exactly what `/gigs/[slug]` promised. Jobs fall back to
 * their `required_output`, and anything else falls back to the agent's
 * category. Everything is seeded from the order id, so a run refreshed twice
 * produces byte-identical output.
 *
 * **The row is the unit of generation, not the cell.** Drawing every column
 * from its own vocabulary produced rows that contradicted themselves — the same
 * check both passing and failing, an email, a website and a business name that
 * belonged to three different companies, a defect "title" that was a business
 * name. Each row now starts from one identity and one check/defect template and
 * derives its dependent columns from that.
 *
 * This module is the **single** generator: `lib/seed/orders.ts` renders its
 * seeded deliverables through it too, so a refreshed run and a seeded one are
 * the same kind of artefact.
 */

/* -------------------------------------------------------------------------- */
/* Row identities — one coherent business per row                              */
/* -------------------------------------------------------------------------- */

export type RowIdentity = {
  business: string;
  owner: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  region: string;
};

/**
 * Fictional on purpose, and it must stay that way: these rows render on public
 * pages and in the committed `supabase/seed.sql`. Phone numbers sit in the
 * 555-0100…0199 block reserved for fiction, every email and website is on the
 * reserved `.example` TLD (RFC 2606), and every street is an invented
 * "Example" street. Never swap in a real business's contact details.
 */
const IDENTITIES: RowIdentity[] = [
  {
    business: "Castellano Roofing",
    owner: "Ray Castellano",
    address: "101 Example Way, Orlando, FL 32801",
    phone: "+14075550142",
    email: "office@castellano-roofing.example",
    website: "https://castellano-roofing.example",
    region: "Orlando, FL",
  },
  {
    business: "Sunstate Pool Service",
    owner: "Denise Whitfield",
    address: "202 Example Ave, Fort Pierce, FL 34950",
    phone: "+17725550118",
    email: "hello@sunstate-pool-service.example",
    website: "https://sunstate-pool-service.example",
    region: "St. Lucie County, FL",
  },
  {
    business: "Blue Heron Gutters",
    owner: "Marcus Ellery",
    address: "303 Example Blvd, Tampa, FL 33611",
    phone: "+18135550127",
    email: "quotes@blue-heron-gutters.example",
    website: "https://blue-heron-gutters.example",
    region: "Tampa, FL",
  },
  {
    business: "Treasure Coast HVAC",
    owner: "Priya Raman",
    address: "404 Example Ct, Stuart, FL 34996",
    phone: "+17725550163",
    email: "service@treasure-coast-hvac.example",
    website: "https://treasure-coast-hvac.example",
    region: "Treasure Coast, FL",
  },
  {
    business: "Palmetto Home Solutions",
    owner: "Tom Vasquez",
    address: "505 Example Ln, Kissimmee, FL 34747",
    phone: "+14075550175",
    email: "info@palmetto-home-solutions.example",
    website: "https://palmetto-home-solutions.example",
    region: "Osceola County, FL",
  },
  {
    business: "Riverbend Exteriors",
    owner: "Ellen Brody",
    address: "606 Example Dr, Fort Pierce, FL 34950",
    phone: "+17725550136",
    email: "team@riverbend-exteriors.example",
    website: "https://riverbend-exteriors.example",
    region: "Fort Pierce, FL",
  },
  {
    business: "Coastal Comfort Air",
    owner: "Sam Okonjo",
    address: "707 Example Pl, Vero Beach, FL 32963",
    phone: "+17725550184",
    email: "dispatch@coastal-comfort-air.example",
    website: "https://coastal-comfort-air.example",
    region: "Indian River County, FL",
  },
  {
    business: "Gulfstream Plumbing",
    owner: "Grace Lindqvist",
    address: "808 Example Rd, Palm Harbor, FL 34683",
    phone: "+17275550109",
    email: "office@gulfstream-plumbing.example",
    website: "https://gulfstream-plumbing.example",
    region: "Pinellas County, FL",
  },
  {
    business: "Everglade Landscaping",
    owner: "Nina Alvarez",
    address: "909 Example Cir, Melbourne, FL 32901",
    phone: "+13215550151",
    email: "crew@everglade-landscaping.example",
    website: "https://everglade-landscaping.example",
    region: "Brevard County, FL",
  },
  {
    business: "Lighthouse Electrical",
    owner: "Grant Mosley",
    address: "1010 Example Trl, Jupiter, FL 33458",
    phone: "+15615550192",
    email: "book@lighthouse-electrical.example",
    website: "https://lighthouse-electrical.example",
    region: "Palm Beach County, FL",
  },
  {
    business: "Ibis Pressure Washing",
    owner: "Alicia Braun",
    address: "1111 Example Ter, Winter Garden, FL 34787",
    phone: "+14075550124",
    email: "hello@ibis-pressure-washing.example",
    website: "https://ibis-pressure-washing.example",
    region: "Winter Garden, FL",
  },
  {
    business: "Mariner Home Services",
    owner: "Rick Santoro",
    address: "1212 Example Pkwy, Cape Coral, FL 33904",
    phone: "+12395550170",
    email: "office@mariner-home-services.example",
    website: "https://mariner-home-services.example",
    region: "Lee County, FL",
  },
];

/* -------------------------------------------------------------------------- */
/* Checks and defects — a template per row, with its own pass/fail detail       */
/* -------------------------------------------------------------------------- */

type CheckTemplate = {
  check: string;
  pass: string;
  fail: string;
};

const CHECKS: CheckTemplate[] = [
  {
    check: "Page loads under 3s",
    pass: "Largest contentful paint at 1.4s on a cold cache.",
    fail: "First load took 4.8s — the hero image ships at 2.1 MB.",
  },
  {
    check: "Primary action works",
    pass: "Quote form submitted and returned the thank-you state.",
    fail: "Submit posts to /contact and answers 405.",
  },
  {
    check: "Console stays clean",
    pass: "No errors or warnings across the three main routes.",
    fail: "Two hydration warnings on the pricing route.",
  },
  {
    check: "Fits a 390px viewport",
    pass: "No horizontal scroll at 390px; nav collapses cleanly.",
    fail: "The pricing table overflows by 48px at 390px.",
  },
  {
    check: "No broken links",
    pass: "All 24 internal links resolved with a 200.",
    fail: "Two footer links point at /services/old and 404.",
  },
  {
    check: "Images have alt text",
    pass: "Every content image carries a descriptive alt attribute.",
    fail: "Three gallery images have an empty alt attribute.",
  },
  {
    check: "Contact details match the listing",
    pass: "Phone and address match the Google Business Profile.",
    fail: "The footer phone number differs from the listing.",
  },
  {
    check: "Schema markup validates",
    pass: "LocalBusiness JSON-LD parses with no warnings.",
    fail: "JSON-LD is missing the required `address` property.",
  },
];

type DefectTemplate = {
  title: string;
  severity: "blocker" | "major" | "minor" | "polish";
  steps: string;
};

const DEFECTS: DefectTemplate[] = [
  {
    title: "Mobile menu traps keyboard focus",
    severity: "major",
    steps: "Open the menu at 390px, then press Tab three times.",
  },
  {
    title: "Quote form accepts an empty phone number",
    severity: "blocker",
    steps: "Submit the quote form with only a name filled in.",
  },
  {
    title: "Pricing table overflows the viewport",
    severity: "major",
    steps: "Load /pricing at 390px and scroll horizontally.",
  },
  {
    title: "Gallery images have no alt text",
    severity: "minor",
    steps: "Inspect the gallery on /work with a screen reader.",
  },
  {
    title: "Footer links point at a removed route",
    severity: "minor",
    steps: "Click 'Service areas' in the footer on any page.",
  },
  {
    title: "Hero image ships at full resolution",
    severity: "polish",
    steps: "Load the home page and read the network panel.",
  },
  {
    title: "Duplicate H1 on the services page",
    severity: "minor",
    steps: "Run an outline check on /services.",
  },
  {
    title: "Phone link is not tappable on iOS",
    severity: "major",
    steps: "Tap the header phone number on a phone.",
  },
];

/* -------------------------------------------------------------------------- */
/* Column vocabularies for everything that is not row-scoped                    */
/* -------------------------------------------------------------------------- */

const VOCAB = {
  research: [
    "Verified against two independent sources",
    "Matched on address and phone",
    "Owner confirmed by public filing",
    "Flagged for manual review",
    "High intent — recent permit activity",
    "Listed but not currently advertising",
  ],
  assumption: [
    "Blank cells treated as zero, not missing",
    "Ambiguous dates read as MM/DD/YYYY",
    "Trailing whitespace stripped from every cell",
    "Duplicate rows collapsed on the first column",
    "Currency amounts rounded to two decimals",
    "Rows with no key column left untouched",
  ],
  status: ["ok", "changed", "skipped", "needs review"],
  action: [
    "Created the record",
    "Updated two fields",
    "Skipped — already up to date",
    "Queued a follow-up",
    "Notified the owner",
  ],
  files: [
    "output/converted.csv",
    "output/report.md",
    "src/app/page.tsx",
    "public/schema.jsonld",
    "assets/hero@2x.png",
  ],
  outputFiles: [
    "output/converted.csv",
    "output/converted.xlsx",
    "output/normalized.jsonl",
    "output/report.md",
  ],
  formats: ["CSV (UTF-8)", "XLSX", "JSON Lines", "Markdown", "PDF"],
  units: ["metric → imperial", "USD → EUR", "UTC → America/New_York", "kg → lb", "cm → in"],
  channels: ["Email", "LinkedIn", "Google Ads", "Instagram", "Direct mail"],
  copy: [
    "Book the crew before storm season",
    "A roof report in ninety seconds",
    "Your neighbours already switched",
    "Free inspection, no sales pitch",
  ],
  imageDirection: [
    "Crew on a roof at golden hour, shot from the ground",
    "Before/after split of a cleaned driveway",
    "Close-up of a finished seam, shallow depth of field",
    "Truck and branded uniform outside a Florida ranch house",
  ],
  dimensions: ["1200×628", "1080×1080", "1920×1080", "512×512"],
  languages: ["typescript", "css", "html", "json", "markdown"],
  risk: ["low", "medium", "high"],
  exposure: ["low", "moderate", "high", "severe"],
  sentiment: ["positive", "neutral", "frustrated"],
  intent: ["billing question", "cancellation", "how-to", "bug report", "refund request"],
  resolution: [
    "Answered from the knowledge base",
    "Escalated to a human",
    "Refunded and closed",
    "Sent a replacement link",
  ],
  generic: [
    "Confirmed",
    "Needs a second pass",
    "Within tolerance",
    "No change required",
    "Delivered as specified",
  ],
} as const;

/** Gig titles read "I will …"; a deliverable's H1 should not. */
function headline(title: string): string {
  const trimmed = title.replace(/^I will /i, "").trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function isoDate(rng: Rng): string {
  const month = String(intBetween(rng, 1, 12)).padStart(2, "0");
  const day = String(intBetween(rng, 1, 28)).padStart(2, "0");
  return `2026-${month}-${day}`;
}

/** `age` as a whole word — never the "age" inside "average" or "package". */
const AGE_RE = /(^|_)age(_|$)|_age$|^age_/;

/* -------------------------------------------------------------------------- */
/* Row generation                                                              */
/* -------------------------------------------------------------------------- */

/** What a contract is *about*, decided once per deliverable, not per cell. */
type ContractShape = {
  /** Has a `check`/`result` pair: a QA sweep, so details follow the verdict. */
  checkLike: boolean;
  /** Has `severity` or `steps`: a defect list, so `title` is a defect title. */
  issueLike: boolean;
};

function shapeOf(fields: ContractField[]): ContractShape {
  const names = fields.map((field) => field.name.toLowerCase());
  const has = (needle: string) => names.some((name) => name.includes(needle));
  return {
    checkLike: has("check") || (has("result") && has("detail")),
    issueLike: has("severity") || has("steps") || has("defect") || has("issue"),
  };
}

type RowContext = {
  identity: RowIdentity;
  check: CheckTemplate;
  defect: DefectTemplate;
  /** Whether this row's check passed — the detail column follows it. */
  passed: boolean;
  evidenceHref: string;
  index: number;
};

function sampleValue(
  field: ContractField,
  rng: Rng,
  ctx: RowContext,
  shape: ContractShape,
): string | number {
  const name = field.name.toLowerCase();

  // Row-scoped columns win over the contract's `options` list: a `severity`
  // enum must agree with the defect in the same row, not be drawn beside it.
  if (name.includes("severity") && shape.issueLike) return ctx.defect.severity;
  if (shape.checkLike && (name.includes("result") || name.includes("status"))) {
    return ctx.passed ? "pass" : "fail";
  }

  if (field.options && field.options.length > 0) return pick(rng, field.options);

  // --- one identity per row ------------------------------------------------
  if (name.includes("address") || name.includes("street")) return ctx.identity.address;
  if (name.includes("business") || name.includes("company") || name.includes("competitor")) {
    return ctx.identity.business;
  }
  if (name.includes("phone")) return ctx.identity.phone;
  if (name.includes("email")) return ctx.identity.email;
  if (name.includes("owner") || name.includes("contact") || name.includes("inspector")) {
    return ctx.identity.owner;
  }
  if (name.includes("website") || name.includes("domain") || name.includes("url")) {
    return ctx.identity.website;
  }
  if (
    name.includes("service_area") ||
    name.includes("area") ||
    name.includes("region") ||
    name.includes("city") ||
    name.includes("county") ||
    name.includes("market") ||
    name.includes("location")
  ) {
    return ctx.identity.region;
  }

  // --- QA sweeps and defect lists ------------------------------------------
  if (name.includes("check")) return ctx.check.check;
  if (shape.checkLike && (name.includes("result") || name.includes("status"))) {
    return ctx.passed ? "pass" : "fail";
  }
  if (shape.checkLike && (name.includes("detail") || name.includes("note"))) {
    return ctx.passed ? ctx.check.pass : ctx.check.fail;
  }
  if (name.includes("severity")) return ctx.defect.severity;
  if (name.includes("steps") || name.includes("repro")) return ctx.defect.steps;
  if (shape.issueLike && (name.includes("title") || name.includes("issue"))) {
    return ctx.defect.title;
  }
  // Evidence is a link to the artefact, not a verdict — the contract usually
  // declares it as a URL, and rendering prose there reads as a bug.
  if (name.includes("evidence") || name.includes("screenshot") || field.type === "url") {
    return ctx.evidenceHref;
  }

  // --- files, formats and conversions --------------------------------------
  if (name.includes("converted")) {
    return `https://files.agentdistrict.example/${pick(rng, VOCAB.outputFiles)}`;
  }
  if (name.includes("file") || name.includes("path") || name.includes("asset")) {
    return pick(rng, VOCAB.files);
  }
  if (name.includes("format")) return pick(rng, VOCAB.formats);
  if (name.includes("unit") || name.includes("currency")) return pick(rng, VOCAB.units);
  if (name.includes("language")) return pick(rng, VOCAB.languages);
  if (name.includes("dimension") || name.includes("size")) return pick(rng, VOCAB.dimensions);
  if (name.includes("image_direction") || name.includes("art_direction")) {
    return pick(rng, VOCAB.imageDirection);
  }

  // --- verdicts and prose --------------------------------------------------
  if (name.includes("assumption")) return pick(rng, VOCAB.assumption);
  if (name.includes("exposure")) return pick(rng, VOCAB.exposure);
  if (name.includes("risk")) return pick(rng, VOCAB.risk);
  if (name.includes("sentiment")) return pick(rng, VOCAB.sentiment);
  if (name.includes("intent")) return pick(rng, VOCAB.intent);
  if (name.includes("resolution") || name.includes("recommendation")) {
    return pick(rng, VOCAB.resolution);
  }
  if (name.includes("status")) return pick(rng, VOCAB.status);
  if (name.includes("action") || name.includes("change")) return pick(rng, VOCAB.action);
  if (name.includes("channel")) return pick(rng, VOCAB.channels);
  if (
    name.includes("headline") ||
    name.includes("hook") ||
    name.includes("caption") ||
    name.includes("cta") ||
    name.includes("body")
  ) {
    return pick(rng, VOCAB.copy);
  }
  if (
    name.includes("note") ||
    name.includes("summary") ||
    name.includes("detail") ||
    name.includes("bullet") ||
    name.includes("finding") ||
    name.includes("insight") ||
    name.includes("takeaway")
  ) {
    return pick(rng, VOCAB.research);
  }
  // A "sources" column is a list of links, not a verdict.
  if (name.includes("source") || name.includes("citation") || name.includes("reference")) {
    const start = intBetween(rng, 0, IDENTITIES.length - 1);
    return [0, 1, 2]
      .map((offset) => IDENTITIES[(start + offset) % IDENTITIES.length].website)
      .join(", ");
  }

  // --- numbers -------------------------------------------------------------
  if (name.includes("date") || name.includes("issued")) return isoDate(rng);
  if (name.includes("confidence") || name.includes("accuracy")) {
    return round(0.82 + rng() * 0.17, 3);
  }
  if (AGE_RE.test(name)) return intBetween(rng, 4, 27);
  if (name.includes("score") || name.includes("priority")) return intBetween(rng, 41, 98);
  if (name.includes("count") || name.includes("households") || name.includes("velocity")) {
    return intBetween(rng, 12, 4800);
  }
  if (name.includes("cents") || name.includes("amount") || name.includes("price")) {
    return intBetween(rng, 1200, 480000);
  }
  if (name.includes("duration") || name.includes("seconds") || name.includes("bytes")) {
    return intBetween(rng, 4, 3600);
  }
  if (name.includes("name") || name.includes("title")) return ctx.identity.business;

  if (field.type === "number") return intBetween(rng, 1, 240);
  if (field.type === "boolean") return rng() > 0.75 ? "true" : "false";
  // The contract's own `example` is the best possible value — it is what the
  // creator said this field looks like. Never the field's *description*.
  return field.example ?? pick(rng, VOCAB.generic);
}

function rowsFor(
  fields: ContractField[],
  count: number,
  rng: Rng,
  seed: string,
): Array<Record<string, string | number>> {
  const shape = shapeOf(fields);
  const slug = seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Rotate through the templates so no two rows in a page repeat, and start at
  // a seeded offset so two runs of the same gig do not look identical.
  const identityStart = intBetween(rng, 0, IDENTITIES.length - 1);
  const checkStart = intBetween(rng, 0, CHECKS.length - 1);
  const defectStart = intBetween(rng, 0, DEFECTS.length - 1);

  return Array.from({ length: count }, (_unused, index) => {
    const ctx: RowContext = {
      identity: IDENTITIES[(identityStart + index) % IDENTITIES.length],
      check: CHECKS[(checkStart + index) % CHECKS.length],
      defect: DEFECTS[(defectStart + index) % DEFECTS.length],
      passed: rng() > 0.35,
      evidenceHref: `https://runs.agentdistrict.example/${slug}/evidence-${index + 1}.png`,
      index,
    };
    const row: Record<string, string | number> = {};
    for (const field of fields) row[field.name] = sampleValue(field, rng, ctx, shape);
    return row;
  });
}

function fieldsFromColumns(columns: string[]): ContractField[] {
  return columns.map((name) => ({
    name,
    type: "string" as const,
    description: `Value for ${name}`,
  }));
}

/** Sensible columns per category when nothing else describes the output. */
const CATEGORY_COLUMNS: Record<AgentCategory, string[]> = {
  research: ["business_name", "owner", "phone", "email", "website", "notes"],
  development: ["file", "change", "status"],
  marketing: ["channel", "headline", "body", "cta"],
  home_services: ["address", "owner", "roof_age", "priority_score", "notes"],
  data: ["record_id", "field", "before", "after", "confidence"],
  operations: ["step", "system", "action", "status"],
  creative: ["asset", "format", "dimensions", "notes"],
  entertainment: ["segment", "topic", "duration_sec"],
  finance: ["account", "category", "amount_cents", "date"],
  legal: ["clause", "risk", "recommendation"],
  support: ["ticket", "intent", "resolution", "sentiment"],
};

const CATEGORY_FORMAT: Record<AgentCategory, OutputFormat> = {
  research: "csv",
  development: "markdown",
  marketing: "markdown",
  home_services: "table",
  data: "csv",
  operations: "table",
  creative: "links",
  entertainment: "markdown",
  finance: "table",
  legal: "markdown",
  support: "table",
};

/**
 * The files a development run ships.
 *
 * Only development runs ship files at all: a five-source research brief that
 * claims it delivered `index.html` and `styles.css` is obviously fabricated,
 * and BUILD_SPEC §6 reserves the `files[]` shape for development work.
 */
function filesFor(
  fields: ContractField[],
  rng: Rng,
): Array<{ path: string; language: string; bytes: number }> | undefined {
  const declared = fields
    .filter((field) => /file|path|asset/.test(field.name.toLowerCase()))
    .map((field) => String(field.example ?? "").trim())
    .filter((value) => value.includes("."));

  const paths =
    declared.length > 0
      ? declared.slice(0, 5)
      : ["index.html", "styles.css", "schema.jsonld", "README.md"];

  const languageFor = (path: string): string => {
    const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    if (extension === "ts" || extension === "tsx") return "typescript";
    if (extension === "js" || extension === "jsx") return "javascript";
    if (extension === "md") return "markdown";
    if (extension === "jsonld" || extension === "json") return "json";
    if (extension === "css") return "css";
    if (extension === "html") return "html";
    return "text";
  };

  return paths.map((path) => ({
    path,
    language: languageFor(path),
    bytes: intBetween(rng, 640, 24_000),
  }));
}

/**
 * What a development run says it did to one file.
 *
 * The markdown body used to reuse the generic row template, so a six-page
 * refresh reported one line reading `**change** — Created the record` and
 * `**status** — needs review`, naming a file that was in none of the four
 * attachments. Deriving the verb from the file's own extension keeps the prose
 * and the attachment list the same set, deterministically.
 */
const CHANGE_NOTES: Record<string, readonly string[]> = {
  html: [
    "rebuilt section by section, hero through footer",
    "rewrote the markup and tightened the heading order",
    "replaced the hand-rolled layout with semantic landmarks",
  ],
  css: [
    "restyled against the existing tokens — no new colours",
    "collapsed three overlapping rules into one",
    "added the mobile breakpoint the page was missing",
  ],
  json: [
    "regenerated the structured-data block and validated it",
    "refreshed the schema so every required property is present",
  ],
  markdown: [
    "wrote the handover notes: what changed, and what to check",
    "documented the deploy steps and the rollback",
  ],
  typescript: [
    "typed the data path end to end and removed the casts",
    "extracted the duplicated logic into one helper",
  ],
  javascript: ["tightened the event handlers and dropped the dead branches"],
  text: ["updated in place and re-checked against the brief"],
};

function changeNoteFor(language: string, rng: Rng): string {
  return pick(rng, CHANGE_NOTES[language] ?? CHANGE_NOTES.text);
}

/** Human file size for the change log — the same bytes the file list carries. */
function formatBytes(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}

export type DeliverableInput = {
  order: Order;
  agent: Agent;
  gig?: Gig | null;
  job?: Job | null;
};

/** Rows a simulated run ships: research/data deliver a full 25-row sample. */
function rowCountFor(category: AgentCategory): number {
  return category === "research" || category === "data" ? 25 : 12;
}

/* -------------------------------------------------------------------------- */
/* The generator                                                               */
/* -------------------------------------------------------------------------- */

export type ContractDeliverableInput = {
  /** The output contract to satisfy, when the gig or job publishes one. */
  contract?: OutputContract | null;
  /** Fallback columns (a job's `required_output.columns`). */
  columns?: string[] | null;
  /** Fallback format when there is no contract. */
  format?: OutputFormat | null;
  /** Fallback prose when there is no contract (a job's `notes`). */
  summary?: string | null;
  category: AgentCategory;
  title: string;
  agentName: string;
  agentHandle: string;
  /** Used for links and evidence URLs. */
  slug: string;
  /** Deterministic stream — same seed in, byte-identical deliverable out. */
  rng: Rng;
  seed: string;
  rowCount?: number;
};

/**
 * One generator for both paths: `refreshOrder()` (below) and the seeded orders
 * in `lib/seed/orders.ts`. Keeping two of these is how a seeded QA report ended
 * up filled with roofing-lead phrases.
 */
export function buildContractDeliverable(input: ContractDeliverableInput): OrderOutput {
  const { category, rng, seed } = input;
  const format: OutputFormat =
    input.contract?.format ?? input.format ?? CATEGORY_FORMAT[category];

  const fields: ContractField[] =
    input.contract?.fields && input.contract.fields.length > 0
      ? input.contract.fields
      : fieldsFromColumns(
          input.columns && input.columns.length > 0 ? input.columns : CATEGORY_COLUMNS[category],
        );

  const summary =
    input.contract?.summary ??
    input.summary ??
    `Deliverable produced against the ${input.agentName} output contract.`;

  switch (format) {
    case "csv":
    case "table": {
      const count = input.rowCount ?? rowCountFor(category);
      return {
        format,
        summary: `${summary} ${count} rows delivered by ${input.agentName}.`,
        columns: fields.map((field) => field.name),
        rows: rowsFor(fields, count, rng, seed),
      };
    }
    case "markdown": {
      // Render the *values*, not the field descriptions: a deliverable that
      // reads back the contract is a receipt, not a result.
      const shape = shapeOf(fields);
      const [row] = rowsFor(fields, 1, rng, seed);
      const isDevelopment = category === "development";
      const files = isDevelopment ? filesFor(fields, rng) : undefined;

      // A development run ships files, so its prose is the change log for
      // exactly those files — one bullet per attachment, same set, same order.
      // Anything else describes the values it produced.
      const body =
        files && files.length > 0
          ? [
              "## What changed",
              "",
              ...files.map(
                (file) =>
                  `- \`${file.path}\` — ${changeNoteFor(file.language, rng)} (${formatBytes(
                    file.bytes,
                  )})`,
              ),
            ]
          : [
              "## What was delivered",
              "",
              ...fields.map((field) => `- **${field.name}** — ${row[field.name]}`),
            ];

      return {
        format: "markdown",
        summary,
        markdown: [
          `# ${headline(input.title)}`,
          "",
          `Delivered by **${input.agentName}** (@${input.agentHandle}) — simulated run.`,
          "",
          ...body,
          "",
          "## Notes",
          "",
          summary,
          shape.issueLike
            ? ""
            : files && files.length > 0
              ? "Every file above is attached to this run."
              : "Every value above was produced against the published output contract.",
        ]
          .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
          .join("\n"),
        ...(files ? { files } : {}),
      };
    }
    case "json": {
      const [row] = rowsFor(fields, 1, rng, seed);
      return { format: "json", summary, json: row };
    }
    case "links":
    default: {
      return {
        format: "links",
        summary,
        links: fields.slice(0, 4).map((field, index) => ({
          label: field.name,
          href: `https://cdn.agentdistrict.example/${input.slug}/${index + 1}`,
        })),
      };
    }
  }
}

export function buildDeliverable({ order, agent, gig, job }: DeliverableInput): OrderOutput {
  const seed = `run:${order.id}`;
  return buildContractDeliverable({
    contract: gig?.output_contract ?? null,
    columns: job?.required_output.columns ?? null,
    format: job?.required_output.format ?? null,
    summary: job?.required_output.notes ?? null,
    category: gig?.category ?? job?.category ?? agent.category,
    title: gig?.title ?? job?.title ?? `${agent.name} run`,
    agentName: agent.name,
    agentHandle: agent.handle,
    slug: gig?.slug ?? agent.handle,
    rng: rngFor(seed),
    seed: order.id,
  });
}
