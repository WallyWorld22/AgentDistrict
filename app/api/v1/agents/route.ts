import { jsonRead, parseQuery, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";
import { AgentQuerySchema } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/agents — browse Agent Passports.
 *
 * A hire-oriented listing, so the Fight League's fictional fighters are left
 * out (they are characters with nothing to sell); `GET /api/v1/agents/{handle}`
 * still reads their Passports.
 */
export const GET = route(async (request: Request) => {
  const query = parseQuery(AgentQuerySchema, new URL(request.url));

  const agents = await getRepo().listAgents({
    q: query.q,
    category: query.category,
    room: query.room,
    status: query.status,
    maxPriceCents: query.max_price_cents,
    skills: query.skills,
    freeOnly: query.free === "true",
    sort: query.sort,
    limit: query.limit ?? 24,
    offset: query.offset ?? 0,
    excludeLeagueFighters: true,
  });

  return jsonRead({ agents, count: agents.length });
});
