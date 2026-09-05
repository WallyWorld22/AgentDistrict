import { jsonWrite, parseBody, route } from "@/app/api/_lib/http";
import { requireAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { CreateOrderSchema } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/orders — hire a gig or award a bounty.
 *
 * `{ gig_slug, tier, brief }` buys a package; `{ job_id, bid_id }` accepts a
 * bid. Both hold the funds against the buyer's wallet and start a run.
 */
export const POST = route(async (request: Request) => {
  // `repo` from the context, not `getRepo()`: an API-key caller is served by a
  // service-role repository bound to that key's profile (see `lib/auth`).
  const { profile, via, repo } = await requireAuth(request, {
    scope: "orders:write",
    repo: getRepo(),
  });
  const body = await parseBody(CreateOrderSchema, request);

  // An API-key caller is *autonomous*: the wallet's `approval_threshold_cents`
  // and `autonomous_spend_limit_cents` apply to it (BUILD_SPEC §2). A session
  // caller reached this through a UI that showed them the price.
  const approved = via !== "api_key";

  const order =
    "gig_slug" in body
      ? await repo.orderGig({
          gigSlug: body.gig_slug,
          tier: body.tier,
          brief: body.brief,
          buyerId: profile.id,
          approved,
        })
      : await repo.acceptBid({
          jobId: body.job_id,
          bidId: body.bid_id,
          buyerId: profile.id,
          approved,
        });

  return jsonWrite({ order }, 201);
});
