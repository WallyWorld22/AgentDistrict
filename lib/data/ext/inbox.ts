import type { Agent, Message, Profile, ThreadListItem, ThreadWithMessages } from "@/lib/data/types";

/**
 * An agent's inbox, as the agent reads it (`GET /api/v1/inbox`, the MCP
 * `list_inbox` / `read_thread` / `reply_to_thread` tools).
 *
 * A thread is a conversation between one human (the thread's profile) and one
 * agent. The agent key sees the threads whose agent is the key's own, and
 * nothing else: `listAgentThreads` / `getAgentThread` in the repository filter
 * on it, and a thread of another agent's answers exactly as a missing one does.
 *
 * Agents cannot **start** a thread: a human opens one from a Passport or the
 * Inbox. What an agent does here is read and answer.
 *
 * Pure shaping, no I/O. Internal ids of the human (`profile_id`,
 * `sender_id`) are left out: the agent gets the human's public handle and
 * name, which is what it needs to answer them.
 */

/** Longest reply, in characters: the `messages.body` check (0001). */
export const MESSAGE_BODY_MAX = 4000;

export type InboxParticipant = {
  type: "human";
  handle: string;
  display_name: string;
} | null;

export type InboxMessage = {
  id: string;
  sender_type: Message["sender_type"];
  sender_name: string;
  /** Written by the agent reading this. */
  mine: boolean;
  body: string;
  created_at: string;
};

export type InboxThreadSummary = {
  id: string;
  subject: string;
  with: InboxParticipant;
  /** The last word is not the agent's: someone is waiting on an answer. */
  awaiting_reply: boolean;
  last_message: InboxMessage | null;
  created_at: string;
  updated_at: string;
};

export type InboxThreadDetail = Omit<InboxThreadSummary, "last_message"> & {
  messages: InboxMessage[];
};

function participant(counterpart: Agent | Profile | null): InboxParticipant {
  if (!counterpart || !("display_name" in counterpart)) return null;
  return { type: "human", handle: counterpart.handle, display_name: counterpart.display_name };
}

export function inboxMessage(message: Message, agentId: string): InboxMessage {
  return {
    id: message.id,
    sender_type: message.sender_type,
    sender_name: message.sender_name,
    mine: message.sender_type === "agent" && message.sender_id === agentId,
    body: message.body,
    created_at: message.created_at,
  };
}

/** Waiting on the agent: there is a last message and the agent did not write it. */
export function awaitingReply(last: Message | null | undefined, agentId: string): boolean {
  if (!last) return false;
  return !(last.sender_type === "agent" && last.sender_id === agentId);
}

export function inboxThreadSummary(thread: ThreadListItem, agentId: string): InboxThreadSummary {
  return {
    id: thread.id,
    subject: thread.subject,
    with: participant(thread.counterpart),
    awaiting_reply: awaitingReply(thread.lastMessage, agentId),
    last_message: thread.lastMessage ? inboxMessage(thread.lastMessage, agentId) : null,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
  };
}

export function inboxThreadDetail(thread: ThreadWithMessages, agentId: string): InboxThreadDetail {
  return {
    id: thread.id,
    subject: thread.subject,
    with: participant(thread.counterpart),
    awaiting_reply: awaitingReply(thread.messages.at(-1), agentId),
    messages: thread.messages.map((message) => inboxMessage(message, agentId)),
    created_at: thread.created_at,
    updated_at: thread.updated_at,
  };
}
