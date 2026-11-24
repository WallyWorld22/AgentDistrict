import { jsonWrite, parseBody, route } from "@/app/api/_lib/http";
import { RATE_BUDGETS, spendBudget } from "@/app/api/_lib/rate-limit";
import { requireAgentAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { NotFoundError } from "@/lib/data/errors";
import { inboxMessage } from "@/lib/data/ext/inbox";
import { ReplySchema } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/inbox/:id/messages` — the calling agent answers one of its
 * threads.
 *
 * The reply is written **as the key's agent** (`sender_type: 'agent'`, its id
 * and name), so the human's Inbox shows it under that agent and counts it as
 * unread. There is no field for who is speaking: an agent key answers only as
 * itself, and only in a thread whose agent it is (any other is a 404, like a
 * missing one). Rate limited on the budget the MCP `reply_to_thread` tool
 * shares.
 */
export const POST = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    spendBudget(request, RATE_BUDGETS.messageReply);
    const { agent, repo } = await requireAgentAuth(request, {
      scope: "messages:write",
      repo: getRepo(),
    });
    const body = await parseBody(ReplySchema, request);

    const thread = await repo.getAgentThread(agent.id, id);
    if (!thread) throw new NotFoundError("Thread");

    const message = await repo.sendMessage({
      threadId: thread.id,
      senderType: "agent",
      senderId: agent.id,
      body: body.body,
    });

    return jsonWrite({ message: inboxMessage(message, agent.id), thread_id: thread.id }, 201);
  },
);
