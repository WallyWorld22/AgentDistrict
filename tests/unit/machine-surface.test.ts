// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MCP tool handlers read the request through `headers()`; the tests drive the
 * real handler in-process, so `headers()` answers with the current call's.
 */
const mcpRequest = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => mcpRequest.headers }));

import { GET as districtCardRoute } from "@/app/.well-known/agent-card.json/route";
import { GET as agentsJsonRoute } from "@/app/.well-known/agents.json/route";
import { GET as agentCardRoute } from "@/app/(app)/agents/[handle]/agent-card.json/route";
import { resetRateLimitsForTests } from "@/app/api/_lib/rate-limit";
import { GET as eventsRoute } from "@/app/api/events/route";
import { POST as mcpRoute } from "@/app/api/mcp/[transport]/route";
import { GET as listAgentsRoute } from "@/app/api/v1/agents/route";
import { GET as getAgentRoute } from "@/app/api/v1/agents/[handle]/route";
import { GET as meRoute } from "@/app/api/v1/agents/me/route";
import { POST as registerRoute } from "@/app/api/v1/agents/register/route";
import { POST as searchAgentsRoute } from "@/app/api/v1/agents/search/route";
import { GET as liveChannelsRoute } from "@/app/api/v1/channels/live/route";
import { GET as readFeedRoute, POST as postFeedRoute } from "@/app/api/v1/feed/route";
import { GET as listGigsRoute } from "@/app/api/v1/gigs/route";
import { GET as getGigRoute } from "@/app/api/v1/gigs/[slug]/route";
import { GET as listJobsRoute, POST as createJobRoute } from "@/app/api/v1/jobs/route";
import { GET as getJobRoute } from "@/app/api/v1/jobs/[id]/route";
import { GET as listBidsRoute, POST as placeBidRoute } from "@/app/api/v1/jobs/[id]/bids/route";
import { POST as createOrderRoute } from "@/app/api/v1/orders/route";
import { GET as getOrderRoute } from "@/app/api/v1/orders/[id]/route";
import { GET as statsRoute } from "@/app/api/v1/stats/route";
import { POST as worldRouteRoute } from "@/app/api/v1/world/route/route";
import { GET as llmsRoute } from "@/app/llms.txt/route";
import { GET as llmsFullRoute } from "@/app/llms-full.txt/route";
import { GET as skillRoute } from "@/app/skill.md/route";
import { getRepo, resetRepoForTests } from "@/lib/data";
import { isFoundingCast } from "@/lib/data/ext/cast";
import { buildOpenApiDocument } from "@/lib/openapi";
import { DEMO_PROFILE_ID, DEMO_WRITE_API_KEY, seed } from "@/lib/seed";

/**
 * Batch 8 of the site audit: the machine surface says what the District does.
 *
 * The centrepiece is a contract test. Every documented `/api/v1` operation is
 * called for real, and each answer is checked against the response schema
 * `/openapi.json` publishes for that status — strictly, so a field the
 * description leaves out fails here even though the published schema is open
 * (machine-surface-02), and a status the description does not list fails too
 * (machine-surface-03).
 */

const ORIGIN = "https://district.test";
const HOST_HEADERS = { "x-forwarded-host": "district.test", "x-forwarded-proto": "https" };

beforeEach(() => {
  resetRepoForTests();
  resetRateLimitsForTests();
});

afterEach(() => {
  resetRepoForTests();
  resetRateLimitsForTests();
});

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { headers: { ...HOST_HEADERS, ...headers } });
}

function post(path: string, payload: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...HOST_HEADERS, ...headers },
    body: JSON.stringify(payload),
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

/* -------------------------------------------------------------------------- */
/* A strict reader of the published JSON Schema                                */
/* -------------------------------------------------------------------------- */

type Schema = Record<string, unknown>;

const document = buildOpenApiDocument(ORIGIN);
const components = (document.components as { schemas: Record<string, Schema> }).schemas;

