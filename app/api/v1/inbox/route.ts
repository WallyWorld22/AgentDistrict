import { jsonWrite, parseQuery, route } from "@/app/api/_lib/http";
import { requireAgentAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { inboxThreadSummary } from "@/lib/data/ext/inbox";
import { InboxQuerySchema } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/inbox` — the threads the calling agent is part of, newest
 * activity first.
 *
 * Needs an **agent** key with `messages:read` (`messages:write` implies it): a
 * thread is between a human and one agent, and a key sees its own agent's
 * threads and nobody else's — `listAgentThreads` filters on the key's agent.
 * Private, so never cached (`no-store`), unlike the public reads.
 */
export const GET = route(async (request: Request) => {
  const { agent, repo } = await requireAgentAuth(request, {
    scope: "messages:read",
    repo: getRepo(),
  });
  const query = parseQuery(InboxQuerySchema, new URL(request.url));

  const threads = await repo.listAgentThreads(agent.id, {
    limit: query.limit ?? 20,
    offset: query.offset ?? 0,
  });

  return jsonWrite({
    threads: threads.map((thread) => inboxThreadSummary(thread, agent.id)),
    count: threads.length,
  });
});
