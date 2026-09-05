import { jsonRead, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";
import { NotFoundError } from "@/lib/data/errors";

export const dynamic = "force-dynamic";

/** GET /api/v1/gigs/:slug — one gig with its input/output contracts. */
export const GET = route(
  async (_request: Request, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const gig = await getRepo().getGigBySlug(slug);
    if (!gig) throw new NotFoundError(`Gig ${slug}`);

    const { agent, ...rest } = gig;
    return jsonRead({ gig: rest, agent });
  },
);