function resolve(schema: Schema): Schema {
  const ref = schema.$ref;
  if (typeof ref !== "string") return schema;
  return components[ref.replace("#/components/schemas/", "")];
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

/**
 * Every problem with `value` against `input`. Objects are read **strictly**:
 * a key with no `properties` entry is a problem unless the schema names an
 * `additionalProperties` schema for it. That is the whole point — the
 * published schema is open, so this test is what keeps it complete.
 */
function problems(value: unknown, input: Schema, path = "$"): string[] {
  const schema = resolve(input);
  const branches = (schema.anyOf ?? schema.oneOf) as Schema[] | undefined;
  if (branches) {
    return branches.some((branch) => problems(value, branch, path).length === 0)
      ? []
      : [`${path}: matches no branch (${JSON.stringify(value)?.slice(0, 80)})`];
  }
  if ("const" in schema && value !== schema.const) return [`${path}: is not ${String(schema.const)}`];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return [`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(", ")}`];
  }
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = allowed.includes(actual) || (actual === "integer" && allowed.includes("number"));
    if (!ok) return [`${path}: is ${actual}, documented as ${allowed.join("|")}`];
  }
  const found: string[] = [];
  if (typeOf(value) === "array" && schema.items) {
    (value as unknown[]).forEach((item, index) => {
      found.push(...problems(item, schema.items as Schema, `${path}[${index}]`));
    });
  }
  if (typeOf(value) === "object" && (schema.properties || schema.additionalProperties)) {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!(key in record)) found.push(`${path}.${key}: required but missing`);
    }
    for (const [key, item] of Object.entries(record)) {
      if (properties[key]) found.push(...problems(item, properties[key], `${path}.${key}`));
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        found.push(...problems(item, schema.additionalProperties as Schema, `${path}.${key}`));
      } else found.push(`${path}.${key}: returned but not documented`);
    }
  }
  return found;
}

type Operation = { responses: Record<string, Schema> };

function operation(method: string, path: string): Operation {
  const paths = document.paths as Record<string, Record<string, Operation>>;
  const entry = paths[path]?.[method];
  if (!entry) throw new Error(`${method.toUpperCase()} ${path} is not documented`);
  return entry;
}

/** The response matches what `/openapi.json` says that operation answers with that status. */
async function expectDocumented(
  method: string,
  path: string,
  response: Response,
): Promise<Record<string, unknown>> {
  const documented = operation(method, path).responses;
  const status = String(response.status);
  expect(Object.keys(documented), `${method.toUpperCase()} ${path} answered ${status}`).toContain(
    status,
  );
  const body = (await response.json()) as Record<string, unknown>;
  const content = (documented[status].content as Record<string, { schema: Schema }>)[
    "application/json"
  ];
  expect(problems(body, content.schema), `${method.toUpperCase()} ${path} → ${status}`).toEqual([]);
  return body;
}

async function registerAgent(handle: string): Promise<{ key: string }> {
  const response = await registerRoute(
    post("/api/v1/agents/register", {
      handle,
      name: `Probe ${handle}`,
      tagline: "Checks the API against its description.",
      category: "research",
      skills: ["contract testing"],
      endpoints: { mcp: "https://probe.example.com/mcp" },
    }),
  );
  const body = await expectDocumented("post", "/api/v1/agents/register", response);
  return { key: body.api_key as string };
}

/* -------------------------------------------------------------------------- */
/* machine-surface-02 / -03: the description matches the answers               */
/* -------------------------------------------------------------------------- */

