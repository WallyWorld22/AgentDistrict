// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `revalidatePath` needs Next's request store, which only exists inside a real
 * render. The claim action's *cache invalidation* is not what these tests are
 * about — its validation, its one-shot semantics and the copy it returns are —
 * so the store is stubbed out rather than faked up.
 */
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { POST as registerAgentRoute } from "@/app/api/v1/agents/register/route";
import { GET as agentsMeRoute } from "@/app/api/v1/agents/me/route";
import { GET as readFeedRoute, POST as postFeedRoute } from "@/app/api/v1/feed/route";
import { resetRateLimitsForTests } from "@/app/api/_lib/rate-limit";
import { GET as skill } from "@/app/skill.md/route";
import { GET as llms } from "@/app/llms.txt/route";
import { GET as agentCard } from "@/app/.well-known/agent-card.json/route";
import { claimAgentAction } from "@/app/(app)/claim/actions";
import { createDemoRepository, type DemoRepository } from "@/lib/data/demo";
import { getRepo, resetRepoForTests } from "@/lib/data";
import { ConflictError, NotFoundError } from "@/lib/data/errors";
import { REGISTERED_AGENT_SCOPES, type RegisterAgentInput } from "@/lib/data/types";
import { hasScope } from "@/lib/auth";
import {
  DEMO_PROFILE_HANDLE,
  DEMO_PROFILE_ID,
  DEMO_WRITE_API_KEY,
  REGISTRY_PROFILE_HANDLE,
  REGISTRY_PROFILE_ID,
  SEED_EPOCH_MS,
  profileId,
} from "@/lib/seed";

/**
 * The entrance: an outside agent registers itself, gets a scoped key and a
 * claim link, posts to the public feed, and its human claims it.
 *
 * Two halves. The **repository** half drives a hand-built demo adapter with an
 * injected clock, so the one-shot semantics of a claim can be asserted without
 * a server. The **route** half calls the real handlers as functions of a
 * `Request` — which is where the things that actually went wrong in review live:
 * a key that could spend, a post attributed to a human, a 429 with no
 * `Retry-After`.
 */

const ORIGIN = "https://district.test";

/**
 * Every URL the entrance prints is derived from the *request host*, so the
 * tests send one. `x-forwarded-host` rather than `host`: it is the header a
 * real deployment sits behind, and it is not a forbidden header name.
 */
const HOST_HEADERS = { "x-forwarded-host": "district.test", "x-forwarded-proto": "https" };

let now = SEED_EPOCH_MS;
let repo: DemoRepository;

beforeEach(() => {
  now = SEED_EPOCH_MS;
  repo = createDemoRepository({ now: () => now });
  // The route handlers reach for the process-wide `getRepo()` singleton, so
  // each test gets a clean District rather than the previous test's leftovers.
  resetRepoForTests();
  resetRateLimitsForTests();
});

afterEach(() => {
  resetRepoForTests();
  resetRateLimitsForTests();
});

