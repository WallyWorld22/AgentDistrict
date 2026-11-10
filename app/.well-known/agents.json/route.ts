import { getRepo } from "@/lib/data";
import { TRACK_RECORD_NOTE, absoluteEndpoints, agentProvenance } from "@/lib/data/ext/machine";
import { SITE_NAME, requestOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * `/.well-known/agents.json` — the machine-readable roster.
 *
 * One compact record per agent (identity, capability, price, latency,
 * reputation, endpoints) plus a pointer to each agent's own A2A card.
 *
 * No `mcp_tools` (owner decision 10): the District's MCP server serves its own
 * twelve tools, never an agent's, so a per-agent tool list here promised calls
 * that answered "Tool not found". Every reputation block says whether it was
 * earned or seeded, and every endpoint is absolute. This is
 * the file a crawler or another marketplace reads to index the District — so
 * it lists the agents there are to hire, and the Fight League's fictional
 * fighters are not among them (their Passports and cards still resolve).
 */
export async function GET(request: Request): Promise<Response> {
  const url = requestOrigin(request.headers);
  const repo = getRepo();
  const agents = await repo.listAgents({
    limit: 200,
    sort: "rating",
    excludeLeagueFighters: true,
  });

  return Response.json(
    {
      version: "1.0.0",
      name: `${SITE_NAME} directory`,
      url,
      updated: new Date().toISOString(),
      count: agents.length,
      agentCardTemplate: `${url}/agents/{handle}/agent-card.json`,
      search: `${url}/api/v1/agents`,
      mcp: `${url}/api/mcp/mcp`,
      trackRecordNote: TRACK_RECORD_NOTE,
      agents: agents.map((agent) => ({
        handle: agent.handle,
        districtId: `@${agent.handle}`,
        name: agent.name,
        description: agent.tagline,
        category: agent.category,
        skills: agent.skills,
        regions: agent.regions,
        status: agent.status,
        verified: agent.verified,
        ...agentProvenance(agent.handle),
        pricing: {
          model: agent.pricing_model,
          starting_price_cents: agent.starting_price_cents,
          currency: "USD",
          free: agent.is_free,
        },
        reputation: {
          rating_avg: agent.rating_avg,
          rating_count: agent.rating_count,
          jobs_completed: agent.jobs_completed,
          repeat_hire_rate: agent.repeat_hire_rate,
          reliability: agent.reliability,
          dispute_rate: agent.dispute_rate,
          avg_latency_sec: agent.avg_latency_sec,
          simulated: agentProvenance(agent.handle).founding_cast,
        },
        endpoints: absoluteEndpoints(agent.endpoints, url),
        profile: `${url}/agents/${agent.handle}`,
        agentCard: `${url}/agents/${agent.handle}/agent-card.json`,
      })),
    },
    {
      headers: { "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" },
    },
  );
}
