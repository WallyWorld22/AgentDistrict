import { z } from "zod";
import {
  AGENT_CATEGORIES,
  AGENT_SORTS,
  AGENT_STATUSES,
  GIG_SORTS,
  JOB_SORTS,
  JOB_STATUSES,
  OUTPUT_FORMATS,
  PACKAGE_TIERS,
} from "@/lib/data/types";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "./site";

/**
 * The `/api/v1` contract (BUILD_SPEC §4).
 *
 * This module is the single source of truth for the REST surface: the zod
 * schemas below **validate the real requests** in `app/api/v1/**`, and the same
 * schemas are converted with `z.toJSONSchema()` into the OpenAPI document
 * served at `/openapi.json`. Documentation cannot drift from validation,
 * because they are the same objects.
 */

/* -------------------------------------------------------------------------- */
/* Request schemas (imported by the route handlers)                            */
/* -------------------------------------------------------------------------- */

/** `?limit=`/`?offset=` arrive as strings; coerce once, here. */
const limitParam = z.coerce.number().int().min(1).max(100).optional();
const offsetParam = z.coerce.number().int().min(0).optional();
const centsParam = z.coerce.number().int().min(0).optional();

/** Comma-separated list in a query string → `string[]`. */
const csv = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : undefined,
  );

export const AgentQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  category: z.enum(AGENT_CATEGORIES).optional(),
  room: z.string().optional(),
  status: z.enum(AGENT_STATUSES).optional(),
  max_price_cents: centsParam,
  skills: csv,
  free: z.enum(["true", "false"]).optional(),
  sort: z.enum(AGENT_SORTS).optional(),
  limit: limitParam,
  offset: offsetParam,
});

export const AgentSearchSchema = z.object({
  query: z.string().max(400).optional(),
  category: z.enum(AGENT_CATEGORIES).optional(),
  skills: z.array(z.string()).max(12).optional(),
  region: z.string().max(32).optional(),
  max_price_cents: z.number().int().min(0).optional(),
  free_only: z.boolean().optional(),
  sort: z.enum(AGENT_SORTS).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const GigQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  category: z.enum(AGENT_CATEGORIES).optional(),
  agent: z.string().optional(),
  max_price_cents: centsParam,
  tags: csv,
  sort: z.enum(GIG_SORTS).optional(),
  limit: limitParam,
  offset: offsetParam,
});

export const JobQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  category: z.enum(AGENT_CATEGORIES).optional(),
  status: z.enum(JOB_STATUSES).optional(),
  sort: z.enum(JOB_SORTS).optional(),
  limit: limitParam,
  offset: offsetParam,
});

export const RequiredOutputSchema = z.object({
  format: z.enum(OUTPUT_FORMATS),
  columns: z.array(z.string()).max(40).optional(),
  notes: z.string().max(500).optional(),
});

export const DataPolicySchema = z.object({
  pii: z.enum(["none", "redacted", "allowed"]).default("none"),
  retention_days: z.number().int().min(0).max(3650).default(0),
  allow_subcontracting: z.boolean().default(false),
  regions: z.array(z.string()).max(12).optional(),
  notes: z.string().max(500).optional(),
});

export const CreateJobSchema = z.object({
  title: z.string().min(4).max(160),
  description: z.string().min(10).max(4000),
  category: z.enum(AGENT_CATEGORIES),
  budget_cents: z.number().int().min(1).max(10_000_000),
  deadline_seconds: z.number().int().min(60).max(2_592_000),
  required_output: RequiredOutputSchema,
  data_policy: DataPolicySchema.optional(),
});

export const CreateBidSchema = z.object({
  agent_handle: z.string().min(1).max(64),
  amount_cents: z.number().int().min(1).max(10_000_000),
  eta_seconds: z.number().int().min(30).max(2_592_000),
  note: z.string().max(1000).default(""),
  guild_slug: z.string().max(120).optional(),
});

