// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** MCP tool handlers read the request through `headers()`. */
const mcpRequest = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => mcpRequest.headers }));

import { RATE_BUDGETS, resetRateLimitsForTests } from "@/app/api/_lib/rate-limit";
import { POST as mcpRoute } from "@/app/api/mcp/[transport]/route";
import { POST as registerRoute } from "@/app/api/v1/agents/register/route";
import { GET as inboxRoute } from "@/app/api/v1/inbox/route";
import { GET as threadRoute } from "@/app/api/v1/inbox/[id]/route";
import { POST as replyRoute } from "@/app/api/v1/inbox/[id]/messages/route";
import { GET as llmsRoute } from "@/app/llms.txt/route";
import { GET as skillRoute } from "@/app/skill.md/route";
import { getRepo, resetRepoForTests } from "@/lib/data";
import { ALL_KEY_SCOPES } from "@/lib/data/ext/agents";
import { AGENT_REPLY_NOTE } from "@/lib/data/ext/economy";
import { awaitingReply } from "@/lib/data/ext/inbox";
import { PRE_MESSAGING_AGENT_SCOPES, REGISTERED_AGENT_SCOPES } from "@/lib/data/types";
import { buildOpenApiDocument } from "@/lib/openapi";
import { DEMO_PROFILE_ID, DEMO_WRITE_API_KEY } from "@/lib/seed";
import { MCP_TOOLS } from "@/lib/site";

/**
 * Agents read and answer their inbox (0020), in the demo adapter and through
 * the real REST handlers and MCP tools. The same rules run against Postgres in
 * `tests/integration/agent-inbox.test.ts`.
 *
 * Revert checks (each fails without the change it names):
 *   - drop the `agent_id` filter in `listAgentThreads` → "sees only its own";
 *   - let `getAgentThread` return any thread → the cross-agent 404s;
 *   - drop `spendBudget` from the reply route → the 429;
 *   - drop `messages:*` from `REGISTERED_AGENT_SCOPES` → "a fresh key carries".
 */

const ORIGIN = "https://district.test";
const HOST = { "x-forwarded-host": "district.test", "x-forwarded-proto": "https" };

beforeEach(() => {
  resetRepoForTests();
  resetRateLimitsForTests();
});
afterEach(() => {
  resetRepoForTests();
  resetRateLimitsForTests();
});

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { headers: { ...HOST, ...headers } });
}
function post(path: string, payload: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...HOST, ...headers },
    body: JSON.stringify(payload),
  });
}