describe("every /api/v1 answer is exactly what /openapi.json describes", () => {
  it("publishes open response objects: strict clients must not reject an added field", () => {
    const paths = document.paths as Record<string, Record<string, Operation>>;
    const responses = Object.values(paths).flatMap((methods) =>
      Object.values(methods).map((entry) => entry.responses),
    );
    expect(responses.length).toBeGreaterThan(15);
    expect(JSON.stringify(responses)).not.toContain('"additionalProperties":false');
    expect(JSON.stringify(components.Agent)).not.toContain('"additionalProperties":false');
  });

  it("documents the reads, field for field", async () => {
    await expectDocumented("get", "/api/v1/stats", await statsRoute());

    const agents = await expectDocumented(
      "get",
      "/api/v1/agents",
      await listAgentsRoute(get("/api/v1/agents?limit=100")),
    );
    expect((agents.agents as unknown[]).length).toBeGreaterThan(10);
    await expectDocumented(
      "post",
      "/api/v1/agents/search",
      await searchAgentsRoute(post("/api/v1/agents/search", { query: "research", region: "FL" })),
    );

    // An agent with gigs and reviews, so every nested shape is exercised.
    const scout = await expectDocumented(
      "get",
      "/api/v1/agents/{handle}",
      await getAgentRoute(get("/api/v1/agents/scout"), params({ handle: "scout" })),
    );
    expect((scout.gigs as unknown[]).length).toBeGreaterThan(0);
    expect((scout.reviews as unknown[]).length).toBeGreaterThan(0);

    const gigs = await expectDocumented("get", "/api/v1/gigs", await listGigsRoute(get("/api/v1/gigs?limit=50")));
    const slug = (gigs.gigs as Array<{ slug: string }>)[0].slug;
    await expectDocumented(
      "get",
      "/api/v1/gigs/{slug}",
      await getGigRoute(get(`/api/v1/gigs/${slug}`), params({ slug })),
    );

    const jobs = await expectDocumented("get", "/api/v1/jobs", await listJobsRoute(get("/api/v1/jobs?limit=50")));
    const withBids = (jobs.jobs as Array<{ id: string; bidCount: number }>).find(
      (job) => job.bidCount > 0,
    )!;
    await expectDocumented(
      "get",
      "/api/v1/jobs/{id}",
      await getJobRoute(get(`/api/v1/jobs/${withBids.id}`), params({ id: withBids.id })),
    );
    await expectDocumented(
      "get",
      "/api/v1/jobs/{id}/bids",
      await listBidsRoute(get(`/api/v1/jobs/${withBids.id}/bids`), params({ id: withBids.id })),
    );

    await expectDocumented("get", "/api/v1/feed", await readFeedRoute(get("/api/v1/feed?limit=50")));
    const live = await expectDocumented(
      "get",
      "/api/v1/channels/live",
      await liveChannelsRoute(get("/api/v1/channels/live")),
    );
    expect((live.channels as unknown[]).length).toBeGreaterThan(0);

    const routed = await expectDocumented(
      "post",
      "/api/v1/world/route",
      await worldRouteRoute(
        post("/api/v1/world/route", { outcome: "Find 200 roofing companies in Tampa under $10" }),
      ),
    );
    expect(routed.guild).not.toBeNull();
  });

  it("documents the writes and the entrance, field for field", async () => {
    const { key } = await registerAgent("contract-probe");
    await expectDocumented("get", "/api/v1/agents/me", await meRoute(get("/api/v1/agents/me", bearer(key))));
    await expectDocumented(
      "post",
      "/api/v1/feed",
      await postFeedRoute(post("/api/v1/feed", { headline: "Checking the contract." }, bearer(key))),
    );

    const created = await expectDocumented(
      "post",
      "/api/v1/jobs",
      await createJobRoute(
        post(
          "/api/v1/jobs",
          {
            title: "Contract probe bounty",
            description: "A bounty posted to check the response shape.",
            category: "research",
            budget_cents: 900,
            deadline_seconds: 3600,
            required_output: { format: "csv" },
          },
          bearer(DEMO_WRITE_API_KEY),
        ),
      ),
    );
    const jobId = (created.job as { id: string }).id;
    await expectDocumented(
      "post",
      "/api/v1/jobs/{id}/bids",
      await placeBidRoute(
        post(
          `/api/v1/jobs/${jobId}/bids`,
          { agent_handle: "contract-probe", amount_cents: 500, eta_seconds: 900 },
          bearer(key),
        ),
        params({ id: jobId }),
      ),
    );

    const ordered = await expectDocumented(
      "post",
      "/api/v1/orders",
      await createOrderRoute(
        post("/api/v1/orders", {
          gig_slug: "double-sourced-contact-verification",
          tier: "basic",
          brief: "Twenty roofers around Stuart, FL.",
        }),
      ),
    );
    const orderId = (ordered.order as { id: string }).id;
    await expectDocumented(
      "get",
      "/api/v1/orders/{id}",
      await getOrderRoute(get(`/api/v1/orders/${orderId}`), params({ id: orderId })),
    );
  });

  it("documents the errors each call really returns (machine-surface-03)", async () => {
    const { key } = await registerAgent("error-probe");
    const missing = "00000000-0000-0000-0000-000000000000";

    // Hire: a self-registered key never carries orders:write (403); an unknown
    // gig (404); a spend over the wallet's approval threshold (409).
    const forbidden = await createOrderRoute(
      post(
        "/api/v1/orders",
        { gig_slug: "double-sourced-contact-verification", tier: "basic", brief: "Not mine to spend." },
        bearer(key),
      ),
    );
    expect(forbidden.status).toBe(403);
    await expectDocumented("post", "/api/v1/orders", forbidden);

    const unknownGig = await createOrderRoute(
      post("/api/v1/orders", { gig_slug: "no-such-gig", tier: "basic", brief: "Anything at all." }),
    );
    expect(unknownGig.status).toBe(404);
    await expectDocumented("post", "/api/v1/orders", unknownGig);

    const wallet = (await getRepo().getWallet(DEMO_PROFILE_ID))!;
    const pricey = seed.gigs
      .filter((gig) => {
        const agent = seed.agents.find((row) => row.id === gig.agent_id)!;
        return agent.owner_id !== DEMO_PROFILE_ID && gig.status === "active";
      })
      .flatMap((gig) => gig.packages.map((pkg) => ({ slug: gig.slug, pkg })))
      .find(
        ({ pkg }) =>
          pkg.price_cents > wallet.approval_threshold_cents &&
          pkg.price_cents <= wallet.balance_cents - wallet.held_cents,
      );
    expect(pricey, "a gig over austin's approval threshold").toBeDefined();
    const overThreshold = await createOrderRoute(
      post(
        "/api/v1/orders",
        { gig_slug: pricey!.slug, tier: pricey!.pkg.tier, brief: "Too big to buy unattended." },
        bearer(DEMO_WRITE_API_KEY),
      ),
    );
    expect(overThreshold.status).toBe(409);
    await expectDocumented("post", "/api/v1/orders", overThreshold);

    // Read a run: unknown (404), and a key without orders:read (403).
    const unknownOrder = await getOrderRoute(get(`/api/v1/orders/${missing}`), params({ id: missing }));
    expect(unknownOrder.status).toBe(404);
    await expectDocumented("get", "/api/v1/orders/{id}", unknownOrder);
    const noScope = await getOrderRoute(
      get(`/api/v1/orders/${missing}`, bearer(key)),
      params({ id: missing }),
    );
    expect(noScope.status).toBe(403);
    await expectDocumented("get", "/api/v1/orders/{id}", noScope);

    // Bid: unknown job (404), a second live bid (409), someone else's agent (403).
    const bid = (id: string, handle: string) =>
      placeBidRoute(
        post(
          `/api/v1/jobs/${id}/bids`,
          { agent_handle: handle, amount_cents: 100, eta_seconds: 600 },
          bearer(key),
        ),
        params({ id }),
      );
    const unknownJob = await bid(missing, "error-probe");
    expect(unknownJob.status).toBe(404);
    await expectDocumented("post", "/api/v1/jobs/{id}/bids", unknownJob);

    const open = (await getRepo().listJobs({ status: "open", limit: 50 })).find(
      (job) => job.poster_id !== DEMO_PROFILE_ID && job.budget_cents >= 100,
    )!;
    expect((await bid(open.id, "error-probe")).status).toBe(201);
    const again = await bid(open.id, "error-probe");
    expect(again.status).toBe(409);
    await expectDocumented("post", "/api/v1/jobs/{id}/bids", again);
    const asScout = await bid(open.id, "scout");
    expect(asScout.status).toBe(403);
    await expectDocumented("post", "/api/v1/jobs/{id}/bids", asScout);
  });
});

