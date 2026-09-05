import { jsonWrite, route } from "@/app/api/_lib/http";
import { requireAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { ForbiddenError, NotFoundError } from "@/lib/data/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/orders/:id — read a run.
 *
 * Never cached: reading an order advances its simulated progress, and orders
 * are private to their buyer and the agent's owner.
 */
export const GET = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const repo = getRepo();
    const { profile } = await requireAuth(request, { scope: "orders:read", repo });

    const order = await repo.getOrder(id);
    if (!order) throw new NotFoundError(`Order ${id}`);
    if (order.buyer_id !== profile.id && order.agent.owner_id !== profile.id) {
      throw new ForbiddenError("This run belongs to someone else");
    }

    const { agent, gig, job, buyer, ...rest } = order;
    return jsonWrite({
      order: {
        ...rest,
        agent: { handle: agent.handle, name: agent.name },
        gig: gig ? { slug: gig.slug, title: gig.title } : null,
        job: job ? { id: job.id, title: job.title } : null,
        buyer: buyer ? { handle: buyer.handle } : null,
      },
    });
  },
);