async function register(handle: string, name: string): Promise<{ key: string; id: string }> {
  const response = await registerRoute(
    post(
      "/api/v1/agents/register",
      {
        handle,
        name,
        tagline: "Answers its own inbox, as every agent should.",
        category: "research",
        skills: ["answering"],
      },
      { "x-forwarded-for": `register-${handle}` },
    ),
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as { api_key: string; agent: { id: string } };
  return { key: body.api_key, id: body.agent.id };
}

/** A human (the demo identity) opens a thread with `handle`, as the Passport does. */
async function humanWrites(handle: string, body: string): Promise<string> {
  const thread = await getRepo().createThread({
    profileId: DEMO_PROFILE_ID,
    agentHandle: handle,
    subject: `Question for @${handle}`,
    body,
  });
  return thread.id;
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function callTool(name: string, args: unknown, key?: string) {
  mcpRequest.headers = new Headers({ ...HOST, ...(key ? bearer(key) : {}) });
  const response = await mcpRoute(
    new Request(`${ORIGIN}/api/mcp/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...HOST,
        ...(key ? bearer(key) : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  const line = (await response.text()).split("\n").find((row) => row.startsWith("data:"));
  if (!line) throw new Error(`no data line from ${name}`);
  const result = JSON.parse(line.slice(5)).result as {
    content: Array<{ text: string }>;
    isError?: boolean;
  };
  return {
    isError: Boolean(result.isError),
    payload: JSON.parse(result.content[0].text) as Record<string, unknown>,
  };
}

describe("an agent key carries the inbox scopes", () => {
  it("a fresh self-registered key carries messages:read and messages:write", async () => {
    expect(REGISTERED_AGENT_SCOPES).toEqual(
      expect.arrayContaining(["messages:read", "messages:write"]),
    );
    const { key } = await register("scope-probe", "ScopeProbe");
    const record = await getRepo().verifyApiKey(key);
    expect(record?.scopes).toEqual(expect.arrayContaining(["messages:read", "messages:write"]));
  });

  it("the /profile form does not sell them, and the pre-0020 set is the new set minus them", () => {
    // A /profile key is never bound to an agent, and the inbox answers only an
    // agent key: offering messages:* there would sell a scope that cannot work.
    expect(ALL_KEY_SCOPES).not.toContain("messages:read");
    expect(ALL_KEY_SCOPES).not.toContain("messages:write");
    expect([...PRE_MESSAGING_AGENT_SCOPES, "messages:read", "messages:write"].sort()).toEqual(
      [...REGISTERED_AGENT_SCOPES].sort(),
    );
  });
});

describe("GET /api/v1/inbox and GET /api/v1/inbox/:id", () => {
  it("an agent sees only its own threads, with the human it is talking to", async () => {
    const a = await register("inbox-alpha", "Alpha");
    const b = await register("inbox-bravo", "Bravo");
    const forA = await humanWrites("inbox-alpha", "Alpha, can you take a Brevard pull today?");
    const forB = await humanWrites("inbox-bravo", "Bravo, a private question for you.");

    const listed = await json(await inboxRoute(get("/api/v1/inbox", bearer(a.key))));
    const threads = listed.threads as Array<Record<string, unknown>>;
    expect(threads.map((thread) => thread.id)).toEqual([forA]);
    expect(listed.count).toBe(1);
    expect(threads[0]).toMatchObject({
      subject: "Question for @inbox-alpha",
      with: { type: "human", handle: "austin" },
      awaiting_reply: true,
      last_message: { sender_type: "human", mine: false, body: "Alpha, can you take a Brevard pull today?" },
    });
    // No internal ids of the human leak to the agent.
    expect(JSON.stringify(listed)).not.toContain(DEMO_PROFILE_ID);
    expect(JSON.stringify(listed)).not.toContain(forB);

    const read = await threadRoute(get(`/api/v1/inbox/${forA}`, bearer(a.key)), params(forA));
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("no-store");
    const thread = (await json(read)).thread as { messages: Array<{ body: string }> };
    expect(thread.messages.map((message) => message.body)).toEqual([
      "Alpha, can you take a Brevard pull today?",
    ]);

    // B's thread, read with A's key: the same 404 a missing thread gets.
    const crossed = await threadRoute(get(`/api/v1/inbox/${forB}`, bearer(a.key)), params(forB));
    const missing = "00000000-0000-0000-0000-000000000000";
    const absent = await threadRoute(get(`/api/v1/inbox/${missing}`, bearer(a.key)), params(missing));
    expect(crossed.status).toBe(404);
    expect(absent.status).toBe(404);
    expect(await crossed.json()).toEqual(await absent.json());

    // B still sees its own.
    const bList = await json(await inboxRoute(get("/api/v1/inbox", bearer(b.key))));
    expect((bList.threads as Array<{ id: string }>).map((t) => t.id)).toEqual([forB]);
  });

  it("refuses everyone who is not an agent with the scope", async () => {
    const human = await inboxRoute(get("/api/v1/inbox", bearer(DEMO_WRITE_API_KEY)));
    expect(human.status).toBe(403);
    expect(((await json(human)).error as { message: string }).message).toMatch(/agent key/);

    // A session (demo mode: the demo human) is not an agent either.
    expect((await inboxRoute(get("/api/v1/inbox"))).status).toBe(403);
    expect((await inboxRoute(get("/api/v1/inbox", bearer("ad_live_nope_x")))).status).toBe(401);

    // An agent-bound key without messages:* is refused by scope.
    const a = await register("narrow-key", "Narrow");
    const { key } = await getRepo().createApiKey({
      profileId: (await getRepo().verifyApiKey(a.key))!.profile_id,
      label: "narrow",
      scopes: ["events:write"],
      agentId: a.id,
    });
    const narrow = await inboxRoute(get("/api/v1/inbox", bearer(key)));
    expect(narrow.status).toBe(403);
    expect(((await json(narrow)).error as { message: string }).message).toContain("messages:read");
  });

  it("rejects an unknown query parameter", async () => {
    const a = await register("query-probe", "Query");
    expect((await inboxRoute(get("/api/v1/inbox?limt=2", bearer(a.key)))).status).toBe(400);
  });
});

describe("POST /api/v1/inbox/:id/messages", () => {
  it("answers as the agent; the human sees it attributed and unread", async () => {
    const a = await register("reply-alpha", "ReplyAlpha");
    const threadId = await humanWrites("reply-alpha", "Do you cover St. Lucie?");
    await getRepo().markThreadRead(threadId, DEMO_PROFILE_ID);

    const response = await replyRoute(
      post(`/api/v1/inbox/${threadId}/messages`, { body: "  Yes — St. Lucie and Martin.  " }, bearer(a.key)),
      params(threadId),
    );
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body).toMatchObject({
      thread_id: threadId,
      message: { sender_type: "agent", sender_name: "ReplyAlpha", mine: true, body: "Yes — St. Lucie and Martin." },
    });

    // What the human's Inbox renders.
    const seen = (await getRepo().getThread(threadId))!;
    const last = seen.messages.at(-1)!;
    expect(last).toMatchObject({ sender_type: "agent", sender_id: a.id, sender_name: "ReplyAlpha" });
    expect(seen.unread_count).toBe(1);

    // And the agent's own view moved on.
    const listed = await json(await inboxRoute(get("/api/v1/inbox", bearer(a.key))));
    expect((listed.threads as Array<{ awaiting_reply: boolean }>)[0].awaiting_reply).toBe(false);
  });

  it("cannot reach another agent's thread, and writes nothing there", async () => {
    const a = await register("reply-intruder", "Intruder");
    await register("reply-owner", "Owner");
    const theirs = await humanWrites("reply-owner", "For Owner only.");

    const response = await replyRoute(
      post(`/api/v1/inbox/${theirs}/messages`, { body: "Not my thread." }, bearer(a.key)),
      params(theirs),
    );
    expect(response.status).toBe(404);
    expect((await getRepo().getThread(theirs))!.messages.map((m) => m.body)).toEqual([
      "For Owner only.",
    ]);
  });

  it("validates the body", async () => {
    const a = await register("reply-validate", "Validate");
    const threadId = await humanWrites("reply-validate", "Hello?");
    for (const body of [{}, { body: "   " }, { body: "x".repeat(4001) }]) {
      const response = await replyRoute(
        post(`/api/v1/inbox/${threadId}/messages`, body, bearer(a.key)),
        params(threadId),
      );
      expect(response.status).toBe(400);
    }
  });

  it(`is rate limited to ${RATE_BUDGETS.messageReply.limit} a minute per address`, async () => {
    const a = await register("reply-loop", "Loop");
    const threadId = await humanWrites("reply-loop", "Ping?");
    const send = () =>
      replyRoute(
        post(`/api/v1/inbox/${threadId}/messages`, { body: "pong" }, { ...bearer(a.key), "x-forwarded-for": "loop" }),
        params(threadId),
      );
    for (let i = 0; i < RATE_BUDGETS.messageReply.limit; i += 1) {
      expect((await send()).status).toBe(201);
    }
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("the MCP inbox tools", () => {
  it("list, read and answer, as the key's agent only", async () => {
    const a = await register("mcp-alpha", "McpAlpha");
    await register("mcp-bravo", "McpBravo");
    const mine = await humanWrites("mcp-alpha", "MCP question for Alpha.");
    const theirs = await humanWrites("mcp-bravo", "MCP question for Bravo.");

    const listed = await callTool("list_inbox", {}, a.key);
    expect(listed.isError).toBe(false);
    expect((listed.payload.threads as Array<{ id: string }>).map((t) => t.id)).toEqual([mine]);

    const read = await callTool("read_thread", { thread_id: mine }, a.key);
    expect((read.payload.thread as { messages: unknown[] }).messages).toHaveLength(1);

    const crossed = await callTool("read_thread", { thread_id: theirs }, a.key);
    expect(crossed.isError).toBe(true);
    expect(crossed.payload).toMatchObject({ error: { code: "not_found" } });

    const replied = await callTool("reply_to_thread", { thread_id: mine, body: "On it." }, a.key);
    expect(replied.payload).toMatchObject({ thread_id: mine, message: { mine: true, body: "On it." } });
    expect((await getRepo().getThread(mine))!.messages.at(-1)).toMatchObject({
      sender_type: "agent",
      sender_name: "McpAlpha",
    });

    const intrude = await callTool("reply_to_thread", { thread_id: theirs, body: "Hi." }, a.key);
    expect(intrude.payload).toMatchObject({ error: { code: "not_found" } });
    expect((await getRepo().getThread(theirs))!.messages).toHaveLength(1);

    // No key: refused, not answered as the demo human.
    const anonymous = await callTool("list_inbox", {});
    expect(anonymous.isError).toBe(true);
    expect(anonymous.payload).toMatchObject({ error: { code: "forbidden" } });
  });
});

describe("the docs say what is now true", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("no longer calls messaging the gap, anywhere", () => {
    for (const file of ["app/(app)/developers/page.tsx", "app/(app)/developers/loading.tsx"]) {
      expect(read(file)).not.toMatch(/messaging is the gap|can't read or answer threads/i);
    }
    expect(AGENT_REPLY_NOTE).not.toMatch(/can't/);
  });

  it("names the three inbox tools and the three REST calls", async () => {
    for (const tool of ["list_inbox", "read_thread", "reply_to_thread"]) {
      expect(MCP_TOOLS).toContain(tool as (typeof MCP_TOOLS)[number]);
    }
    const skill = await (await skillRoute(get("/skill.md"))).text();
    const llms = await (await llmsRoute(get("/llms.txt"))).text();
    for (const text of [skill, llms]) {
      expect(text).toContain("/api/v1/inbox");
      expect(text).toContain("reply_to_thread");
      expect(text).toContain(`${RATE_BUDGETS.messageReply.limit} per minute`);
    }
    const paths = buildOpenApiDocument(ORIGIN).paths as Record<string, Record<string, { description?: string }>>;
    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining(["/api/v1/inbox", "/api/v1/inbox/{id}", "/api/v1/inbox/{id}/messages"]),
    );
    expect(paths["/api/v1/inbox/{id}/messages"].post.description).toContain(
      `${RATE_BUDGETS.messageReply.limit} replies per minute`,
    );
  });

  it("awaiting_reply is about who spoke last", () => {
    const base = { id: "m", thread_id: "t", body: "x", created_at: "2026-01-01T00:00:00Z", sender_name: "n" };
    expect(awaitingReply(null, "a")).toBe(false);
    expect(awaitingReply({ ...base, sender_type: "human", sender_id: "h" }, "a")).toBe(true);
    expect(awaitingReply({ ...base, sender_type: "agent", sender_id: "a" }, "a")).toBe(false);
    expect(awaitingReply({ ...base, sender_type: "agent", sender_id: "b" }, "a")).toBe(true);
  });
});

describe("0020 in SQL keeps step with the TypeScript", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0020_agent_inbox.sql"), "utf8");

  it("backfills exactly the keys carrying the pre-0020 self-registered set", () => {
    const update = sql.slice(sql.indexOf("update public.api_keys k"), sql.indexOf(";", sql.indexOf("update public.api_keys k")));
    const lists = [...update.matchAll(/array\[([^\]]*)\]/g)].map((match) =>
      [...match[1].matchAll(/'([a-z]+:[a-z]+)'/g)].map((m) => m[1]).sort(),
    );
    // What it appends, then the old set twice: contains (@>) and is contained (<@).
    expect(lists[0]).toEqual(["messages:read", "messages:write"]);
    expect(lists[1]).toEqual([...PRE_MESSAGING_AGENT_SCOPES].sort());
    expect(lists[2]).toEqual([...PRE_MESSAGING_AGENT_SCOPES].sort());
    expect(update).toContain("k.scopes @>");
    expect(update).toContain("k.scopes <@");
    expect(update).toContain("k.agent_id is not null");
  });

  it("closes the forged-sender and re-pointed-thread doors", () => {
    expect(sql).toContain("public.may_send_message(thread_id, sender_type, sender_id, sender_name)");
    expect(sql).toMatch(/revoke update on public\.threads from authenticated;/);
    expect(sql).toMatch(/grant update \(subject, unread_count, updated_at\) on public\.threads to authenticated;/);
  });
});
