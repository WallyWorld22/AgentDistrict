// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { GET as agentCard } from "@/app/.well-known/agent-card.json/route";
import { GET as agentsJson } from "@/app/.well-known/agents.json/route";
import { GET as agentCardForHandle } from "@/app/(app)/agents/[handle]/agent-card.json/route";
import { GET as events } from "@/app/api/events/route";
import { GET as listAgents } from "@/app/api/v1/agents/route";
import { GET as getAgent } from "@/app/api/v1/agents/[handle]/route";
import { POST as searchAgents } from "@/app/api/v1/agents/search/route";
import { GET as liveChannels } from "@/app/api/v1/channels/live/route";
import { GET as listGigs } from "@/app/api/v1/gigs/route";
import { GET as getGig } from "@/app/api/v1/gigs/[slug]/route";
import { GET as listJobs, POST as createJob } from "@/app/api/v1/jobs/route";
import { GET as getJob } from "@/app/api/v1/jobs/[id]/route";
import { POST as createOrder } from "@/app/api/v1/orders/route";
import { GET as getOrder } from "@/app/api/v1/orders/[id]/route";
import { GET as stats } from "@/app/api/v1/stats/route";
import { POST as worldRoute } from "@/app/api/v1/world/route/route";
import { GET as llms } from "@/app/llms.txt/route";
import { GET as openapi } from "@/app/openapi.json/route";
import { GET as skill } from "@/app/skill.md/route";
import { MCP_TOOLS } from "@/lib/site";
import { DEMO_API_KEY, DEMO_WRITE_API_KEY, FEATURED_GIG_SLUGS } from "@/lib/seed";

/**
 * Route handlers are just functions of a `Request`, so the API contract can be
 * tested without a server: status codes, the error envelope, cache headers and
 * the discovery documents.
 */

const ORIGIN = "http://localhost:3000";

function get(path: string, init?: RequestInit): Request {
  return new Request(`${ORIGIN}${path}`, init);
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("GET /api/v1/stats", () => {
  it("returns live counters and is edge-cacheable", async () => {
    const response = await stats();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");

    const body = await json(response);
    expect(body.agentsOnline).toBeGreaterThan(0);
    expect(body.gigsAvailable).toBeGreaterThan(0);
    // The cosmetic District-wide `headline` baseline is a home-hero figure and
    // must never reach a machine caller as if it were a row count.
    expect(body.headline).toBeUndefined();
  });
});

describe("agents", () => {
  it("searches by free text", async () => {
    const response = await listAgents(get("/api/v1/agents?q=scout&limit=5"));
    expect(response.status).toBe(200);

    const body = await json(response);
    const agents = body.agents as Array<{ handle: string }>;
    expect(agents.map((agent) => agent.handle)).toContain("scout");
    expect(body.count).toBe(agents.length);
  });

  it("rejects an out-of-range limit with the error envelope", async () => {
    const response = await listAgents(get("/api/v1/agents?limit=9999"));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await json(response);
    expect(body.error).toMatchObject({ code: "invalid_request" });
  });

  it("filters by category and price", async () => {
    const response = await listAgents(
      get("/api/v1/agents?category=research&max_price_cents=2000&sort=rating"),
    );
    const body = await json(response);
    const agents = body.agents as Array<{ category: string; starting_price_cents: number }>;
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(agent.category).toBe("research");
      expect(agent.starting_price_cents).toBeLessThanOrEqual(2000);
    }
  });

  it("accepts a structured POST search", async () => {
    const response = await searchAgents(
      post("/api/v1/agents/search", { query: "roof", region: "FL", limit: 5 }),
    );
    expect(response.status).toBe(200);
    const body = await json(response);
    expect((body.agents as unknown[]).length).toBeGreaterThan(0);
  });

  it("reads one Passport and 404s on a miss", async () => {
    const found = await getAgent(get("/api/v1/agents/scout"), params({ handle: "scout" }));
    expect(found.status).toBe(200);
    const body = await json(found);
    expect((body.agent as { handle: string }).handle).toBe("scout");
    expect(body.agent_card).toContain("/agents/scout/agent-card.json");
    expect(Array.isArray(body.gigs)).toBe(true);

    const missing = await getAgent(get("/api/v1/agents/nobody"), params({ handle: "nobody" }));
    expect(missing.status).toBe(404);
    expect((await json(missing)).error).toMatchObject({ code: "not_found" });
  });
});

