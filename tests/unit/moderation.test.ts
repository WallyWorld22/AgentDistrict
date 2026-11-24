// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hand moderation (0021): an operator hides a feed post, or suspends an agent
 * so its keys are refused and nothing is posted or bid in its name.
 *
 * Three layers, each tested on its own:
 *
 * - the **demo adapter** (the same contract `tests/integration/moderation.test.ts`
 *   holds the Supabase adapter and the SQL to);
 * - the **routes**, called as functions of a `Request` — the feed, the bids,
 *   `/agents/me` and MCP, with a suspended agent's real key;
 * - the **Server Actions**, which refuse a signed-in non-operator before the
 *   repository is reached.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const mcpRequest = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => mcpRequest.headers }));

/** Flip to sign the Server Actions in as somebody who is not an operator. */
const viewer = vi.hoisted(() => ({ nonOperator: false }));
vi.mock("@/lib/auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireProfile: async (...args: Parameters<typeof actual.requireProfile>) => {
      const profile = await actual.requireProfile(...args);
      return viewer.nonOperator ? { ...profile, is_admin: false } : profile;
    },
  };
});

import { POST as registerAgentRoute } from "@/app/api/v1/agents/register/route";
import { GET as agentsMeRoute } from "@/app/api/v1/agents/me/route";
import { GET as readFeedRoute, POST as postFeedRoute } from "@/app/api/v1/feed/route";
import { POST as placeBidRoute } from "@/app/api/v1/jobs/[id]/bids/route";
import { POST as mcpRoute } from "@/app/api/mcp/[transport]/route";
import { GET as llmsRoute } from "@/app/llms.txt/route";
import { GET as skillRoute } from "@/app/skill.md/route";
import { buildOpenApiDocument } from "@/lib/openapi";
import { resetRateLimitsForTests } from "@/app/api/_lib/rate-limit";
import { setPostHiddenAction } from "@/app/(app)/feed/actions";
import { setAgentSuspendedAction } from "@/app/(app)/agents/actions";
import { createDemoRepository, type DemoRepository } from "@/lib/data/demo";
import { getRepo, resetRepoForTests } from "@/lib/data";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/data/errors";
import { loadFeed } from "@/lib/data/ext/feed";
import {
  DESK_NOT_SUSPENDABLE,
  OPERATORS_ONLY,
  SUSPENDED_PASSPORT_NOTICE,
  suspendedKeyRefusal,
} from "@/lib/data/ext/moderation";
import { DISTRICT_DESK_HANDLE } from "@/lib/data/ext/welcome";
import { DEMO_PROFILE_ID, REGISTRY_PROFILE_ID, SEED_EPOCH_MS, demoSeed } from "@/lib/seed";
import type { RegisterAgentInput } from "@/lib/data/types";

const ORIGIN = "https://district.test";
const HOST_HEADERS = { "x-forwarded-host": "district.test", "x-forwarded-proto": "https" };

let repo: DemoRepository;

beforeEach(() => {
  repo = createDemoRepository({ now: () => SEED_EPOCH_MS });
  viewer.nonOperator = false;
  resetRepoForTests();
  resetRateLimitsForTests();
});

afterEach(() => {
  viewer.nonOperator = false;
  resetRepoForTests();
  resetRateLimitsForTests();
});

function input(handle: string): RegisterAgentInput {
  return {
    handle,
    name: "TideReader",
    tagline: "Coastal permit and parcel research for Florida contractors.",
    category: "research",
    skills: ["permit data", "parcel matching"],
  };
}

function post(path: string, payload: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...HOST_HEADERS, ...headers },
    body: JSON.stringify(payload),
  });
}

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { headers: { ...HOST_HEADERS, ...headers } });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** A post by a freshly registered agent, through the demo repository. */
async function strangerPost(target: DemoRepository, handle = "tide-reader") {
  const { agent } = await target.registerAgent(input(handle));
  const event = await target.publishEvent({
    kind: "post",
    actor_type: "agent",
    actor_id: agent.id,
    actor_name: agent.name,
    headline: "Buy my token, 100x guaranteed",
    body: "",
    cta_label: "Read passport",
    cta_href: `/agents/${agent.handle}`,
  });
  return { agent, event };
}

/* -------------------------------------------------------------------------- */
/* Hiding a post — the demo adapter                                            */
/* -------------------------------------------------------------------------- */

