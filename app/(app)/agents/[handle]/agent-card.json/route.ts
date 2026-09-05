import { getRepo } from "@/lib/data";
import { SITE_NAME, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * `/agents/:handle/agent-card.json` — one agent's A2A card.
 *
 * Route Handlers are not wrapped by layouts, so living inside the `(app)` group
 * costs nothing and keeps the `[handle]` segment single.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
): Promise<Response> {
  const { handle } = await params;
  const url = siteUrl();
  const repo = getRepo();

  const agent = await repo.getAgentByHandle(handle);
  if (!agent) {
    return Response.json(
      { error: { code: "not_found", message: `No agent @${handle} in the District` } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const gigs = await repo.listGigs({ agentHandle: agent.handle, limit: 12 });

  return Response.json(
    {
      protocolVersion: "0.3.0",
      name: agent.name,
      districtId: `@${agent.handle}`,
      description: agent.description,
      url: agent.endpoints.a2a ?? `${url}/agents/${agent.handle}`,
      version: "1.0.0",
      preferredTransport: agent.endpoints.mcp ? "MCP" : "HTTP+JSON",
      provider: { organization: SITE_NAME, url },
      documentationUrl: `${url}/agents/${agent.handle}`,
      capabilities: { streaming: false, pushNotifications: Boolean(agent.endpoints.webhook) },
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["application/json", "text/csv", "text/markdown"],
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", bearerFormat: "ad_live_…" },
      },
      security: [{ apiKey: [] }],
      skills: gigs.map((gig) => ({
        id: gig.slug,
        name: gig.title,
        description: gig.description,
        tags: [gig.category, ...gig.tags].slice(0, 8),
        inputModes: ["application/json"],
        outputModes: [outputMode(gig.output_contract.format)],
        examples: gig.input_contract.fields
          .filter((field) => field.example)
          .slice(0, 3)
          .map((field) => `${field.name}: ${field.example}`),
        pricing: {
          starting_price_cents: gig.starting_price_cents,
          currency: "USD",
          packages: gig.packages.map((pkg) => ({
            tier: pkg.tier,
            price_cents: pkg.price_cents,
            delivery_seconds: pkg.delivery_seconds,
          })),
        },
        inputContract: gig.input_contract,
        outputContract: gig.output_contract,
        hire: `${url}/api/v1/orders`,
      })),
      passport: {
        category: agent.category,
        skills: agent.skills,
        regions: agent.regions,
        status: agent.status,
        verified: agent.verified,
        pricing_model: agent.pricing_model,
        starting_price_cents: agent.starting_price_cents,
        rating_avg: agent.rating_avg,
        rating_count: agent.rating_count,
        jobs_completed: agent.jobs_completed,
        repeat_hire_rate: agent.repeat_hire_rate,
        reliability: agent.reliability,
        dispute_rate: agent.dispute_rate,
        avg_latency_sec: agent.avg_latency_sec,
        mcp_tools: agent.mcp_tools,
      },
      additionalInterfaces: [
        ...(agent.endpoints.a2a ? [{ transport: "JSONRPC", url: agent.endpoints.a2a }] : []),
        ...(agent.endpoints.mcp ? [{ transport: "MCP", url: agent.endpoints.mcp }] : []),
        ...(agent.endpoints.openapi
          ? [{ transport: "HTTP+JSON", url: agent.endpoints.openapi }]
          : []),
        { transport: "HTTP+JSON", url: `${url}/api/v1/agents/${agent.handle}` },
      ],
    },
    {
      headers: { "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" },
    },
  );
}

function outputMode(format: string): string {
  switch (format) {
    case "csv":
      return "text/csv";
    case "markdown":
      return "text/markdown";
    case "table":
    case "json":
    case "links":
    default:
      return "application/json";
  }
}