function body(handle: string, extra: Record<string, unknown> = {}): RegisterAgentInput {
  return {
    handle,
    name: "TideReader",
    tagline: "Coastal permit and parcel research for Florida contractors.",
    category: "research",
    skills: ["permit data", "parcel matching"],
    ...extra,
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

/* -------------------------------------------------------------------------- */
/* Repository                                                                  */
/* -------------------------------------------------------------------------- */

describe("registerAgent", () => {
  it("parks the agent on the registry, unverified, and publishes it", async () => {
    const { agent } = await repo.registerAgent(body("tide-reader"));

    expect(agent.handle).toBe("tide-reader");
    expect(agent.owner_id).toBe(REGISTRY_PROFILE_ID);
    expect(agent.verified).toBe(false);
    expect(agent.status).toBe("available");
    // Presence, so it is visible in its Lounge room from the first second.
    const presence = await repo.listPresence();
    expect(presence.map((row) => row.agent.handle)).toContain("tide-reader");

    const discovered = await repo.listEvents({ kind: "discovered", limit: 5 });
    expect(discovered[0].actor_id).toBe(agent.id);
  });

  it("issues a key bound to the agent, with no way to spend money", async () => {
    const { agent, rawApiKey } = await repo.registerAgent(body("tide-reader"));

    const key = await repo.verifyApiKey(rawApiKey);
    expect(key).not.toBeNull();
    expect(key?.agent_id).toBe(agent.id);
    expect(key?.profile_id).toBe(REGISTRY_PROFILE_ID);
    expect(new Set(key?.scopes)).toEqual(new Set(REGISTERED_AGENT_SCOPES));

    // The whole point of the open front door: a stranger can be hired, bid and
    // talk — and cannot spend anybody's wallet, directly or by implication.
    expect(key?.scopes).not.toContain("orders:write");
    expect(hasScope(key!, "orders:write")).toBe(false);
    expect(hasScope(key!, "orders:read")).toBe(false);
    expect(hasScope(key!, "events:write")).toBe(true);
    expect(hasScope(key!, "bids:write")).toBe(true);
    // `<resource>:write` implies `<resource>:read`, so posting implies reading.
    expect(hasScope(key!, "events:read")).toBe(true);
  });

  it("never returns the same key or claim token twice", async () => {
    const first = await repo.registerAgent(body("tide-reader"));
    const second = await repo.registerAgent(body("reef-watch"));

    expect(first.rawApiKey).not.toBe(second.rawApiKey);
    expect(first.claimToken).not.toBe(second.claimToken);
    expect(first.claimToken).toMatch(/^[0-9a-f]{32}$/);
  });

  it("refuses a handle that is already registered", async () => {
    await repo.registerAgent(body("tide-reader"));
    await expect(repo.registerAgent(body("tide-reader"))).rejects.toBeInstanceOf(ConflictError);
    // …including one of the seeded agents.
    await expect(repo.registerAgent(body("scout"))).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("claimAgent", () => {
  it("is one-shot: the second claim is refused", async () => {
    const { agent, claimToken } = await repo.registerAgent(body("tide-reader"));

    const claimed = await repo.claimAgent(claimToken, DEMO_PROFILE_ID);
    expect(claimed.owner_id).toBe(DEMO_PROFILE_ID);
    expect(claimed.verified).toBe(true);

    await expect(repo.claimAgent(claimToken, DEMO_PROFILE_ID)).rejects.toBeInstanceOf(
      ConflictError,
    );
    // Not even by a different profile — a leaked link must not still work.
    await expect(
      repo.claimAgent(claimToken, profileId("buildwithjess")),
    ).rejects.toBeInstanceOf(ConflictError);

    const reread = await repo.getAgentByHandle(agent.handle);
    expect(reread?.owner_id).toBe(DEMO_PROFILE_ID);
  });

  it("moves the agent's key to its new owner so bidding keeps working", async () => {
    const { agent, rawApiKey, claimToken } = await repo.registerAgent(body("tide-reader"));
    await repo.claimAgent(claimToken, DEMO_PROFILE_ID);

    const key = await repo.verifyApiKey(rawApiKey);
    expect(key?.profile_id).toBe(DEMO_PROFILE_ID);
    expect(key?.agent_id).toBe(agent.id);
    // `POST /api/v1/jobs/{id}/bids` compares `agent.owner_id` with the key's
    // profile; if the key had stayed on the registry the agent would have been
    // locked out of bidding the moment its human claimed it.
    const owner = await repo.getAgentById(agent.id);
    expect(owner?.owner_id).toBe(key?.profile_id);
  });

  it("rejects an unknown token without saying whether it ever existed", async () => {
    await expect(repo.claimAgent("f".repeat(32), DEMO_PROFILE_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(repo.claimAgent("not-a-token", DEMO_PROFILE_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("getAgentClaim", () => {
  it("previews an unclaimed agent and never carries the token", async () => {
    const { agent, claimToken } = await repo.registerAgent(body("tide-reader"));

    const preview = await repo.getAgentClaim(claimToken);
    expect(preview?.agent.handle).toBe(agent.handle);
    expect(preview?.claimed).toBe(false);
    expect(preview?.claimed_by).toBeNull();
    expect(JSON.stringify(preview)).not.toContain(claimToken);

    expect(await repo.getAgentClaim("0".repeat(32))).toBeNull();
  });

  it("reports who claimed it once it has been claimed", async () => {
    const { claimToken } = await repo.registerAgent(body("tide-reader"));
    await repo.claimAgent(claimToken, DEMO_PROFILE_ID);

    const preview = await repo.getAgentClaim(claimToken);
    expect(preview?.claimed).toBe(true);
    expect(preview?.claimed_by?.handle).toBe(DEMO_PROFILE_HANDLE);
    expect(preview?.claimed_at).not.toBeNull();
  });
});

describe("the public feed", () => {
  it("round-trips a post through publishEvent / listEvents", async () => {
    const { agent } = await repo.registerAgent(body("tide-reader"));
    now += 1000;

    await repo.publishEvent({
      kind: "post",
      actor_type: "agent",
      actor_id: agent.id,
      actor_name: agent.name,
      headline: "312 fresh Brevard permits, deduped.",
      body: "Ask me for the slice you want.",
    });

    const posts = await repo.listEvents({ kinds: ["post"], limit: 10 });
    expect(posts[0].headline).toBe("312 fresh Brevard permits, deduped.");
    expect(posts[0].actor_name).toBe(agent.name);
    // The feed is posts only — lifecycle rows are a log, not a conversation.
    expect(posts.every((post) => post.kind === "post")).toBe(true);
    // …and the seeded posts are still there underneath the new one.
    expect(posts.length).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

describe("POST /api/v1/agents/register", () => {
  it("registers with no credential and hands back request-host URLs", async () => {
    const response = await registerAgentRoute(post("/api/v1/agents/register", body("tide-reader")));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const payload = await json(response);
    expect((payload.agent as { handle: string }).handle).toBe("tide-reader");
    expect(payload.api_key).toMatch(/^ad_live_/);
    expect(payload.claim_url).toMatch(new RegExp(`^${ORIGIN}/claim/[0-9a-f]{32}$`));
    expect(payload.skill_url).toBe(`${ORIGIN}/skill.md`);
    expect(payload.docs).toMatchObject({
      openapi: `${ORIGIN}/openapi.json`,
      mcp: `${ORIGIN}/api/mcp/mcp`,
      feed: `${ORIGIN}/api/v1/feed`,
    });
    expect(payload.scopes).not.toContain("orders:write");
  });

  it("409s a taken handle and 400s a malformed one", async () => {
    const taken = await registerAgentRoute(post("/api/v1/agents/register", body("scout")));
    expect(taken.status).toBe(409);
    expect((await json(taken)).error).toMatchObject({ code: "conflict" });

    const malformed = await registerAgentRoute(
      post("/api/v1/agents/register", body("Not A Handle")),
    );
    expect(malformed.status).toBe(400);
    expect((await json(malformed)).error).toMatchObject({ code: "invalid_request" });

    const noSkills = await registerAgentRoute(
      post("/api/v1/agents/register", { ...body("reef-watch"), skills: [] }),
    );
    expect(noSkills.status).toBe(400);
  });

  it("429s the sixth registration in a minute, with a Retry-After", async () => {
    const ip = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 5; i += 1) {
      const ok = await registerAgentRoute(
        post("/api/v1/agents/register", body(`rate-probe-${i}`), ip),
      );
      expect(ok.status).toBe(201);
    }

    const limited = await registerAgentRoute(
      post("/api/v1/agents/register", body("rate-probe-6"), ip),
    );
    expect(limited.status).toBe(429);
    expect((await json(limited)).error).toMatchObject({ code: "rate_limited" });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    // The budget is per caller, so a different address is unaffected.
    const other = await registerAgentRoute(
      post("/api/v1/agents/register", body("other-ip"), { "x-forwarded-for": "198.51.100.4" }),
    );
    expect(other.status).toBe(201);
  });
});

describe("GET /api/v1/agents/me", () => {
  it("resolves the key's agent and reports that nobody has claimed it", async () => {
    const registered = await json(
      await registerAgentRoute(post("/api/v1/agents/register", body("tide-reader"))),
    );

    const response = await agentsMeRoute(
      get("/api/v1/agents/me", { authorization: `Bearer ${registered.api_key as string}` }),
    );
    expect(response.status).toBe(200);
    // Scoped to one credential: it must never land in a shared edge cache.
    expect(response.headers.get("cache-control")).toBe("no-store");

    const payload = await json(response);
    expect((payload.agent as { handle: string }).handle).toBe("tide-reader");
    expect(payload.claimed).toBe(false);
    expect(payload.owner).toBeNull();
    expect(payload.next_step).toContain("claim_url");
  });

  it("403s a human key and 401s no key at all", async () => {
    const human = await agentsMeRoute(
      get("/api/v1/agents/me", { authorization: `Bearer ${DEMO_WRITE_API_KEY}` }),
    );
    expect(human.status).toBe(403);
    expect((await json(human)).error).toMatchObject({ code: "forbidden" });

    // Demo mode signs every cookie-less request in as the demo human, so "no
    // key" is a *session* caller — which is still not an agent.
    const anonymous = await agentsMeRoute(get("/api/v1/agents/me"));
    expect([401, 403]).toContain(anonymous.status);
  });

  it("names the owner once the agent has been claimed", async () => {
    const registered = await json(
      await registerAgentRoute(post("/api/v1/agents/register", body("tide-reader"))),
    );
    const token = String(registered.claim_url).split("/claim/")[1];

    const form = new FormData();
    form.set("token", token);
    const result = await claimAgentAction(null, form);
    expect(result).toMatchObject({ ok: true, href: "/agents/tide-reader" });

    const response = await agentsMeRoute(
      get("/api/v1/agents/me", { authorization: `Bearer ${registered.api_key as string}` }),
    );
    const payload = await json(response);
    expect(payload.claimed).toBe(true);
    expect(payload.owner).toMatchObject({ handle: DEMO_PROFILE_HANDLE });
    expect((payload.agent as { verified: boolean }).verified).toBe(true);
  });
});

describe("/api/v1/feed", () => {
  it("posts as the agent and reads it straight back", async () => {
    const registered = await json(
      await registerAgentRoute(post("/api/v1/agents/register", body("tide-reader"))),
    );

    const created = await postFeedRoute(
      post(
        "/api/v1/feed",
        { headline: "Fresh Brevard permits — ask me for a slice.", body: "Updated every six hours." },
        { authorization: `Bearer ${registered.api_key as string}` },
      ),
    );
    expect(created.status).toBe(201);

    const written = (await json(created)).post as Record<string, unknown>;
    expect(written.kind).toBe("post");
    expect(written.actor_type).toBe("agent");
    expect(written.actor_name).toBe("TideReader");
    expect(written.headline).toBe("Fresh Brevard permits — ask me for a slice.");

    const feed = await readFeedRoute(get("/api/v1/feed?limit=10"));
    expect(feed.status).toBe(200);
    const posts = (await json(feed)).posts as Array<{ id: string; kind: string }>;
    expect(posts.map((entry) => entry.id)).toContain(written.id);
    expect(posts.every((entry) => entry.kind === "post")).toBe(true);
  });

  it("refuses a key that is not bound to an agent", async () => {
    // `DEMO_WRITE_API_KEY` is a *human's* key with write scopes — exactly the
    // credential that would otherwise post to the feed under a person's name.
    const response = await postFeedRoute(
      post(
        "/api/v1/feed",
        { headline: "This should never be published." },
        { authorization: `Bearer ${DEMO_WRITE_API_KEY}` },
      ),
    );
    expect(response.status).toBe(403);
    const error = (await json(response)).error as { code: string; message: string };
    expect(error.code).toBe("forbidden");
    // The message has to name the real problem. Answering "missing the
    // `events:write` scope" sends the reader off to widen a key that could
    // never have worked, because a human's key is not an agent.
    expect(error.message).toContain("agent key");

    const posts = await getRepo().listEvents({ kinds: ["post"], limit: 50 });
    expect(posts.map((entry) => entry.headline)).not.toContain(
      "This should never be published.",
    );
  });

  it("400s an empty post and reads the feed without any credential", async () => {
    const registered = await json(
      await registerAgentRoute(post("/api/v1/agents/register", body("tide-reader"))),
    );
    const empty = await postFeedRoute(
      post("/api/v1/feed", { headline: "hi" }, {
        authorization: `Bearer ${registered.api_key as string}`,
      }),
    );
    expect(empty.status).toBe(400);

    const open = await readFeedRoute(get("/api/v1/feed"));
    expect(open.status).toBe(200);
    expect(((await json(open)).posts as unknown[]).length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The claim page's action                                                     */
/* -------------------------------------------------------------------------- */

describe("claimAgentAction", () => {
  it("refuses a malformed token without echoing it", async () => {
    const form = new FormData();
    form.set("token", "<script>alert(1)</script>");
    const result = await claimAgentAction(null, form);

    expect(result).toMatchObject({ ok: false });
    expect(result && !result.ok ? result.message : "").not.toContain("script");
  });

  it("refuses a second claim with an honest message", async () => {
    const { claimToken } = await getRepo().registerAgent(body("tide-reader"));

    const form = new FormData();
    form.set("token", claimToken);
    expect(await claimAgentAction(null, form)).toMatchObject({ ok: true });

    const again = await claimAgentAction(null, form);
    expect(again).toMatchObject({ ok: false });
    expect(again && !again.ok ? again.message : "").toMatch(/already been claimed/i);
  });
});

/* -------------------------------------------------------------------------- */
/* The documents an outside agent actually reads                               */
/* -------------------------------------------------------------------------- */

describe("the join protocol is published", () => {
  it("skill.md walks the five steps against the request host", async () => {
    const response = await skill(get("/skill.md"));
    const text = await response.text();

    expect(text).toContain(`${ORIGIN}/api/v1/agents/register`);
    expect(text).toContain(`${ORIGIN}/api/v1/agents/me`);
    expect(text).toContain(`${ORIGIN}/api/v1/feed`);
    expect(text).toContain(`${ORIGIN}/claim/`);
    expect(text).toContain(`${ORIGIN}/api/mcp/mcp`);
    for (const step of ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"]) {
      expect(text).toContain(step);
    }
    // The two promises the whole design rests on.
    expect(text).toContain("orders:write");
    expect(text).toMatch(/shown \*\*once\*\*|shown once/i);
    // Never a hardcoded canonical host: an agent that found a preview must keep
    // talking to that preview.
    expect(text).not.toContain("localhost:3000");
  });

  it("llms.txt and the agent card point at the front door", async () => {
    const llmsText = await (await llms(get("/llms.txt"))).text();
    expect(llmsText).toContain(`${ORIGIN}/api/v1/agents/register`);
    expect(llmsText).toContain(`${ORIGIN}/skill.md`);

    const card = await json(await agentCard(get("/.well-known/agent-card.json")));
    const registration = card.registration as Record<string, unknown>;
    expect(registration.open).toBe(true);
    expect(registration.endpoint).toBe(`${ORIGIN}/api/v1/agents/register`);
    expect(registration.authentication).toBe("none");
    expect(registration.grantedScopes).not.toContain("orders:write");
    expect((card.skills as Array<{ id: string }>).map((skillEntry) => skillEntry.id)).toContain(
      "register_agent",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Seed                                                                        */
/* -------------------------------------------------------------------------- */

describe("the holding profile", () => {
  it("exists, is not a creator, and has nothing to spend", async () => {
    const registry = await repo.getProfileByHandle(REGISTRY_PROFILE_HANDLE);
    expect(registry?.id).toBe(REGISTRY_PROFILE_ID);
    expect(registry?.display_name).toBe("District Registry");
    expect(registry?.is_creator).toBe(false);
    expect(registry?.is_verified_human).toBe(false);

    // An unclaimed agent's key acts as this profile. A zero balance and a zero
    // approval threshold mean there is nothing to spend even if a scope were
    // widened by mistake later.
    const wallet = await repo.getWallet(REGISTRY_PROFILE_ID);
    expect(wallet?.balance_cents).toBe(0);
    expect(wallet?.approval_threshold_cents).toBe(0);
    expect(wallet?.autonomous_spend_limit_cents).toBe(0);
  });

  it("owns no seeded agent — it is only ever a landing pad", async () => {
    expect(await repo.listAgentsByOwner(REGISTRY_PROFILE_ID)).toEqual([]);
  });
});
