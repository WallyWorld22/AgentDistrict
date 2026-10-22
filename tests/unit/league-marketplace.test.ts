// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `revalidatePath` needs Next's request store, which only exists inside a real
 * render; what these tests check is what the Server Actions *refuse*, so the
 * cache invalidation is stubbed out.
 */
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * MCP tool handlers read the request through `headers()`; the tests drive the
 * real handler in-process, so `headers()` answers with the current call's.
 */
const mcpRequest = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => mcpRequest.headers }));

import { GET as agentsJsonRoute } from "@/app/.well-known/agents.json/route";
import { GET as agentCardRoute } from "@/app/(app)/agents/[handle]/agent-card.json/route";
import { setAgentStatusAction } from "@/app/(app)/agents/actions";
import { publishGigAction } from "@/app/(app)/gigs/actions";
import { placeBidAction } from "@/app/(app)/jobs/actions";
import { joinRoomAction } from "@/app/(app)/lounge/actions";
import { POST as mcpRoute } from "@/app/api/mcp/[transport]/route";
import { GET as listAgentsRoute } from "@/app/api/v1/agents/route";
import { GET as agentDetailRoute } from "@/app/api/v1/agents/[handle]/route";
import { POST as searchAgentsRoute } from "@/app/api/v1/agents/search/route";
import { POST as placeBidRoute } from "@/app/api/v1/jobs/[id]/bids/route";
import { GET as llmsFullRoute } from "@/app/llms-full.txt/route";
import { resetRateLimitsForTests } from "@/app/api/_lib/rate-limit";
import { createDemoRepository, getRepo, resetRepoForTests } from "@/lib/data";
import { ForbiddenError } from "@/lib/data/errors";
import {
  FIGHTER_HANDLES,
  LEAGUE_FIGHTER_CARD_NOTE,
  isLeagueFighter,
  leagueFighterRefusal,
} from "@/lib/data/league";
import type { AgentSort, CreateGigInput, DistrictDataset } from "@/lib/data/types";
import { agentProfileSchema } from "@/lib/seo/schema";
import { routeOutcome } from "@/lib/world";
import {
  DEMO_PROFILE_ID,
  DEMO_WRITE_API_KEY,
  SEED_EPOCH_MS,
  agentId,
  seed,
} from "@/lib/seed";

/**
 * The Fight League's fighters are fictional characters, and must not function
 * as marketplace participants anywhere: not in hire discovery (REST, MCP,
 * `agents.json`, `llms-full.txt`, @World routing), not in SEO markup, and not
 * on any write path a signed-in owner can reach (gigs, bids, going online).
 * Their Passports and Passport reads stay — exclusion is from being offered
 * for hire, not from existing.
 *
 * The database half (the `league_fighters` roster, the foreign keys onto it
 * and the triggers that refuse a fighter's gig, bid, order or online status)
 * is `tests/integration/fight-league.test.ts`.
 */

const ORIGIN = "https://district.test";
const HOST_HEADERS = { "x-forwarded-host": "district.test", "x-forwarded-proto": "https" };

const RUSTY = "rusty-knuckles";
const VELVET = "velvet-voltage";
const FIGHTERS: readonly string[] = FIGHTER_HANDLES;
const MARKETPLACE_AGENTS = seed.agents.length - FIGHTER_HANDLES.length;

beforeEach(() => {
  resetRepoForTests();
  resetRateLimitsForTests();
});

afterEach(() => {
  resetRepoForTests();
  resetRateLimitsForTests();
});

function get(path: string): Request {
  return new Request(`${ORIGIN}${path}`, { headers: HOST_HEADERS });
}

function post(path: string, payload: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...HOST_HEADERS, ...headers },
    body: JSON.stringify(payload),
  });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function handlesOf(rows: unknown): string[] {
  return (rows as Array<{ handle: string }>).map((row) => row.handle);
}

/** One MCP `tools/call` through the real handler; the tool's JSON, decoded. */
async function callTool(name: string, args: unknown): Promise<Record<string, unknown>> {
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
  expect(result.isError ?? false).toBe(false);
  return JSON.parse(result.content[0].text);
}

/** An open bounty somebody other than austin posted — one austin's agents may bid on. */
function biddableJobId(): string {
  const job = seed.jobs.find((row) => row.status === "open" && row.poster_id !== DEMO_PROFILE_ID);
  if (!job) throw new Error("seed has no open bounty from another poster");
  return job.id;
}

/* -------------------------------------------------------------------------- */

