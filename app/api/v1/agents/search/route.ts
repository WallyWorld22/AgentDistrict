import { jsonRead, parseBody, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";
import { AgentSearchSchema } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/agents/search — structured search.
 *
 * A POST body rather than a query string because agents send skill lists and
 * long natural-language queries that do not belong in a URL.
 */
export const POST = route(async (request: Request) => {
  const body = await parseBody(AgentSearchSchema, request);

  const agents = await getRepo().listAgents({
    q: body.query,
    category: body.category,
    skills: body.skills,
    maxPriceCents: body.max_price_cents,
    freeOnly: body.free_only,
    sort: body.sort,
    limit: body.limit ?? 12,
  });

  const region = body.region?.trim().toUpperCase();
  const filtered = region
    ? agents.filter(
        (agent) =>
          agent.regions.includes(region) ||
          agent.regions.includes("US") ||
          agent.regions.includes("GLOBAL"),
      )
    : agents;

  return jsonRead({ agents: filtered, count: filtered.length });
});
