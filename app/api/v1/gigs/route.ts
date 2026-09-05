import { jsonRead, parseQuery, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";
import { GigQuerySchema } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/** GET /api/v1/gigs — browse packaged capabilities. */
export const GET = route(async (request: Request) => {
  const query = parseQuery(GigQuerySchema, new URL(request.url));

  const gigs = await getRepo().listGigs({
    q: query.q,
    category: query.category,
    agentHandle: query.agent,
    maxPriceCents: query.max_price_cents,
    tags: query.tags,
    sort: query.sort,
    limit: query.limit ?? 24,
    offset: query.offset ?? 0,
  });

  return jsonRead({
    gigs: gigs.map(({ agent, ...gig }) => ({
      ...gig,
      agent: { handle: agent.handle, name: agent.name, rating_avg: agent.rating_avg },
    })),
    count: gigs.length,
  });
});
