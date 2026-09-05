import type {
  Agent,
  AgentCategory,
  ContractField,
  Gig,
  Job,
  Order,
  OrderOutput,
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
 */

const FL_ADDRESSES = [
  "1234 Palm Dr, Orlando, FL",
  "88 SE Ocean Blvd, Stuart, FL",
  "410 Beachland Blvd, Vero Beach, FL",
  "2200 N US-1, Fort Pierce, FL",
  "915 Village Green Dr, Port St. Lucie, FL",
  "77 Bayshore Blvd, Tampa, FL",
  "3400 Curry Ford Rd, Orlando, FL",
  "620 Malabar Rd, Palm Bay, FL",
];

const BUSINESSES = [
  "Coastal Gutter Works",
  "Treasure Coast Roofing",
  "Sunshine Pool Care",
  "Palm City HVAC",
  "Indian River Landscaping",
  "Riverside Plumbing",
  "Blue Heron Electric",
  "Vero Home Services",
  "Space Coast Windows",
  "Bayshore Pressure Washing",
];

const PEOPLE = [
  "Dana Whitfield",
  "Marcus Reyes",
  "Priya Raman",
  "Tom Callahan",
  "Alicia Braun",
  "Rick Santoro",
  "Nina Alvarez",
  "Grant Mosley",
];

const PHRASES = [
  "Verified against two independent sources",
  "Matched on address and phone",
  "Owner confirmed by public filing",
  "Flagged for manual review",
  "High intent — recent permit activity",
  "Listed but not currently advertising",
];

function phoneNumber(rng: Rng): string {
  return `(${intBetween(rng, 305, 954)}) ${intBetween(rng, 200, 999)}-${String(
    intBetween(rng, 1000, 9999),
  )}`;
}

function isoDate(rng: Rng): string {
  const month = String(intBetween(rng, 1, 12)).padStart(2, "0");
  const day = String(intBetween(rng, 1, 28)).padStart(2, "0");
  return `2026-${month}-${day}`;
}

/** A plausible value for a contract field, chosen deterministically. */
function sampleValue(field: ContractField, rng: Rng): string | number {
  const name = field.name.toLowerCase();
  if (field.options && field.options.length > 0) return pick(rng, field.options);
  if (name.includes("address")) return pick(rng, FL_ADDRESSES);
  if (name.includes("business") || name.includes("company") || name.includes("name")) {
    return pick(rng, BUSINESSES);
  }
  if (name.includes("phone")) return phoneNumber(rng);
  if (name.includes("email")) {
    const business = pick(rng, BUSINESSES);
    return `office@${business.toLowerCase().replace(/[^a-z]+/g, "")}.com`;
  }
  if (name.includes("website") || name.includes("url") || name.includes("link")) {
    return `https://${pick(rng, BUSINESSES).toLowerCase().replace(/[^a-z]+/g, "")}.com`;
  }
  if (name.includes("owner") || name.includes("contact") || name.includes("inspector")) {
    return pick(rng, PEOPLE);
  }
  if (name.includes("date") || name.includes("issued")) return isoDate(rng);
  if (name.includes("confidence") || name.includes("accuracy")) {
    return round(0.82 + rng() * 0.17, 3);
  }
  if (name.includes("score") || name.includes("priority")) return intBetween(rng, 41, 98);
  if (name.includes("count") || name.includes("households")) return intBetween(rng, 12, 4800);
  if (name.includes("cents") || name.includes("amount") || name.includes("price")) {
    return intBetween(rng, 1200, 480000);
  }
  if (field.type === "number") return intBetween(rng, 1, 240);
  if (field.type === "boolean") return rng() > 0.75 ? "true" : "false";
  return pick(rng, PHRASES);
}

function rowsFor(
  fields: ContractField[],
  count: number,
  rng: Rng,
): Array<Record<string, string | number>> {
  return Array.from({ length: count }, () => {
    const row: Record<string, string | number> = {};
    for (const field of fields) row[field.name] = sampleValue(field, rng);
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

export function buildDeliverable({ order, agent, gig, job }: DeliverableInput): OrderOutput {
  const rng = rngFor(`run:${order.id}`);
  const category = gig?.category ?? job?.category ?? agent.category;

  const format: OutputFormat =
    gig?.output_contract.format ?? job?.required_output.format ?? CATEGORY_FORMAT[category];

  const fields: ContractField[] =
    gig?.output_contract.fields && gig.output_contract.fields.length > 0
      ? gig.output_contract.fields
      : fieldsFromColumns(
          job?.required_output.columns && job.required_output.columns.length > 0
            ? job.required_output.columns
            : CATEGORY_COLUMNS[category],
        );

  const title = gig?.title ?? job?.title ?? `${agent.name} run`;
  const contractSummary =
    gig?.output_contract.summary ??
    job?.required_output.notes ??
    `Deliverable produced against the ${agent.name} output contract.`;

  switch (format) {
    case "csv":
    case "table": {
      const count = rowCountFor(category);
      return {
        format,
        summary: `${contractSummary} ${count} rows delivered by ${agent.name}.`,
        columns: fields.map((field) => field.name),
        rows: rowsFor(fields, count, rng),
      };
    }
    case "markdown": {
      return {
        format: "markdown",
        summary: contractSummary,
        markdown: [
          `# ${title.replace(/^I will /, "")}`,
          "",
          `Delivered by **${agent.name}** (@${agent.handle}) — simulated run.`,
          "",
          "## What was done",
          "",
          ...fields.map((field) => `- **${field.name}** — ${field.description}`),
          "",
          "## Notes",
          "",
          contractSummary,
        ].join("\n"),
        files: [
          { path: "index.html", language: "html", bytes: 18422 },
          { path: "styles.css", language: "css", bytes: 6140 },
          { path: "schema.jsonld", language: "json", bytes: 2088 },
          { path: "README.md", language: "markdown", bytes: 1204 },
        ],
      };
    }
    case "json": {
      const payload: Record<string, string | number> = {};
      for (const field of fields) payload[field.name] = sampleValue(field, rng);
      return { format: "json", summary: contractSummary, json: payload };
    }
    case "links":
    default: {
      const slug = gig?.slug ?? agent.handle;
      return {
        format: "links",
        summary: contractSummary,
        links: fields.slice(0, 4).map((field, index) => ({
          label: field.name,
          href: `https://cdn.agentdistrict.example/${slug}/${index + 1}`,
        })),
      };
    }
  }
}
