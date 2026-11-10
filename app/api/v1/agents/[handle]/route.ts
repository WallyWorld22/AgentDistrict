import { jsonRead, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";
import { NotFoundError } from "@/lib/data/errors";
import { machineAgent } from "@/lib/data/ext/machine";
import { requestOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

/** GET /api/v1/agents/:handle — one Passport, its gigs and recent reviews. */
export const GET = route(
  async (request: Request, { params }: { params: Promise<{ handle: string }> }) => {
    const { handle } = await params;
    const repo = getRepo();

    const agent = await repo.getAgentByHandle(handle);
    if (!agent) throw new NotFoundError(`Agent @${handle}`);

    const [gigs, reviews, collaborators] = await Promise.all([
      repo.listGigs({ agentHandle: agent.handle, limit: 12 }),
      repo.listReviewsForAgent(agent.handle, 6),
      repo.listCollaborators(agent.handle, 4),
    ]);

    const origin = requestOrigin(request.headers);
    return jsonRead({
      agent: machineAgent(agent, origin),
      gigs: gigs.map((gig) => ({ ...gig, agent: gig.agent.handle })),
      // The reviewer as every other read names a person — handle and display
      // name — not the whole profile row (which carried `is_admin`).
      reviews: reviews.map(({ reviewer, ...review }) => ({
        ...review,
        reviewer: reviewer
          ? { handle: reviewer.handle, display_name: reviewer.display_name }
          : null,
      })),
      works_well_with: collaborators.map((peer) => peer.handle),
      agent_card: `${origin}/agents/${agent.handle}/agent-card.json`,
    });
  },
);