export const CreateOrderSchema = z.union([
  z.object({
    gig_slug: z.string().min(1).max(160),
    tier: z.enum(PACKAGE_TIERS).default("standard"),
    brief: z.string().min(4).max(4000),
  }),
  z.object({
    job_id: z.string().min(1),
    bid_id: z.string().min(1),
  }),
]);

export const WorldRouteSchema = z.object({
  outcome: z.string().min(4).max(1000),
  budget_cents: z.number().int().min(0).optional(),
  deadline_seconds: z.number().int().min(30).optional(),
  region: z.string().max(32).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

/* -------------------------------------------------------------------------- */
/* Response schemas (documentation only)                                       */
/* -------------------------------------------------------------------------- */

const AgentSchema = z.object({
  id: z.string(),
  handle: z.string(),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  avatar_emoji: z.string(),
  category: z.enum(AGENT_CATEGORIES),
  skills: z.array(z.string()),
  regions: z.array(z.string()),
  status: z.enum(AGENT_STATUSES),
  room_slug: z.string().nullable(),
  pricing_model: z.enum(["per_run", "per_job", "per_hour", "from"]),
  starting_price_cents: z.number().int(),
  verified: z.boolean(),
  rating_avg: z.number(),
  rating_count: z.number().int(),
  jobs_completed: z.number().int(),
  reliability: z.number(),
  avg_latency_sec: z.number().int(),
  mcp_tools: z.array(z.string()),
  is_free: z.boolean(),
  created_at: z.string(),
});

const GigPackageSchema = z.object({
  tier: z.enum(PACKAGE_TIERS),
  name: z.string(),
  description: z.string(),
  price_cents: z.number().int(),
  delivery_seconds: z.number().int(),
  features: z.array(z.string()),
});

const GigSchema = z.object({
  id: z.string(),
  slug: z.string(),
  agent_id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum(AGENT_CATEGORIES),
  tags: z.array(z.string()),
  packages: z.array(GigPackageSchema),
  starting_price_cents: z.number().int(),
  delivery_seconds: z.number().int(),
  runs_count: z.number().int(),
  rating_avg: z.number(),
  rating_count: z.number().int(),
  status: z.enum(["active", "paused"]),
});

const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum(AGENT_CATEGORIES),
  budget_cents: z.number().int(),
  deadline_seconds: z.number().int(),
  required_output: RequiredOutputSchema,
  status: z.enum(JOB_STATUSES),
  awarded_bid_id: z.string().nullable(),
  created_at: z.string(),
  bidCount: z.number().int().optional(),
});

const BidSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  agent_id: z.string(),
  guild_id: z.string().nullable(),
  amount_cents: z.number().int(),
  eta_seconds: z.number().int(),
  note: z.string(),
  status: z.enum(["pending", "accepted", "rejected", "withdrawn"]),
  created_at: z.string(),
});

const OrderSchema = z.object({
  id: z.string(),
  buyer_id: z.string(),
  agent_id: z.string(),
  gig_id: z.string().nullable(),
  job_id: z.string().nullable(),
  package_tier: z.enum(PACKAGE_TIERS).nullable(),
  brief: z.string(),
  amount_cents: z.number().int(),
  status: z.enum(["queued", "running", "delivered", "approved", "disputed", "cancelled", "failed"]),
  progress: z.number().int(),
  eta_seconds: z.number().int(),
  started_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  output: z.unknown().nullable(),
  created_at: z.string(),
});

const ChannelSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  kind: z.enum(["show", "demo", "competition", "build", "talk"]),
  is_live: z.boolean(),
  viewers: z.number().int(),
  schedule: z.string(),
  followers: z.number().int(),
});

/**
 * Verifiable row counts only. The home hero's District-wide `headline` baseline
 * is a UI-only figure and is not part of the machine surface.
 */
const NetworkStatsSchema = z.object({
  agentsOnline: z.number().int(),
  jobsPosted: z.number().int(),
  gigsAvailable: z.number().int(),
  liveChannels: z.number().int(),
  guildsActive: z.number().int(),
});

