/**
 * Pure helpers for the Gigs + Orders surfaces.
 *
 * Everything here is composed from methods that already exist on the
 * `Repository` — no adapter is imported and no new data access is invented, so
 * both data modes behave identically. `Repository` is imported **type-only** so
 * this module stays safe to pull into a client bundle (the deliverable
 * serialisers below are used by a `"use client"` download button).
 */

import type { Repository } from "@/lib/data/repository";
import { AGENT_CATEGORIES } from "@/lib/data/types";
import type {
  AgentCategory,
  Cents,
  ContractField,
  GigSort,
  GigWithAgent,
  Handle,
  Order,
  OrderDetail,
  OrderOutput,
  OrderStatus,
  PackageTier,
  Slug,
} from "@/lib/data/types";

/* ------------------------------------------------------------ gig authoring */

/**
 * The `type` values a contract field can take.
 *
 * `lib/data/types.ts` declares them as an inline union on `ContractField`, so
 * this is the runtime list the publish form's selects and the publish action's
 * zod schema both read from. Keep it in sync with `ContractField["type"]` — the
 * satisfies clause below fails `npm run typecheck` if it drifts.
 */
export const CONTRACT_FIELD_TYPES = [
  "string",
  "number",
  "boolean",
  "enum",
  "url",
  "email",
  "array",
  "object",
] as const satisfies ReadonlyArray<ContractField["type"]>;

export type ContractFieldType = (typeof CONTRACT_FIELD_TYPES)[number];

/** One editable row of the publish form's contract builder. */
export type ContractFieldDraft = {
  name: string;
  type: ContractFieldType;
  required: boolean;
  description: string;
};

export function emptyContractField(): ContractFieldDraft {
  return { name: "", type: "string", required: false, description: "" };
}

/* -------------------------------------------------------------------- browse */

/** How many gig tiles one page of `/gigs` shows before "Load more". */
export const GIGS_PER_PAGE = 12;

/** The sort control on `/gigs` (BUILD_SPEC §4). */
export const GIG_SORT_OPTIONS: Array<{ value: GigSort; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "rating", label: "Top rated" },
  { value: "price", label: "Price: low → high" },
  { value: "fastest", label: "Fastest delivery" },
  { value: "newest", label: "Newest" },
];

/** The max-price filter. `""` means "any price". */
export const GIG_PRICE_CEILINGS: Array<{ value: string; label: string }> = [
  { value: "", label: "Any price" },
  { value: "100", label: "Under $1" },
  { value: "500", label: "Under $5" },
  { value: "2000", label: "Under $20" },
  { value: "10000", label: "Under $100" },
];

export type GigBrowseQuery = {
  q?: string;
  category?: AgentCategory;
  /** Only this agent's gigs — the semantic URL `hireHref()` falls back to. */
  agentHandle?: Handle;
  sort?: GigSort;
  maxPriceCents?: Cents;
  /** 1-based. Page N returns N × `perPage` tiles ("Load more" accumulates). */
  page?: number;
  perPage?: number;
};

export type GigBrowseResult = {
  gigs: GigWithAgent[];
  /** Gigs matching the search + price filter, keyed by category. */
  counts: Record<string, number>;
  /** Matching the search + price filter, ignoring the category chip. */
  totalAcrossCategories: number;
  /** Matching every active filter. */
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
};

/**
 * One page of `/gigs`, plus the per-category counts the chips render.
 *
 * The counts go through `countGigs`, which is a `count: exact, head: true`
 * query in Supabase mode — no rows cross the wire for the twelve chips. The
 * grid itself is one sorted, paginated read. Paging is cumulative (page 3
 * returns 36 tiles) so "Load more" is a plain link and the URL stays shareable.
 */
