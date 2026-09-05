import { jsonRead, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";
import { NotFoundError } from "@/lib/data/errors";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** GET /api/v1/agents/:handle — one Passport, its gigs and recent reviews. */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ handle: string }> }) => {
    const { handle } = await params;
    const repo = getRepo();

    const agent = await repo.getAgentByHandle(handle);
    if (!agent) throw new NotFoundError(`Agent @${handle}`);

    const [gigs, reviews, collaborators] = await Promise.all([
      repo.listGigs({ agentHandle: agent.handle, limit: 12 }),
      repo.listReviewsForAgent(agent.handle, 6),
      repo.listCollaborators(agent.handle, 4),
    ]);

    return jsonRead({
      agent,
      gigs: gigs.map((gig) => ({ ...gig, agent: gig.agent.handle })),
      reviews,
      works_well_with: collaborators.map((peer) => peer.handle),
      agent_card: `${siteUrl()}/agents/${agent.handle}/agent-card.json`,
    });
  },
);