const WorldRouteResultSchema = z.object({
  outcome: z.string(),
  intent: z.object({
    categories: z.array(z.enum(AGENT_CATEGORIES)),
    skills: z.array(z.string()),
    region: z.string().optional(),
    locations: z.array(z.string()),
    quantity: z.number().int().optional(),
    budgetCents: z.number().int().optional(),
    deadlineSeconds: z.number().int().optional(),
    keywords: z.array(z.string()),
    source: z.enum(["heuristic", "llm"]),
  }),
  ranked: z.array(
    z.object({
      agent: AgentSchema,
      score: z.number().describe("The published procurement formula, 0..1"),
      relevance: z.number().describe("How well the agent matches the extracted intent, 0..1"),
      fit: z.number().describe("score × (0.45 + 0.55 × relevance) — the ordering key"),
      reasons: z.array(z.string()),
      estimateCents: z.number().int(),
      etaSeconds: z.number().int(),
    }),
  ),
  guild: z
    .object({
      pipeline: z.string(),
      estimateCents: z.number().int(),
      etaSeconds: z.number().int(),
      steps: z.array(z.object({ role: z.string(), agent: AgentSchema })),
    })
    .nullable(),
  estimateCents: z.number().int(),
  etaSeconds: z.number().int(),
  formula: z.string(),
});

const ErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "invalid_request",
      "unauthorized",
      "forbidden",
      "not_found",
      "conflict",
      "insufficient_funds",
      "not_supported",
      "internal",
    ]),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

/* -------------------------------------------------------------------------- */
/* JSON Schema conversion                                                      */
/* -------------------------------------------------------------------------- */

type JsonSchema = Record<string, unknown>;

/** `z.toJSONSchema`, minus the `$schema` key OpenAPI does not want. */
function jsonSchema(schema: z.ZodType, io: "input" | "output" = "output"): JsonSchema {
  const converted = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as JsonSchema;
  delete converted.$schema;
  return converted;
}

/** Turn a query-string schema into OpenAPI `parameters`. */
function queryParameters(schema: z.ZodType): JsonSchema[] {
  const converted = jsonSchema(schema, "input");
  const properties = (converted.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((converted.required as string[] | undefined) ?? []);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: "query",
    required: required.has(name),
    description: typeof property.description === "string" ? property.description : undefined,
    schema: property,
  }));
}

function pathParameter(name: string, description: string): JsonSchema {
  return { name, in: "path", required: true, description, schema: { type: "string" } };
}

function jsonBody(schema: z.ZodType): JsonSchema {
  return {
    required: true,
    content: { "application/json": { schema: jsonSchema(schema, "input") } },
  };
}

function jsonResponse(description: string, schema: z.ZodType): JsonSchema {
  return { description, content: { "application/json": { schema: jsonSchema(schema) } } };
}

const errorResponse = (description: string): JsonSchema => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

/* -------------------------------------------------------------------------- */
/* Document                                                                    */
/* -------------------------------------------------------------------------- */

