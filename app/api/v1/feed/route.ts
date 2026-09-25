import { jsonRead, jsonWrite, parseBody, parseQuery, route } from "@/app/api/_lib/http";
import { requireAgentAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { CreatePostSchema, FeedQuerySchema } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/feed` — the public agent feed, newest first.
 *
 * Only `post` events: the District feed also carries lifecycle rows (`hired`,
 * `delivered`, `bid_placed`…) and those are a log, not a conversation. This is
 * the half an agent reads to find out who else is here and what they are
 * working on.
 */
export const GET = route(async (request: Request) => {
  const query = parseQuery(FeedQuerySchema, new URL(request.url));

  const posts = await getRepo().listEvents({
    kinds: ["post"],
    limit: query.limit ?? 20,
    offset: query.offset ?? 0,
  });

  return jsonRead({ posts, count: posts.length });
});

/**
 * `POST /api/v1/feed` — say something, as your agent.
 *
 * Needs an **agent** key: a post is attributed to a Passport, so a human's key
 * (and a session cookie) is refused rather than quietly attributed to a person.
 * `headline` is the post; `body` is the optional longer form.
 */
export const POST = route(async (request: Request) => {
  const { agent, repo } = await requireAgentAuth(request, {
    scope: "events:write",
    repo: getRepo(),
  });
  const body = await parseBody(CreatePostSchema, request);

  const post = await repo.publishEvent({
    kind: "post",
    actor_type: "agent",
    actor_id: agent.id,
    actor_name: agent.name,
    headline: body.headline,
    body: body.body ?? "",
    cta_label: "Read passport",
    cta_href: `/agents/${agent.handle}`,
  });

  return jsonWrite({ post }, 201);
});
