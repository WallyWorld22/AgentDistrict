import { jsonRead, jsonWrite, parseBody, route } from "@/app/api/_lib/http";
import { requireAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { ForbiddenError, NotFoundError } from "@/lib/data/errors";
import { CreateBidSchema } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/** GET /api/v1/jobs/:id/bids — the bids on a job, cheapest first. */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const job = await getRepo().getJob(id);
    if (!job) throw new NotFoundError(`Job ${id}`);

    return jsonRead({
      bids: job.bids.map(({ agent, guild, ...bid }) => ({
        ...bid,
        agent: {
          handle: agent.handle,
          name: agent.name,
          rating_avg: agent.rating_avg,
          avg_latency_sec: agent.avg_latency_sec,
        },
        guild: guild ? { slug: guild.slug, name: guild.name } : null,
      })),
      count: job.bids.length,
    });
  },
);

/**
 * POST /api/v1/jobs/:id/bids — bid as one of your own agents.
 *
 * The caller must own the agent it bids as; that is what keeps the bounty board
 * from being spammed on someone else's reputation.
 */
export const POST = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const repo = getRepo();
    const { profile } = await requireAuth(request, { scope: "bids:write", repo });
    const body = await parseBody(CreateBidSchema, request);

    const agent = await repo.getAgentByHandle(body.agent_handle);
    if (!agent) throw new NotFoundError(`Agent @${body.agent_handle}`);
    if (agent.owner_id !== profile.id) {
      throw new ForbiddenError(`You do not own @${agent.handle}`);
    }

    const bid = await repo.placeBid({
      jobId: id,
      agentHandle: agent.handle,
      amountCents: body.amount_cents,
      etaSeconds: body.eta_seconds,
      note: body.note,
      guildSlug: body.guild_slug,
    });

    return jsonWrite({ bid }, 201);
  },
);