export async function browseGigs(
  repo: Repository,
  query: GigBrowseQuery = {},
): Promise<GigBrowseResult> {
  const perPage = query.perPage ?? GIGS_PER_PAGE;
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const window = perPage * page;

  const base = {
    q: query.q,
    agentHandle: query.agentHandle,
    maxPriceCents: query.maxPriceCents,
  };

  const [totalAcrossCategories, categoryCounts, rows] = await Promise.all([
    repo.countGigs(base),
    Promise.all(
      AGENT_CATEGORIES.map(async (category) => [
        category,
        await repo.countGigs({ ...base, category }),
      ] as const),
    ),
    repo.listGigs({
      ...base,
      category: query.category,
      sort: query.sort ?? "trending",
      // One extra row tells us whether another page exists.
      limit: window + 1,
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const [category, count] of categoryCounts) {
    if (count > 0) counts[category] = count;
  }

  const hasMore = rows.length > window;
  const gigs = hasMore ? rows.slice(0, window) : rows;
  const total = query.category ? (counts[query.category] ?? 0) : totalAcrossCategories;

  return {
    gigs,
    counts,
    totalAcrossCategories,
    total,
    page,
    perPage,
    hasMore,
  };
}

/** Other live gigs by the same agent, newest-run-first, excluding `slug`. */
export async function moreFromAgent(
  repo: Repository,
  handle: Handle,
  excludeSlug: Slug,
  limit = 3,
): Promise<GigWithAgent[]> {
  const gigs = await repo.listGigs({ agentHandle: handle, limit: limit + 4 });
  return gigs.filter((gig) => gig.slug !== excludeSlug).slice(0, limit);
}

/* ------------------------------------------------------------ machine block */

/** `curl` for `POST /api/v1/orders` against this gig. */
export function orderGigCurl(
  origin: string,
  slug: Slug,
  tier: PackageTier,
  brief: string,
): string {
  // The field names are the contract in `lib/openapi.ts` — `gig_slug`, not
  // `gig`. A snippet that 400s is worse than no snippet.
  const body = JSON.stringify({ gig_slug: slug, tier, brief }, null, 2)
    .split("\n")
    .join("\n        ");
  return [
    `curl -X POST ${origin}/api/v1/orders \\`,
    `  -H "Authorization: Bearer $AGENTDISTRICT_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${body}'`,
  ].join("\n");
}

/**
 * The MCP `hire_agent` call an agent client would make for this gig.
 *
 * The argument names mirror the tool's own `inputSchema` exactly — `gig_slug`,
 * `tier`, `brief`, and no `agent` key (the gig names its agent).
 */
export function hireAgentMcpSnippet(slug: Slug, tier: PackageTier, brief: string): string {
  return JSON.stringify(
    {
      tool: "hire_agent",
      arguments: { gig_slug: slug, tier, brief },
    },
    null,
    2,
  );
}

/* -------------------------------------------------------------------- orders */

export const ORDER_FILTERS = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "delivered", label: "Delivered" },
  { value: "approved", label: "Approved" },
  // The bucket has always held `disputed | cancelled | failed`; now that the
  // seed exercises all three, "Disputed" was the wrong name for a chip that
  // counts two refunded runs and no dispute. Every run in it got its hold back.
  { value: "disputed", label: "Refunded" },
] as const;

export type OrderFilterValue = (typeof ORDER_FILTERS)[number]["value"];

/** `running` on the chips means "in flight" — queued runs belong there too. */
export function matchesOrderFilter(order: Order, filter: OrderFilterValue): boolean {
  switch (filter) {
    case "all":
      return true;
    case "running":
      return order.status === "running" || order.status === "queued";
    case "delivered":
      return order.status === "delivered";
    case "approved":
      return order.status === "approved";
    case "disputed":
      return (
        order.status === "disputed" ||
        order.status === "cancelled" ||
        order.status === "failed"
      );
  }
}

export type OrderBuckets = {
  /** Delivered — the buyer's credits are still held pending approval. */
  awaiting: OrderDetail[];
  /** Queued or running. */
  active: OrderDetail[];
  /** One count per status chip, including `all`. */
  counts: Record<OrderFilterValue, number>;
};

/** Split a buyer's runs into the groups `/orders` renders. */
export function bucketOrders(orders: OrderDetail[]): OrderBuckets {
  const counts = {
    all: orders.length,
    running: 0,
    delivered: 0,
    approved: 0,
    disputed: 0,
  } as Record<OrderFilterValue, number>;

  for (const order of orders) {
    for (const filter of ORDER_FILTERS) {
      if (filter.value !== "all" && matchesOrderFilter(order, filter.value)) {
        counts[filter.value] += 1;
      }
    }
  }

  return {
    awaiting: orders.filter((order) => order.status === "delivered"),
    active: orders.filter(
      (order) => order.status === "queued" || order.status === "running",
    ),
    counts,
  };
}

/** Ordered stops of the run timeline; the last one depends on the outcome. */
export type TimelineStop = {
  key: string;
  label: string;
  state: "done" | "current" | "pending" | "failed";
};

export function orderTimeline(status: OrderStatus): TimelineStop[] {
  const rank: Record<OrderStatus, number> = {
    queued: 0,
    running: 1,
    delivered: 2,
    approved: 3,
    disputed: 3,
    cancelled: 3,
    failed: 2,
  };
  const at = rank[status];
  const finalLabel =
    status === "disputed"
      ? "Disputed"
      : status === "cancelled"
        ? "Cancelled"
        : status === "failed"
          ? "Failed"
          : "Approved";
  const failed = status === "disputed" || status === "cancelled" || status === "failed";

  const stops: Array<{ key: string; label: string; index: number }> = [
    { key: "queued", label: "Queued", index: 0 },
    { key: "running", label: "Running", index: 1 },
    { key: "delivered", label: "Delivered", index: 2 },
    { key: "final", label: finalLabel, index: 3 },
  ];

  return stops.map(({ key, label, index }) => {
    if (status === "failed" && key === "delivered") {
      return { key, label: "Failed", state: "failed" as const };
    }
    if (index < at) return { key, label, state: "done" as const };
    if (index === at) {
      return { key, label, state: failed ? ("failed" as const) : ("current" as const) };
    }
    return { key, label, state: "pending" as const };
  });
}

/* -------------------------------------------------------- deliverable export */

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serialise a run's deliverable to the text its `format` implies. */
export function serializeDeliverable(output: OrderOutput): {
  text: string;
  mime: string;
  extension: string;
} {
  if (output.rows && output.rows.length > 0) {
    const columns = output.columns ?? Object.keys(output.rows[0]);
    const lines = [
      columns.map(csvCell).join(","),
      ...output.rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
    ];
    return { text: lines.join("\n"), mime: "text/csv", extension: "csv" };
  }
  if (output.markdown) {
    return { text: output.markdown, mime: "text/markdown", extension: "md" };
  }
  if (output.links && output.links.length > 0 && !output.json && !output.files) {
    return {
      text: output.links.map((link) => `- [${link.label}](${link.href})`).join("\n"),
      mime: "text/markdown",
      extension: "md",
    };
  }
  return {
    text: JSON.stringify(output.json ?? output, null, 2),
    mime: "application/json",
    extension: "json",
  };
}

/** `agentdistrict-run-<short id>.csv` — stable, no timestamps. */
export function deliverableFilename(orderId: string, extension: string): string {
  return `agentdistrict-run-${orderId.slice(0, 8)}.${extension}`;
}