describe("gigs", () => {
  it("lists gigs and reads one by slug", async () => {
    const list = await listGigs(get("/api/v1/gigs?limit=5&sort=price"));
    expect(list.status).toBe(200);
    expect(((await json(list)).gigs as unknown[]).length).toBe(5);

    const slug = FEATURED_GIG_SLUGS[0];
    const one = await getGig(get(`/api/v1/gigs/${slug}`), params({ slug }));
    expect(one.status).toBe(200);
    const body = await json(one);
    expect((body.gig as { slug: string }).slug).toBe(slug);
    expect((body.agent as { handle: string }).handle).toBeTruthy();
  });

  it("404s on an unknown gig", async () => {
    const response = await getGig(get("/api/v1/gigs/nope"), params({ slug: "nope" }));
    expect(response.status).toBe(404);
  });
});

describe("jobs", () => {
  it("rejects an invalid body with a detailed 400", async () => {
    const response = await createJob(
      post("/api/v1/jobs", { title: "no", budget_cents: -5 }),
    );
    expect(response.status).toBe(400);

    const body = await json(response);
    const error = body.error as { code: string; message: string; details: unknown };
    expect(error.code).toBe("invalid_request");
    expect(error.message).toBe("Invalid request body");
    expect(Array.isArray(error.details)).toBe(true);
    expect((error.details as Array<{ path: string }>).map((issue) => issue.path)).toContain(
      "description",
    );
  });

  it("401s when a bearer key is presented that does not exist", async () => {
    const response = await createJob(
      post(
        "/api/v1/jobs",
        {
          title: "Find 100 gutter companies",
          description: "Name, owner, phone, email. CSV back please.",
          category: "research",
          budget_cents: 500,
          deadline_seconds: 1800,
          required_output: { format: "csv" },
        },
        { authorization: "Bearer ad_live_definitely_not_real" },
      ),
    );
    expect(response.status).toBe(401);
    expect((await json(response)).error).toMatchObject({ code: "unauthorized" });
  });

  it("creates a job as the demo profile and lists it back", async () => {
    const response = await createJob(
      post(
        "/api/v1/jobs",
        {
          title: "Find 100 gutter companies in Brevard County",
          description: "Business name, owner, phone, email, website. CSV back please.",
          category: "research",
          budget_cents: 500,
          deadline_seconds: 1800,
          required_output: { format: "csv", columns: ["business_name", "owner", "phone"] },
        },
        { authorization: `Bearer ${DEMO_WRITE_API_KEY}` },
      ),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");

    // The key published on /developers is read-only — a public key that could
    // post jobs, bid and spend the wallet is not a demo, it is an open door.
    const refused = await createJob(
      post(
        "/api/v1/jobs",
        {
          title: "Should never be created",
          description: "Posted with the public read-only demo key.",
          category: "research",
          budget_cents: 500,
          deadline_seconds: 1800,
          required_output: { format: "csv" },
        },
        { authorization: `Bearer ${DEMO_API_KEY}` },
      ),
    );
    expect(refused.status).toBe(403);

    const created = (await json(response)).job as { id: string; status: string };
    expect(created.status).toBe("open");

    const list = await listJobs(get("/api/v1/jobs?status=open&limit=50"));
    const jobs = (await json(list)).jobs as Array<{ id: string }>;
    expect(jobs.map((job) => job.id)).toContain(created.id);

    const one = await getJob(get(`/api/v1/jobs/${created.id}`), params({ id: created.id }));
    expect(one.status).toBe(200);
    expect((await json(one)).bids).toEqual([]);
  });
});

describe("orders", () => {
  it("hires a gig, then reads the run back privately", async () => {
    const slug = FEATURED_GIG_SLUGS[0];
    const response = await createOrder(
      post("/api/v1/orders", {
        gig_slug: slug,
        tier: "basic",
        brief: "50 gutter companies around Stuart, FL with owner contacts.",
      }),
    );
    expect(response.status).toBe(201);

    const order = (await json(response)).order as { id: string; status: string };
    expect(["queued", "running"]).toContain(order.status);

    const read = await getOrder(
      get(`/api/v1/orders/${order.id}`),
      params({ id: order.id }),
    );
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(((await json(read)).order as { id: string }).id).toBe(order.id);
  });

  it("rejects a body that is neither a gig purchase nor a bid acceptance", async () => {
    const response = await createOrder(post("/api/v1/orders", { nonsense: true }));
    expect(response.status).toBe(400);
    expect((await json(response)).error).toMatchObject({ code: "invalid_request" });
  });

  it("404s an order that does not exist", async () => {
    const response = await getOrder(
      get("/api/v1/orders/00000000-0000-0000-0000-000000000000"),
      params({ id: "00000000-0000-0000-0000-000000000000" }),
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /api/v1/world/route", () => {
  it("routes the canonical outcome", async () => {
    const response = await worldRoute(
      post("/api/v1/world/route", {
        outcome: "Find 200 roofing companies in Tampa under $10",
      }),
    );
    expect(response.status).toBe(200);

    const body = await json(response);
    const intent = body.intent as { quantity: number; region: string; budgetCents: number };
    expect(intent.quantity).toBe(200);
    expect(intent.region).toBe("FL");
    expect(intent.budgetCents).toBe(1000);
    expect((body.ranked as unknown[]).length).toBeGreaterThan(0);
    expect(body.formula).toContain("0.35");
  });

  it("400s an empty outcome", async () => {
    const response = await worldRoute(post("/api/v1/world/route", { outcome: "" }));
    expect(response.status).toBe(400);
  });
});

describe("GET /api/v1/channels/live", () => {
  it("only returns channels that are actually live", async () => {
    const response = await liveChannels();
    expect(response.status).toBe(200);
    const channels = (await json(response)).channels as Array<{
      is_live: boolean;
      watch_url: string;
    }>;
    expect(channels.length).toBeGreaterThan(0);
    for (const channel of channels) {
      expect(channel.is_live).toBe(true);
      expect(channel.watch_url).toContain("/tv/");
    }
  });
});

describe("machine surface", () => {
  it("openapi.json documents every /api/v1 route the app serves", async () => {
    const response = await openapi();
    expect(response.status).toBe(200);

    const document = await json(response);
    const paths = Object.keys(document.paths as Record<string, unknown>);
    for (const path of [
      "/api/v1/stats",
      "/api/v1/agents",
      "/api/v1/agents/search",
      "/api/v1/agents/{handle}",
      "/api/v1/gigs",
      "/api/v1/gigs/{slug}",
      "/api/v1/jobs",
      "/api/v1/jobs/{id}",
      "/api/v1/jobs/{id}/bids",
      "/api/v1/orders",
      "/api/v1/orders/{id}",
      "/api/v1/world/route",
      "/api/v1/channels/live",
    ]) {
      expect(paths).toContain(path);
    }

    const components = document.components as { schemas: Record<string, unknown> };
    expect(Object.keys(components.schemas)).toContain("Error");
    expect(components.schemas.Agent).toMatchObject({ type: "object" });
  });

  it("serves the District agent card", async () => {
    const response = await agentCard();
    expect(response.status).toBe(200);
    const card = await json(response);
    expect(card.protocolVersion).toBe("0.3.0");
    expect((card.skills as unknown[]).length).toBeGreaterThan(0);
    expect(card.discovery).toMatchObject({ agents: expect.stringContaining("agents.json") });
  });

  it("serves the roster with a card link per agent", async () => {
    const response = await agentsJson();
    const body = await json(response);
    expect(body.count).toBeGreaterThan(20);
    const agents = body.agents as Array<{ handle: string; agentCard: string }>;
    expect(agents[0].agentCard).toContain(`/agents/${agents[0].handle}/agent-card.json`);
  });

  it("serves a per-agent card and 404s unknown handles", async () => {
    const found = await agentCardForHandle(get("/agents/scout/agent-card.json"), params({ handle: "scout" }));
    expect(found.status).toBe(200);
    const card = await json(found);
    expect(card.districtId).toBe("@scout");
    expect((card.skills as unknown[]).length).toBeGreaterThan(0);

    const missing = await agentCardForHandle(
      get("/agents/nobody/agent-card.json"),
      params({ handle: "nobody" }),
    );
    expect(missing.status).toBe(404);
  });

  it("serves llms.txt and skill.md as text", async () => {
    const llmsResponse = await llms();
    expect(llmsResponse.headers.get("content-type")).toContain("text/plain");
    const llmsBody = await llmsResponse.text();
    expect(llmsBody).toContain("# AgentDistrict");
    expect(llmsBody).toContain("/api/mcp/mcp");
    expect(llmsBody).toContain("@scout");

    const skillResponse = await skill();
    expect(skillResponse.headers.get("content-type")).toContain("text/markdown");
    const skillBody = await skillResponse.text();
    for (const tool of MCP_TOOLS) expect(skillBody).toContain(tool);
  });

  it("replays the event feed and closes when asked", async () => {
    const response = await events(get("/api/events?replay=only&limit=5"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = await response.text(); // Resolves only because replay=only closes.
    expect(body).toContain("event: ready");
    expect(body.match(/event: district/g)?.length).toBe(5);
  });

  it("registers all nine MCP tools", () => {
    const source = readFileSync(
      new URL("../../app/api/mcp/[transport]/route.ts", import.meta.url),
      "utf8",
    );
    for (const tool of MCP_TOOLS) {
      expect(source).toContain(`"${tool}"`);
    }
    expect(source.match(/server\.registerTool\(/g)?.length).toBe(MCP_TOOLS.length);
  });
});
