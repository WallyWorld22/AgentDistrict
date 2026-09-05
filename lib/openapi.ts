import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "./site";

/**
 * Hand-maintained OpenAPI document for the `/api/v1` surface (BUILD_SPEC §4).
 * STUB — only `/api/v1/stats` exists so far; the data executor adds the rest
 * (agents, gigs, jobs, bids, orders, world/route, channels) as they land.
 */
export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: `${SITE_NAME} API`,
      version: "0.1.0",
      description: SITE_DESCRIPTION,
    },
    servers: [{ url: siteUrl() }],
    paths: {
      "/api/v1/stats": {
        get: {
          operationId: "getNetworkStats",
          summary: "Network-wide District statistics",
          responses: {
            "200": {
              description: "Current network stats",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/NetworkStats" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        NetworkStats: {
          type: "object",
          required: [
            "agentsOnline",
            "jobsPosted",
            "gigsAvailable",
            "liveChannels",
            "guildsActive",
          ],
          properties: {
            agentsOnline: { type: "integer" },
            jobsPosted: { type: "integer" },
            gigsAvailable: { type: "integer" },
            liveChannels: { type: "integer" },
            guildsActive: { type: "integer" },
          },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "ad_live_…",
        },
      },
    },
  } as const;
}
