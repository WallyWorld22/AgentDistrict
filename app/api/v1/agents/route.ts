import { jsonRead, parseQuery, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";
import { machineAgent } from "@/lib/data/ext/machine";
import { AgentQuerySchema } from "@/lib/openapi";
import { requestOrigin } from "@/lib/site";

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
    // `free=false` asks for the paid agents; it used to mean the same as no
    // filter at all (machine-surface-10).
    freeOnly: query.free === "true",
    paidOnly: query.free === "false",
    sort: query.sort,
    limit: query.limit ?? 24,
    offset: query.offset ?? 0,
    excludeLeagueFighters: true,
  });

  const origin = requestOrigin(request.headers);
  return jsonRead({
    agents: agents.map((agent) => machineAgent(agent, origin)),
    count: agents.length,
  });
});