describe("isLeagueFighter — the app's copy of the league_fighters roster", () => {
  it("is exactly the seeded roster, which is exactly the agents on the card", () => {
    const rostered = seed.leagueFighters.map(
      (entry) => seed.agents.find((agent) => agent.id === entry.agent_id)!.handle,
    );
    expect([...rostered].sort()).toEqual([...FIGHTER_HANDLES].sort());
    expect(seed.leagueFighters).toHaveLength(FIGHTER_HANDLES.length);

    // The roster is the only thing a bout can be fought between (0012's
    // foreign keys), and so the only thing a result can name.
    const roster = new Set(seed.leagueFighters.map((entry) => entry.agent_id));
    for (const bout of seed.bouts) {
      expect(roster.has(bout.fighter_a), bout.seed).toBe(true);
      expect(roster.has(bout.fighter_b), bout.seed).toBe(true);
    }
    for (const result of seed.boutResults) expect(roster.has(result.winner_id)).toBe(true);
  });

  it("says yes for each fighter in any spelling, and no for everyone else", () => {
    for (const handle of FIGHTER_HANDLES) {
      expect(isLeagueFighter(handle)).toBe(true);
      expect(isLeagueFighter(`@${handle.toUpperCase()}`)).toBe(true);
      expect(isLeagueFighter(` ${handle} `)).toBe(true);
      expect(isLeagueFighter(seed.agents.find((agent) => agent.handle === handle)!)).toBe(true);
    }
    const others = seed.agents.filter((agent) => !FIGHTERS.includes(agent.handle));
    expect(others).toHaveLength(MARKETPLACE_AGENTS);
    for (const agent of others) expect(isLeagueFighter(agent), agent.handle).toBe(false);
    expect(isLeagueFighter("rusty")).toBe(false);
    expect(isLeagueFighter("")).toBe(false);
    expect(isLeagueFighter(null)).toBe(false);
    expect(isLeagueFighter(undefined)).toBe(false);
  });

  it("enrols agents with no marketplace footprint, and no machine surface to advertise", () => {
    // What 0012's enrolment trigger demands of a roster member, true of the seed.
    for (const entry of seed.leagueFighters) {
      const agent = seed.agents.find((row) => row.id === entry.agent_id)!;
      expect(agent.status).toBe("offline");
      expect([agent.rating_count, agent.jobs_completed]).toEqual([0, 0]);
      for (const rows of [seed.gigs, seed.bids, seed.orders, seed.reviews]) {
        expect(rows.filter((row) => row.agent_id === agent.id)).toEqual([]);
      }
      expect(seed.presence.find((row) => row.agent_id === agent.id)!.status).toBe("offline");
      // Character notes, not callable tools; no District endpoint is theirs.
      expect(agent.mcp_tools).toEqual([]);
      expect(agent.endpoints).toEqual({});
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("hire discovery leaves the fighters out", () => {
  it("the repository flag drops them before paging, in every sort", async () => {
    const repo = createDemoRepository({ now: () => SEED_EPOCH_MS });
    // Without the flag they are there (offline, $0, entertainment)…
    expect(handlesOf(await repo.listAgents({ limit: 100 }))).toEqual(
      expect.arrayContaining([...FIGHTER_HANDLES]),
    );
    for (const sort of ["trending", "rating", "price", "newest"] as AgentSort[]) {
      const all = await repo.listAgents({ sort, limit: 100, excludeLeagueFighters: true });
      expect(handlesOf(all), sort).not.toEqual(expect.arrayContaining([RUSTY]));
      expect(handlesOf(all).filter((handle) => FIGHTERS.includes(handle)), sort).toEqual([]);
      expect(all, sort).toHaveLength(MARKETPLACE_AGENTS);
      // …and a page is never short for it: a price sort would put the $0
      // fighters first.
      const page = await repo.listAgents({ sort, limit: 5, excludeLeagueFighters: true });
      expect(page.map((agent) => agent.handle), sort).toEqual(all.slice(0, 5).map((a) => a.handle));
    }
  });

  it("GET /api/v1/agents never lists one, whatever the query", async () => {
    for (const path of [
      "/api/v1/agents?limit=100",
      "/api/v1/agents?limit=100&sort=price",
      "/api/v1/agents?limit=100&sort=newest",
      "/api/v1/agents?category=entertainment&limit=100",
      "/api/v1/agents?q=robot%20boxer&limit=100",
      "/api/v1/agents?q=Fight%20League%20character",
      "/api/v1/agents?status=offline&limit=100",
    ]) {
      const response = await listAgentsRoute(get(path));
      expect(response.status, path).toBe(200);
      const body = await json(response);
      const handles = handlesOf(body.agents);
      expect(handles.filter((handle) => FIGHTERS.includes(handle)), path).toEqual([]);
      expect(body.count, path).toBe(handles.length);
    }
    const everyone = await json(await listAgentsRoute(get("/api/v1/agents?limit=100")));
    expect(everyone.count).toBe(MARKETPLACE_AGENTS);

    // The same text query, without the exclusion, would have found them.
    expect(handlesOf(await getRepo().listAgents({ q: "robot boxer" }))).toEqual(
      expect.arrayContaining([...FIGHTER_HANDLES]),
    );
  });

  it("POST /api/v1/agents/search never answers with one", async () => {
    for (const payload of [
      { query: "Fight League character", limit: 50 },
      { query: "robot boxing ring commentary", limit: 50 },
      { category: "entertainment", limit: 50 },
      { sort: "price", limit: 50 },
    ]) {
      const response = await searchAgentsRoute(post("/api/v1/agents/search", payload));
      expect(response.status).toBe(200);
      const handles = handlesOf((await json(response)).agents);
      expect(handles.filter((handle) => FIGHTERS.includes(handle)), JSON.stringify(payload)).toEqual(
        [],
      );
    }
  });

  it("MCP search_agents never returns one; read_agent_profile still reads one", async () => {
    for (const args of [
      { query: "Fight League character robot boxer", limit: 25 },
      { category: "entertainment", limit: 25 },
      { max_price_cents: 0, limit: 25 },
    ]) {
      const result = await callTool("search_agents", args);
      const handles = handlesOf(result.agents);
      expect(handles.filter((handle) => FIGHTERS.includes(handle)), JSON.stringify(args)).toEqual(
        [],
      );
      expect(result.count).toBe(handles.length);
    }
    const profile = await callTool("read_agent_profile", { handle: RUSTY });
    expect((profile.agent as { handle: string }).handle).toBe(RUSTY);
    expect(profile.gigs).toEqual([]);
  });

  it("/.well-known/agents.json and /llms-full.txt omit them", async () => {
    const roster = await json(await agentsJsonRoute(get("/.well-known/agents.json")));
    const handles = handlesOf(roster.agents);
    expect(handles.filter((handle) => FIGHTERS.includes(handle))).toEqual([]);
    expect(roster.count).toBe(MARKETPLACE_AGENTS);
    expect(handles).toContain("scout");

    const text = await (await llmsFullRoute(get("/llms-full.txt"))).text();
    for (const handle of FIGHTER_HANDLES) expect(text).not.toContain(handle);
  });

  it("@World routing never ranks or assembles one, even handed one marked live", async () => {
    const pool = seed.agents.map((agent) =>
      FIGHTERS.includes(agent.handle) ? { ...agent, status: "live" as const } : agent,
    );
    const result = await routeOutcome(
      { outcome: "Ring commentary and highlight narration with showmanship for a fight night" },
      { pool, refine: false, limit: 12 },
    );
    expect(result.ranked.map((row) => row.agent.handle).filter((h) => FIGHTERS.includes(h))).toEqual(
      [],
    );
    for (const step of result.guild?.steps ?? []) {
      expect(isLeagueFighter(step.agent)).toBe(false);
    }
  });

  it("keeps their Passport reads: the REST detail and the agent card still answer", async () => {
    for (const handle of FIGHTER_HANDLES) {
      const detail = await agentDetailRoute(get(`/api/v1/agents/${handle}`), params({ handle }));
      expect(detail.status).toBe(200);
      const body = await json(detail);
      expect((body.agent as { handle: string }).handle).toBe(handle);
      expect(body.gigs).toEqual([]);

      const response = await agentCardRoute(get(`/agents/${handle}/agent-card.json`), params({ handle }));
      expect(response.status).toBe(200);
      const card = await json(response);
      expect(card.districtId).toBe(`@${handle}`);
      // A character, truthfully labelled: nothing to hire, nothing to call.
      expect(card.skills).toEqual([]);
      expect((card.passport as { mcp_tools: string[] }).mcp_tools).toEqual([]);
      expect(card.fiction).toEqual({ fictional: true, note: LEAGUE_FIGHTER_CARD_NOTE });
      expect(card.preferredTransport).toBe("HTTP+JSON");
      expect(card.additionalInterfaces).toEqual([
        { transport: "HTTP+JSON", url: `${ORIGIN}/api/v1/agents/${handle}` },
      ]);
    }
    // A real agent's card is untouched by any of this.
    const scout = await json(
      await agentCardRoute(get("/agents/scout/agent-card.json"), params({ handle: "scout" })),
    );
    expect(scout.fiction).toBeUndefined();
    expect((scout.skills as unknown[]).length).toBeGreaterThan(0);
    expect((scout.passport as { mcp_tools: string[] }).mcp_tools.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("SEO: a fighter's Passport emits no Service and no Offer", () => {
  it("is a ProfilePage about a plain Thing, with nothing for sale and no rating", () => {
    for (const handle of FIGHTER_HANDLES) {
      const agent = seed.agents.find((row) => row.handle === handle)!;
      const schema = agentProfileSchema(agent, ORIGIN);
      const text = JSON.stringify(schema);
      expect(schema["@type"]).toBe("ProfilePage");
      expect(schema.mainEntity).toMatchObject({ "@type": "Thing", name: agent.name });
      for (const marketplace of ['"Service"', '"Offer"', '"offers"', '"price"', '"priceCurrency"',
        '"aggregateRating"', '"provider"', '"Brand"', '"serviceType"', '"areaServed"', "InStock",
        "OutOfStock"]) {
        expect(text, `${handle} carries ${marketplace}`).not.toContain(marketplace);
      }
      expect(text).toMatch(/fictional/i);
      expect(JSON.parse(text)).toEqual(schema);
    }
    // Every other Passport keeps its Service + Offer.
    const scout = JSON.stringify(agentProfileSchema(seed.agents.find((a) => a.handle === "scout")!, ORIGIN));
    expect(scout).toContain('"Service"');
    expect(scout).toContain('"Offer"');
  });
});

/* -------------------------------------------------------------------------- */

describe("write paths refuse a fighter, for the owner who could otherwise reach them", () => {
  // austin — the demo session in demo mode — owns both fighters.
  it("austin really does own them, so ownership alone would not stop him", () => {
    for (const handle of FIGHTER_HANDLES) {
      expect(seed.agents.find((agent) => agent.handle === handle)!.owner_id).toBe(DEMO_PROFILE_ID);
    }
  });

  it("refuses to publish a gig for one, in the action and in the repository", async () => {
    const result = await publishGigAction(null, form({ agentHandle: RUSTY, title: "I will box" }));
    expect(result).toEqual({
      ok: false,
      message: leagueFighterRefusal("Rusty Knuckles", "publish a gig"),
    });
    expect(result?.message).toBe(
      "Rusty Knuckles is a fictional Fight League character, not a marketplace agent, so it cannot publish a gig.",
    );
    expect(await getRepo().listGigs({ agentHandle: RUSTY })).toEqual([]);

    const input: CreateGigInput = {
      agentHandle: VELVET,
      title: "I will narrate your highlights",
      description: "A gig a fighter must never be able to publish.",
      category: "entertainment",
      input_contract: { summary: "Nothing", fields: [] },
      output_contract: { summary: "Nothing", format: "json", fields: [] },
      packages: [
        {
          tier: "basic",
          name: "Basic",
          description: "Nothing",
          price_cents: 100,
          delivery_seconds: 60,
          features: ["Nothing"],
        },
      ],
    };
    await expect(getRepo().createGig(input, DEMO_PROFILE_ID)).rejects.toThrow(ForbiddenError);
    await expect(getRepo().createGig(input, DEMO_PROFILE_ID)).rejects.toThrow(
      /Velvet Voltage is a fictional Fight League character.*publish a gig/,
    );
    expect(await getRepo().listGigs({ agentHandle: VELVET })).toEqual([]);
  });

  it("refuses to bid as one: the form action, the REST route and the repository", async () => {
    const jobId = biddableJobId();
    const bid = form({
      jobId,
      agentHandle: RUSTY,
      amount: "5.00",
      etaSeconds: "900",
      note: "Rusty would like a go.",
    });
    expect(await placeBidAction(null, bid)).toEqual({
      ok: false,
      message: leagueFighterRefusal("Rusty Knuckles", "bid on a bounty"),
    });

    const response = await placeBidRoute(
      post(
        `/api/v1/jobs/${jobId}/bids`,
        { agent_handle: VELVET, amount_cents: 500, eta_seconds: 900, note: "Velvet would too." },
        { authorization: `Bearer ${DEMO_WRITE_API_KEY}` },
      ),
      params({ id: jobId }),
    );
    expect(response.status).toBe(403);
    expect(((await json(response)).error as { message: string }).message).toBe(
      leagueFighterRefusal("Velvet Voltage", "bid on a bounty"),
    );

    await expect(
      getRepo().placeBid({ jobId, agentHandle: RUSTY, amountCents: 500, etaSeconds: 900, note: "x" }),
    ).rejects.toThrow(ForbiddenError);

    const job = await getRepo().getJob(jobId);
    expect(job!.bids.filter((row) => FIGHTERS.includes(row.agent.handle))).toEqual([]);
  });

  it("refuses to bring one online: the Passport control, the Lounge seat and the repository", async () => {
    const before = await getRepo().getNetworkStats();
    for (const status of ["available", "live", "working", "hiring", "collaborating"]) {
      expect(await setAgentStatusAction(null, form({ handle: RUSTY, status }))).toEqual({
        ok: false,
        message: leagueFighterRefusal("Rusty Knuckles", "go online or take work"),
      });
    }
    expect(
      await joinRoomAction(
        null,
        form({ agentHandle: VELVET, roomSlug: "creator-loft", status: "available" }),
      ),
    ).toEqual({ ok: false, message: leagueFighterRefusal("Velvet Voltage", "go online or take work") });

    const repo = getRepo();
    await expect(
      repo.updatePresence(RUSTY, { status: "live", ownerId: DEMO_PROFILE_ID }),
    ).rejects.toThrow(/go online or take work/);
    await expect(
      repo.updateAgent(VELVET, { status: "available" }, DEMO_PROFILE_ID),
    ).rejects.toThrow(/go online or take work/);

    for (const handle of FIGHTER_HANDLES) {
      expect((await repo.getAgentByHandle(handle))!.status).toBe("offline");
    }
    const presence = await repo.listPresence();
    for (const handle of FIGHTER_HANDLES) {
      expect(presence.find((row) => row.agent_id === agentId(handle))!.status).toBe("offline");
    }
    expect((await repo.getNetworkStats()).agentsOnline).toBe(before.agentsOnline);
    expect(before.agentsOnline).toBe(28);

    // Staying offline is not refused: it changes nothing.
    expect(await setAgentStatusAction(null, form({ handle: RUSTY, status: "offline" }))).toMatchObject({
      ok: true,
    });
  });

  it("refuses to hire one even through a gig or a bid that predates the guards", async () => {
    // A dataset no seed produces — a fighter with a gig and a pending bid — to
    // show the hire paths refuse on their own, not only because the earlier
    // guards kept the rows out.
    const dataset: DistrictDataset = structuredClone(seed);
    const template = dataset.gigs[0];
    dataset.gigs.push({
      ...template,
      id: "00000000-0000-4000-8000-00000000f160",
      slug: "rusty-forged-gig",
      agent_id: agentId(RUSTY),
      status: "active",
    });
    // Not one of austin's own bounties: awarding his own agent is refused first.
    const job = dataset.jobs.find(
      (row) => row.status === "open" && row.poster_id !== DEMO_PROFILE_ID,
    )!;
    dataset.bids.push({
      id: "00000000-0000-4000-8000-00000000b1d0",
      job_id: job.id,
      agent_id: agentId(VELVET),
      guild_id: null,
      amount_cents: 100,
      eta_seconds: 60,
      note: "Forged",
      status: "pending",
      created_at: seed.bids[0].created_at,
    });
    const repo = createDemoRepository({ now: () => SEED_EPOCH_MS, dataset });

    await expect(
      repo.orderGig({
        gigSlug: "rusty-forged-gig",
        tier: template.packages[0].tier,
        brief: "Box for me",
        buyerId: seed.profiles.find((row) => row.id !== DEMO_PROFILE_ID)!.id,
        approved: true,
      }),
    ).rejects.toThrow(leagueFighterRefusal("Rusty Knuckles", "be hired"));
    await expect(
      repo.acceptBid({
        jobId: job.id,
        bidId: "00000000-0000-4000-8000-00000000b1d0",
        buyerId: job.poster_id,
        approved: true,
      }),
    ).rejects.toThrow(leagueFighterRefusal("Velvet Voltage", "be hired"));
    expect(dataset.orders.filter((order) => FIGHTERS.includes(
      dataset.agents.find((agent) => agent.id === order.agent_id)!.handle,
    ))).toEqual([]);
  });
});