describe("setEventHidden (demo)", () => {
  it("takes a post off every feed read and puts it back where it was", async () => {
    const { event } = await strangerPost(repo);
    const ids = async (filter: Parameters<DemoRepository["listEvents"]>[0]) =>
      (await repo.listEvents(filter)).map((row) => row.id);
    const before = await ids({ kinds: ["post"], limit: 50 });
    expect(before).toContain(event.id);

    const hidden = await repo.setEventHidden(event.id, true);
    expect(hidden.hidden_at).toBeTruthy();

    // Posts view, all activity, and the page the /feed route renders.
    expect(await ids({ kinds: ["post"], limit: 50 })).not.toContain(event.id);
    expect(await ids({ limit: 200 })).not.toContain(event.id);
    const page = await loadFeed(repo, { view: "posts", now: SEED_EPOCH_MS });
    expect(page.items.map((item) => item.id)).not.toContain(event.id);

    // Kept, and the operator's list has it.
    const list = await repo.listHiddenPosts();
    expect(list.map((row) => row.id)).toEqual([event.id]);

    const restored = await repo.setEventHidden(event.id, false);
    expect(restored.hidden_at).toBeUndefined();
    expect(await ids({ kinds: ["post"], limit: 50 })).toEqual(before);
    expect(await repo.listHiddenPosts()).toEqual([]);
  });

  it("hides posts only: a lifecycle event is a record, not speech", async () => {
    const [hired] = await repo.listEvents({ kind: "hired", limit: 1 });
    expect(hired, "the seed has a hired event").toBeDefined();
    await expect(repo.setEventHidden(hired.id, true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.setEventHidden("no-such-event", true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a caller whose profile is not an operator", async () => {
    const dataset = structuredClone(demoSeed);
    for (const profile of dataset.profiles) profile.is_admin = false;
    const demoted = createDemoRepository({ now: () => SEED_EPOCH_MS, dataset });
    const { event } = await strangerPost(demoted);

    await expect(demoted.setEventHidden(event.id, true)).rejects.toThrow(OPERATORS_ONLY);
    await expect(demoted.listHiddenPosts()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(demoted.setAgentSuspended("tide-reader", true)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect((await demoted.listEvents({ kinds: ["post"], limit: 50 })).map((row) => row.id)).toContain(
      event.id,
    );
    expect(await demoted.listSuspendedAgents()).toEqual([]);
  });

  it("ships with nothing hidden and nobody suspended", async () => {
    expect(await repo.listHiddenPosts(200)).toEqual([]);
    expect(await repo.listSuspendedAgents()).toEqual([]);
    expect(demoSeed.agents.some((agent) => agent.suspended_at)).toBe(false);
    expect(demoSeed.events.some((event) => event.hidden_at)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Suspending an agent — the demo adapter                                      */
/* -------------------------------------------------------------------------- */

describe("setAgentSuspended (demo)", () => {
  it("stops the agent posting and bidding, and reactivating restores both", async () => {
    const { agent } = await repo.registerAgent(input("tide-reader"));
    const job = (await repo.listJobs({ status: "open", limit: 50 })).find(
      (row) => row.poster_id !== REGISTRY_PROFILE_ID,
    )!;
    const postAs = () =>
      repo.publishEvent({
        kind: "post",
        actor_type: "agent",
        actor_id: agent.id,
        actor_name: agent.name,
        headline: "Hello again",
        body: "",
      });
    const bid = () =>
      repo.placeBid({
        jobId: job.id,
        agentHandle: agent.handle,
        amountCents: Math.min(500, job.budget_cents),
        etaSeconds: Math.min(900, job.deadline_seconds),
        note: "probe",
      });

    const suspended = await repo.setAgentSuspended(agent.handle, true);
    expect(suspended.suspended_at).toBeTruthy();
    expect((await repo.getAgentByHandle(agent.handle))?.suspended_at).toBeTruthy();
    expect((await repo.listSuspendedAgents()).map((row) => row.handle)).toEqual(["tide-reader"]);

    await expect(postAs()).rejects.toThrow(/suspended by the District/);
    await expect(bid()).rejects.toBeInstanceOf(ForbiddenError);

    // A record about the agent is not the agent speaking.
    await expect(
      repo.publishEvent({
        kind: "discovered",
        actor_type: "agent",
        actor_id: agent.id,
        actor_name: agent.name,
        headline: "A lifecycle row",
        body: "",
      }),
    ).resolves.toMatchObject({ kind: "discovered" });

    const back = await repo.setAgentSuspended(agent.handle, false);
    expect(back.suspended_at).toBeUndefined();
    await expect(postAs()).resolves.toMatchObject({ kind: "post" });
    await expect(bid()).resolves.toMatchObject({ status: "pending" });
    expect(await repo.listSuspendedAgents()).toEqual([]);
  });

  it("never suspends the District Desk, and 404s an unknown handle", async () => {
    await expect(repo.setAgentSuspended(DISTRICT_DESK_HANDLE, true)).rejects.toThrow(
      DESK_NOT_SUSPENDABLE,
    );
    await expect(repo.setAgentSuspended(DISTRICT_DESK_HANDLE, true)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(repo.setAgentSuspended("nobody-here", true)).rejects.toBeInstanceOf(NotFoundError);
  });
});

/* -------------------------------------------------------------------------- */
/* The routes, with a real key                                                 */
/* -------------------------------------------------------------------------- */

async function registerKey(handle: string): Promise<string> {
  const response = await registerAgentRoute(post("/api/v1/agents/register", input(handle)));
  expect(response.status).toBe(201);
  return (await json(response)).api_key as string;
}

async function callTool(name: string, args: unknown, headers: Record<string, string>) {
  const all = { ...HOST_HEADERS, ...headers };
  mcpRequest.headers = new Headers(all);
  const response = await mcpRoute(
    new Request(`${ORIGIN}/api/mcp/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...all,
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
  const result = JSON.parse(line!.slice(5)).result as {
    content: Array<{ text: string }>;
    isError?: boolean;
  };
  return { isError: Boolean(result.isError), payload: JSON.parse(result.content[0].text) };
}

describe("a suspended agent's key", () => {
  it("answers 403 on every keyed call, REST and MCP, and works again once reactivated", async () => {
    const key = await registerKey("tide-reader");
    const auth = { authorization: `Bearer ${key}` };
    const job = (await getRepo().listJobs({ status: "open", limit: 50 })).find(
      (row) => row.poster_id !== DEMO_PROFILE_ID && row.poster_id !== REGISTRY_PROFILE_ID,
    )!;
    const bid = () =>
      placeBidRoute(
        post(
          `/api/v1/jobs/${job.id}/bids`,
          {
            agent_handle: "tide-reader",
            amount_cents: Math.min(700, job.budget_cents),
            eta_seconds: Math.min(900, job.deadline_seconds),
            note: "probe",
          },
          auth,
        ),
        { params: Promise.resolve({ id: job.id }) },
      );

    await getRepo().setAgentSuspended("tide-reader", true);

    const me = await agentsMeRoute(get("/api/v1/agents/me", auth));
    expect(me.status).toBe(403);
    const error = (await json(me)).error as { code: string; message: string };
    expect(error.code).toBe("forbidden");
    expect(error.message).toBe(suspendedKeyRefusal({ handle: "tide-reader" }));

    const posted = await postFeedRoute(post("/api/v1/feed", { headline: "Still here?" }, auth));
    expect(posted.status).toBe(403);
    expect((await bid()).status).toBe(403);

    const tool = await callTool("post_to_feed", { headline: "Over MCP instead" }, auth);
    expect(tool.isError).toBe(true);
    expect(tool.payload.error.code).toBe("forbidden");

    const feed = await json(await readFeedRoute(get("/api/v1/feed?limit=50")));
    const headlines = (feed.posts as Array<{ headline: string }>).map((row) => row.headline);
    expect(headlines).not.toContain("Still here?");
    expect(headlines).not.toContain("Over MCP instead");

    await getRepo().setAgentSuspended("tide-reader", false);
    expect((await agentsMeRoute(get("/api/v1/agents/me", auth))).status).toBe(200);
    expect(
      (await postFeedRoute(post("/api/v1/feed", { headline: "Back again" }, auth))).status,
    ).toBe(201);
    expect((await bid()).status).toBe(201);
  });

  it("is refused only where a key is needed: public reads stay open, as the docs say", async () => {
    const key = await registerKey("tide-reader");
    const auth = { authorization: `Bearer ${key}` };
    await getRepo().setAgentSuspended("tide-reader", true);

    // What the machine docs promise, pinned to what the routes do.
    expect((await agentsMeRoute(get("/api/v1/agents/me", auth))).status).toBe(403);
    expect((await readFeedRoute(get("/api/v1/feed?limit=5", auth))).status).toBe(200);
    const read = await callTool("read_feed", { limit: 5 }, auth);
    expect(read.isError).toBe(false);

    const llms = await (await llmsRoute(get("/llms.txt"))).text();
    const skill = (await (await skillRoute(get("/skill.md"))).text()).replace(/\s+/g, " ");
    const openapi = JSON.stringify(buildOpenApiDocument(ORIGIN));
    for (const text of [llms, skill]) {
      expect(text).toContain("every call that needs its key");
      expect(text.toLowerCase()).toContain("public reads that need no key");
      expect(text).not.toMatch(/answers 403 to every call|every call its key makes/i);
    }
    expect(openapi).toContain("Public reads");
    expect(openapi).not.toContain("its API keys answer 403");
  });

  it("leaves every other agent's key alone", async () => {
    await registerKey("tide-reader");
    const other = await registerKey("reef-watch");
    await getRepo().setAgentSuspended("tide-reader", true);
    const me = await agentsMeRoute(get("/api/v1/agents/me", { authorization: `Bearer ${other}` }));
    expect(me.status).toBe(200);
  });
});

describe("GET /api/v1/feed", () => {
  it("does not serve a hidden post", async () => {
    const key = await registerKey("tide-reader");
    const created = await json(
      await postFeedRoute(
        post("/api/v1/feed", { headline: "Recruiting for my token" }, { authorization: `Bearer ${key}` }),
      ),
    );
    const id = (created.post as { id: string }).id;

    await getRepo().setEventHidden(id, true);
    const feed = await json(await readFeedRoute(get("/api/v1/feed?limit=50")));
    expect((feed.posts as Array<{ id: string }>).map((row) => row.id)).not.toContain(id);

    const tool = await callTool("read_feed", { limit: 50 }, {});
    expect(JSON.stringify(tool.payload)).not.toContain(id);
  });
});

/* -------------------------------------------------------------------------- */
/* The Server Actions                                                          */
/* -------------------------------------------------------------------------- */

describe("moderation actions", () => {
  it("let an operator hide and unhide a post", async () => {
    const { event } = await strangerPost(getRepo() as DemoRepository);
    const hid = await setPostHiddenAction(null, form({ id: event.id, hidden: "true" }));
    expect(hid).toEqual({ ok: true, message: "Post hidden from the feed." });
    expect((await getRepo().listHiddenPosts()).map((row) => row.id)).toEqual([event.id]);

    const shown = await setPostHiddenAction(null, form({ id: event.id, hidden: "false" }));
    expect(shown?.ok).toBe(true);
    expect(await getRepo().listHiddenPosts()).toEqual([]);
  });

  it("refuse a signed-in non-operator and change nothing", async () => {
    const { event } = await strangerPost(getRepo() as DemoRepository);
    viewer.nonOperator = true;

    expect(await setPostHiddenAction(null, form({ id: event.id, hidden: "true" }))).toEqual({
      ok: false,
      message: OPERATORS_ONLY,
    });
    expect(
      await setAgentSuspendedAction(null, form({ handle: "tide-reader", suspended: "true" })),
    ).toEqual({ ok: false, message: OPERATORS_ONLY });

    viewer.nonOperator = false;
    expect(await getRepo().listHiddenPosts()).toEqual([]);
    expect(await getRepo().listSuspendedAgents()).toEqual([]);
  });

  it("let an operator suspend and reactivate an agent, never the Desk", async () => {
    await registerKey("tide-reader");
    const suspended = await setAgentSuspendedAction(
      null,
      form({ handle: "tide-reader", suspended: "true" }),
    );
    expect(suspended).toEqual({
      ok: true,
      message: "TideReader is suspended. Its API keys are refused.",
    });
    expect((await getRepo().getAgentByHandle("tide-reader"))?.suspended_at).toBeTruthy();

    const back = await setAgentSuspendedAction(null, form({ handle: "tide-reader", suspended: "false" }));
    expect(back?.ok).toBe(true);
    expect((await getRepo().getAgentByHandle("tide-reader"))?.suspended_at).toBeUndefined();

    expect(
      await setAgentSuspendedAction(null, form({ handle: DISTRICT_DESK_HANDLE, suspended: "true" })),
    ).toEqual({ ok: false, message: DESK_NOT_SUSPENDABLE });
  });
});

/* -------------------------------------------------------------------------- */
/* The SQL says the same                                                       */
/* -------------------------------------------------------------------------- */

describe("0021_moderation.sql", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0021_moderation.sql"), "utf8");

  it("fences hidden posts in RLS and gates every switch on the operator flag", () => {
    expect(sql).toMatch(/create policy "events_public_read" on public\.events\s+for select using \(hidden_at is null\)/);
    for (const fn of ["set_event_hidden", "list_hidden_posts", "set_agent_suspended"]) {
      const body = sql.slice(sql.indexOf(`function public.${fn}(`));
      expect(body.slice(0, 600)).toContain("if not public.is_district_operator() then");
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon;`));
    }
  });

  it("names the same unsuspendable handle the app does", () => {
    expect(sql).toContain(`lower(coalesce(p_handle, '')) = '${DISTRICT_DESK_HANDLE}'`);
  });

  it("says on the Passport only what the app enforces", () => {
    // The notice promises three things a key cannot do; the key check refuses
    // every keyed call, which covers all three.
    expect(SUSPENDED_PASSPORT_NOTICE).toMatch(/post, bid or answer its inbox/);
  });
});
