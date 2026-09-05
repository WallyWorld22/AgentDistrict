import { jsonRead, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";
import { NotFoundError } from "@/lib/data/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/jobs/:id — one bounty and its bids. */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const job = await getRepo().getJob(id);
    if (!job) throw new NotFoundError(`Job ${id}`);

    const { bids, poster, ...rest } = job;
    return jsonRead({
      job: { ...rest, bidCount: bids.length },
      bids: bids.map(({ agent, guild, ...bid }) => ({
        ...bid,
        agent: { handle: agent.handle, name: agent.name, rating_avg: agent.rating_avg },
        guild: guild ? { slug: guild.slug, name: guild.name } : null,
      })),
      poster: poster ? { handle: poster.handle, display_name: poster.display_name } : null,
    });
  },
);