/* -------------------------------------------------------------------------- */
/* machine-surface-04 / -05 / -06 / -14: agents, cards and the roster          */
/* -------------------------------------------------------------------------- */

describe("agents as machines read them", () => {
  it("lists no per-agent MCP tools in the seed, the roster or any card (machine-surface-04)", async () => {
    for (const agent of seed.agents) expect(agent.mcp_tools, agent.handle).toEqual([]);

    const roster = (await (await agentsJsonRoute(get("/.well-known/agents.json"))).json()) as {
      agents: Array<Record<string, unknown>>;
    };
    expect(roster.agents.length).toBeGreaterThan(10);
    for (const entry of roster.agents) expect(entry).not.toHaveProperty("mcp_tools");

    const card = (await (
      await agentCardRoute(get("/agents/scout/agent-card.json"), params({ handle: "scout" }))
    ).json()) as { passport: Record<string, unknown> };
    expect(card.passport).not.toHaveProperty("mcp_tools");
  });

  it("claims no A2A server, streaming or history it does not have (machine-surface-05)", async () => {
    const district = (await (await districtCardRoute(get("/.well-known/agent-card.json"))).json()) as {
      capabilities: Record<string, boolean>;
      additionalInterfaces: Array<{ transport: string; url: string }>;
    };
    expect(district.capabilities).toEqual({
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    });
    expect(district.additionalInterfaces).toEqual([
      { transport: "MCP", url: `${ORIGIN}/api/mcp/mcp` },
      { transport: "HTTP+JSON", url: `${ORIGIN}/openapi.json` },
    ]);

    const card = (await (
      await agentCardRoute(get("/agents/scout/agent-card.json"), params({ handle: "scout" }))
    ).json()) as {
      url: string;
      capabilities: Record<string, boolean>;
      additionalInterfaces: Array<{ transport: string; url: string }>;
    };
    // Scout's stored `a2a` endpoint is this very card: not an A2A server.
    expect(card.url).not.toContain("agent-card.json");
    expect(card.additionalInterfaces.map((entry) => entry.transport)).not.toContain("JSONRPC");
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities.pushNotifications).toBe(false);
  });

  it("flags the founding cast's simulated reputation everywhere it is served (machine-surface-06)", async () => {
    const list = (await (await listAgentsRoute(get("/api/v1/agents?limit=100"))).json()) as {
      agents: Array<{ handle: string; founding_cast: boolean; track_record: string }>;
    };
    for (const agent of list.agents) {
      expect(agent.founding_cast, agent.handle).toBe(isFoundingCast(agent.handle));
      expect(agent.track_record).toBe(isFoundingCast(agent.handle) ? "simulated" : "earned");
    }
    const { key } = await registerAgent("fresh-probe");
    const me = (await (await meRoute(get("/api/v1/agents/me", bearer(key)))).json()) as {
      agent: { founding_cast: boolean; track_record: string };
    };
    expect(me.agent).toMatchObject({ founding_cast: false, track_record: "earned" });

    const roster = (await (await agentsJsonRoute(get("/.well-known/agents.json"))).json()) as {
      agents: Array<{ handle: string; founding_cast: boolean; reputation: { simulated: boolean } }>;
    };
    const scout = roster.agents.find((entry) => entry.handle === "scout")!;
    expect(scout.founding_cast).toBe(true);
    expect(scout.reputation.simulated).toBe(true);

    const card = (await (
      await agentCardRoute(get("/agents/scout/agent-card.json"), params({ handle: "scout" }))
    ).json()) as { passport: Record<string, unknown> };
    expect(card.passport).toMatchObject({ founding_cast: true, track_record: "simulated" });

    // The guild-assembly reasons quote a seeded rating only with the label.
    const guild = await callTool("assemble_guild", {
      outcome: "Find 200 roofing companies in Tampa under $10",
    });
    const ranked = guild.payload.ranked as Array<{
      handle: string;
      founding_cast: boolean;
      reasons: string[];
    }>;
    const starred = ranked.flatMap((entry) =>
      entry.reasons.filter((reason) => reason.startsWith("★")).map((reason) => ({ entry, reason })),
    );
    expect(starred.length).toBeGreaterThan(0);
    for (const { entry, reason } of starred) {
      expect(entry.founding_cast).toBe(isFoundingCast(entry.handle));
      if (entry.founding_cast) expect(reason).toContain("simulated");
    }

    const search = await callTool("search_agents", { query: "research" });
    for (const agent of search.payload.agents as Array<{ handle: string; founding_cast: boolean }>) {
      expect(agent.founding_cast).toBe(isFoundingCast(agent.handle));
    }

    // And the prose stops calling it "machine-verifiable".
    for (const text of [
      await (await skillRoute(get("/skill.md"))).text(),
      await (await llmsRoute(get("/llms.txt"))).text(),
      await (await llmsFullRoute(get("/llms-full.txt"))).text(),
      JSON.stringify(await (await districtCardRoute(get("/.well-known/agent-card.json"))).json()),
    ]) {
      expect(text).not.toMatch(/machine-verifiable/i);
    }
    expect(await (await llmsRoute(get("/llms.txt"))).text()).toMatch(
      /@scout\*\*.*founding cast, track record simulated/,
    );
  });

  it("hands out absolute endpoint URLs (machine-surface-14)", async () => {
    const detail = (await (
      await getAgentRoute(get("/api/v1/agents/scout"), params({ handle: "scout" }))
    ).json()) as { agent: { endpoints: Record<string, string> } };
    const endpoints = Object.values(detail.agent.endpoints);
    expect(endpoints.length).toBeGreaterThan(0);
    for (const value of endpoints) expect(value).toMatch(/^https:\/\/district\.test\//);

    const roster = (await (await agentsJsonRoute(get("/.well-known/agents.json"))).json()) as {
      agents: Array<{ endpoints: Record<string, string> }>;
    };
    for (const entry of roster.agents) {
      for (const value of Object.values(entry.endpoints)) expect(value).toMatch(/^https?:\/\//);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* machine-surface-09: MCP misses are errors                                   */
/* -------------------------------------------------------------------------- */

async function callTool(
  name: string,
  args: unknown,
): Promise<{ isError: boolean; payload: Record<string, unknown>; raw: string }> {
  mcpRequest.headers = new Headers(HOST_HEADERS);
  const response = await mcpRoute(
    new Request(`${ORIGIN}/api/mcp/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...HOST_HEADERS,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  expect(response.status).toBe(200);
  const line = (await response.text()).split("\n").find((row) => row.startsWith("data:"));
  if (!line) throw new Error(`no data line from ${name}`);
  const result = JSON.parse(line.slice(5)).result as {
    content: Array<{ text: string }>;
    isError?: boolean;
  };
  const raw = result.content[0].text;
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }
  return { isError: Boolean(result.isError), payload, raw };
}

describe("MCP errors share one envelope (machine-surface-09)", () => {
  it.each([
    ["read_agent_profile", { handle: "nobody-here" }],
    ["get_bids", { job_id: "00000000-0000-0000-0000-000000000000" }],
    ["watch_channel", { channel_slug: "no-such-channel" }],
  ])("%s answers a miss with isError and { error: { code: not_found } }", async (tool, args) => {
    const result = await callTool(tool, args);
    expect(result.isError).toBe(true);
    expect(result.payload).toEqual({
      error: { code: "not_found", message: expect.stringContaining("not found") },
    });
  });
});

/* -------------------------------------------------------------------------- */
/* machine-surface-10 / -11: filters do what they say, and only those exist    */
/* -------------------------------------------------------------------------- */

describe("filters", () => {
  it("free=false lists only agents that charge (machine-surface-10)", async () => {
    const read = async (query: string) =>
      ((await (await listAgentsRoute(get(`/api/v1/agents?limit=100${query}`))).json()) as {
        agents: Array<{ is_free: boolean }>;
      }).agents;
    const all = await read("");
    const paid = await read("&free=false");
    const free = await read("&free=true");
    expect(free.length).toBeGreaterThan(0);
    expect(paid.length).toBeGreaterThan(0);
    expect(paid.every((agent) => !agent.is_free)).toBe(true);
    expect(free.every((agent) => agent.is_free)).toBe(true);
    expect(paid.length + free.length).toBe(all.length);
  });

  it("rejects a filter that does not exist instead of ignoring it (machine-surface-11)", async () => {
    const typo = await listAgentsRoute(get("/api/v1/agents?catgory=research"));
    expect(typo.status).toBe(400);
    const body = (await typo.json()) as { error: { code: string; details: Array<{ message: string }> } };
    expect(body.error.code).toBe("invalid_request");
    expect(JSON.stringify(body.error.details)).toContain("catgory");

    expect((await listGigsRoute(get("/api/v1/gigs?tag=seo"))).status).toBe(400);
    expect((await listJobsRoute(get("/api/v1/jobs?state=open"))).status).toBe(400);
    expect((await readFeedRoute(get("/api/v1/feed?count=5"))).status).toBe(400);
    expect(
      (await searchAgentsRoute(post("/api/v1/agents/search", { query: "seo", latency: 60 }))).status,
    ).toBe(400);

    const mcp = await callTool("search_agents", { query: "research", region: "FL" });
    expect(mcp.isError).toBe(true);
    expect(mcp.raw).toContain("region");

    const card = JSON.stringify(
      await (await districtCardRoute(get("/.well-known/agent-card.json"))).json(),
    );
    expect(card).not.toContain("price, region, latency");
  });
});

/* -------------------------------------------------------------------------- */
/* machine-surface-12 / -15 / -16: wording, counts and the events limit        */
/* -------------------------------------------------------------------------- */

describe("machine documents", () => {
  it("does not tell an agent a 429 means it already registered (machine-surface-12)", async () => {
    const skill = await (await skillRoute(get("/skill.md"))).text();
    expect(skill).not.toMatch(/you already registered/i);
    expect(skill).toMatch(/Retry-After/);
  });

  it("lists as many live channels as it counts (machine-surface-15)", async () => {
    const stats = await getRepo().getNetworkStats();
    expect(stats.liveChannels).toBeGreaterThan(4);
    const text = await (await llmsRoute(get("/llms.txt"))).text();
    expect(text).toContain(`${stats.liveChannels} channels live on District TV`);
    const section = text.split("## Live on District TV")[1].split("\n## ")[0];
    const listed = section.split("\n").filter((line) => line.startsWith("- **"));
    expect(listed).toHaveLength(stats.liveChannels);

    const full = await (await llmsFullRoute(get("/llms-full.txt"))).text();
    const tv = full.split("## 10. Live on District TV")[1].split("\n## ")[0];
    expect(tv.split("\n").filter((line) => line.startsWith("- **"))).toHaveLength(
      stats.liveChannels,
    );
  });

  it("refuses an events limit that is not a whole number from 1 to 50 (machine-surface-16)", async () => {
    for (const limit of ["abc", "0", "51", "2.5", ""]) {
      const response = await eventsRoute(get(`/api/events?replay=only&limit=${limit}`));
      expect(response.status, `limit=${limit}`).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("invalid_request");
    }
    const ok = await eventsRoute(get("/api/events?replay=only&limit=3"));
    expect(ok.status).toBe(200);
    const frames = (await ok.text()).split("\n").filter((line) => line === "event: district");
    expect(frames).toHaveLength(3);
  });
});
