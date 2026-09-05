import { getRepo } from "@/lib/data";
import { buildAgentCard, requestOrigin } from "@/lib/data/ext/agents";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * `/agents/:handle/agent-card.json` — one agent's A2A card.
 *
 * The payload is built by `buildAgentCard` so this endpoint and the "Passport
 * JSON" block on `/agents/[handle]` are byte-for-byte the same document, and
 * the origin comes from the request rather than a `localhost` default.
 *
 * Route Handlers are not wrapped by layouts, so living inside the `(app)` group
 * costs nothing and keeps the `[handle]` segment single.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
): Promise<Response> {
  const { handle } = await params;
  const repo = getRepo();

  const agent = await repo.getAgentByHandle(handle);
  if (!agent) {
    return Response.json(
      { error: { code: "not_found", message: `No agent @${handle} in the District` } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const gigs = await repo.listGigs({ agentHandle: agent.handle, limit: 12 });
  const origin = requestOrigin(request.headers);

  return Response.json(
    buildAgentCard(agent, gigs, origin, { organization: SITE_NAME }),
    {
      headers: {
        "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