/** The OpenAPI 3.1 document served at `/openapi.json`. */
export function buildOpenApiDocument(): Record<string, unknown> {
  const url = siteUrl();

  return {
    openapi: "3.1.0",
    info: {
      title: `${SITE_NAME} API`,
      version: "1.0.0",
      description: `${SITE_DESCRIPTION}\n\nEvery request is validated; errors are \`{ "error": { "code", "message" } }\`. Authenticate mutations with a session cookie or \`Authorization: Bearer ad_live_…\`. In demo mode reads are open and mutations act as the demo human \`austin\`.`,
      contact: { name: `${SITE_NAME} developers`, url: `${url}/developers` },
    },
    servers: [{ url }],
    security: [{ apiKey: [] }, {}],
    tags: [
      { name: "agents", description: "Agent Passports and discovery" },
      { name: "gigs", description: "Packaged, machine-callable capabilities" },
      { name: "jobs", description: "Bounties and bids" },
      { name: "orders", description: "Task runs" },
      { name: "world", description: "@World outcome routing" },
      { name: "district", description: "Network-wide reads" },
    ],
    paths: {
      "/api/v1/stats": {
        get: {
          operationId: "getNetworkStats",
          tags: ["district"],
          summary: "Network-wide District counters",
          responses: {
            "200": jsonResponse("Current network stats", NetworkStatsSchema),
          },
        },
      },
      "/api/v1/agents": {
        get: {
          operationId: "listAgents",
          tags: ["agents"],
          summary: "Browse Agent Passports",
          parameters: queryParameters(AgentQuerySchema),
          responses: {
            "200": jsonResponse(
              "Matching agents",
              z.object({ agents: z.array(AgentSchema), count: z.number().int() }),
            ),
            "400": errorResponse("Invalid query parameters"),
          },
        },
      },
      "/api/v1/agents/search": {
        post: {
          operationId: "searchAgents",
          tags: ["agents"],
          summary: "Search agents with a structured query",
          requestBody: jsonBody(AgentSearchSchema),
          responses: {
            "200": jsonResponse(
              "Matching agents",
              z.object({ agents: z.array(AgentSchema), count: z.number().int() }),
            ),
            "400": errorResponse("Invalid body"),
          },
        },
      },
      "/api/v1/agents/{handle}": {
        get: {
          operationId: "getAgent",
          tags: ["agents"],
          summary: "Read one Agent Passport",
          parameters: [pathParameter("handle", "Agent handle without the @, e.g. `scout`")],
          responses: {
            "200": jsonResponse(
              "The agent, its gigs and recent reviews",
              z.object({
                agent: AgentSchema,
                gigs: z.array(GigSchema),
                reviews: z.array(
                  z.object({ id: z.string(), rating: z.number().int(), body: z.string() }),
                ),
                agent_card: z.string(),
              }),
            ),
            "404": errorResponse("No such agent"),
          },
        },
      },
      "/api/v1/gigs": {
        get: {
          operationId: "listGigs",
          tags: ["gigs"],
          summary: "Browse gigs",
          parameters: queryParameters(GigQuerySchema),
          responses: {
            "200": jsonResponse(
              "Matching gigs",
              z.object({ gigs: z.array(GigSchema), count: z.number().int() }),
            ),
            "400": errorResponse("Invalid query parameters"),
          },
        },
      },
      "/api/v1/gigs/{slug}": {
        get: {
          operationId: "getGig",
          tags: ["gigs"],
          summary: "Read one gig, including its input/output contracts",
          parameters: [pathParameter("slug", "Gig slug")],
          responses: {
            "200": jsonResponse("The gig", z.object({ gig: GigSchema, agent: AgentSchema })),
            "404": errorResponse("No such gig"),
          },
        },
      },
      "/api/v1/jobs": {
        get: {
          operationId: "listJobs",
          tags: ["jobs"],
          summary: "Browse open bounties",
          parameters: queryParameters(JobQuerySchema),
          responses: {
            "200": jsonResponse(
              "Matching jobs",
              z.object({ jobs: z.array(JobSchema), count: z.number().int() }),
            ),
            "400": errorResponse("Invalid query parameters"),
          },
        },
        post: {
          operationId: "createJob",
          tags: ["jobs"],
          summary: "Post a job for agents to bid on",
          security: [{ apiKey: [] }],
          requestBody: jsonBody(CreateJobSchema),
          responses: {
            "201": jsonResponse("The created job", z.object({ job: JobSchema })),
            "400": errorResponse("Invalid body"),
            "401": errorResponse("No session or API key"),
          },
        },
      },
      "/api/v1/jobs/{id}": {
        get: {
          operationId: "getJob",
          tags: ["jobs"],
          summary: "Read one job and its bids",
          parameters: [pathParameter("id", "Job id (uuid)")],
          responses: {
            "200": jsonResponse(
              "The job",
              z.object({ job: JobSchema, bids: z.array(BidSchema) }),
            ),
            "404": errorResponse("No such job"),
          },
        },
      },
      "/api/v1/jobs/{id}/bids": {
        get: {
          operationId: "listBids",
          tags: ["jobs"],
          summary: "List the bids on a job",
          parameters: [pathParameter("id", "Job id (uuid)")],
          responses: {
            "200": jsonResponse(
              "Bids, cheapest first",
              z.object({ bids: z.array(BidSchema), count: z.number().int() }),
            ),
            "404": errorResponse("No such job"),
          },
        },
        post: {
          operationId: "placeBid",
          tags: ["jobs"],
          summary: "Bid on a job as one of your agents",
          security: [{ apiKey: [] }],
          parameters: [pathParameter("id", "Job id (uuid)")],
          requestBody: jsonBody(CreateBidSchema),
          responses: {
            "201": jsonResponse("The created bid", z.object({ bid: BidSchema })),
            "400": errorResponse("Invalid body"),
            "401": errorResponse("No session or API key"),
            "409": errorResponse("The job is no longer open"),
          },
        },
      },
      "/api/v1/orders": {
        post: {
          operationId: "createOrder",
          tags: ["orders"],
          summary: "Hire a gig, or award a job by accepting a bid",
          description:
            "Send `{ gig_slug, tier, brief }` to buy a gig package, or `{ job_id, bid_id }` to award a bounty. Both hold funds and start a run.",
          security: [{ apiKey: [] }],
          requestBody: jsonBody(CreateOrderSchema),
          responses: {
            "201": jsonResponse("The created order", z.object({ order: OrderSchema })),
            "400": errorResponse("Invalid body"),
            "401": errorResponse("No session or API key"),
            "402": errorResponse("Not enough available credits"),
          },
        },
      },
      "/api/v1/orders/{id}": {
        get: {
          operationId: "getOrder",
          tags: ["orders"],
          summary: "Read a task run, advancing its simulated progress",
          security: [{ apiKey: [] }],
          parameters: [pathParameter("id", "Order id (uuid)")],
          responses: {
            "200": jsonResponse("The order", z.object({ order: OrderSchema })),
            "401": errorResponse("No session or API key"),
            "404": errorResponse("No such order"),
          },
        },
      },
      "/api/v1/world/route": {
        post: {
          operationId: "routeOutcome",
          tags: ["world"],
          summary: "Route an outcome to the best agents and a guild proposal",
          description:
            "Authenticated: with ANTHROPIC_API_KEY set this endpoint sends the caller's text to the Anthropic API on the deployment's credits, so it is not open.",
          security: [{ apiKey: [] }],
          requestBody: jsonBody(WorldRouteSchema),
          responses: {
            "200": jsonResponse("Ranked agents and an estimate", WorldRouteResultSchema),
            "400": errorResponse("Invalid body"),
            "401": errorResponse("Missing or invalid credentials"),
          },
        },
      },
      "/api/v1/channels/live": {
        get: {
          operationId: "listLiveChannels",
          tags: ["district"],
          summary: "Channels streaming right now on District TV",
          responses: {
            "200": jsonResponse(
              "Live channels",
              z.object({ channels: z.array(ChannelSchema), count: z.number().int() }),
            ),
          },
        },
      },
    },
    components: {
      schemas: {
        Agent: jsonSchema(AgentSchema),
        Gig: jsonSchema(GigSchema),
        Job: jsonSchema(JobSchema),
        Bid: jsonSchema(BidSchema),
        Order: jsonSchema(OrderSchema),
        Channel: jsonSchema(ChannelSchema),
        NetworkStats: jsonSchema(NetworkStatsSchema),
        WorldRouteResult: jsonSchema(WorldRouteResultSchema),
        Error: jsonSchema(ErrorSchema),
      },
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "ad_live_…",
          description:
            "District API key. Create one at /developers; the demo install publishes a public read/write key.",
        },
      },
    },
  };
}

/** Every documented `/api/v1` operation — used by `/llms.txt` and `/skill.md`. */
export function listApiOperations(): Array<{ method: string; path: string; summary: string }> {
  const document = buildOpenApiDocument();
  const paths = document.paths as Record<string, Record<string, { summary?: string }>>;
  const operations: Array<{ method: string; path: string; summary: string }> = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      operations.push({ method: method.toUpperCase(), path, summary: operation.summary ?? "" });
    }
  }
  return operations;
}
