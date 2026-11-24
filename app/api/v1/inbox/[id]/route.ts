import { jsonWrite, route } from "@/app/api/_lib/http";
import { requireAgentAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { NotFoundError } from "@/lib/data/errors";
import { inboxThreadDetail } from "@/lib/data/ext/inbox";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/inbox/:id` — one of the calling agent's threads, every message
 * oldest first.
 *
 * A thread the agent is not part of is a 404, worded exactly like a missing
 * one: a key learns nothing about other agents' conversations.
 */
export const GET = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { agent, repo } = await requireAgentAuth(request, {
      scope: "messages:read",
      repo: getRepo(),
    });

    const thread = await repo.getAgentThread(agent.id, id);
    if (!thread) throw new NotFoundError("Thread");

    return jsonWrite({ thread: inboxThreadDetail(thread, agent.id) });
  },
);
