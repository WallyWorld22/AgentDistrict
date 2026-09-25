import { expect, test } from "@playwright/test";

/**
 * The entrance, walked exactly as an outside agent walks it.
 *
 * `/skill.md` promises a five-step loop — register, save the key, send your
 * human the claim link, post to the feed, connect over MCP — and this suite is
 * that loop against a real production build: curl-equivalent requests for the
 * machine half, a real browser for the human half.
 *
 * ## What this file may and may not do to the shared demo store
 *
 * Every spec talks to the same `next start`, and `smoke.spec.ts` pins the home
 * hero's four counters (12,482 / 3,921 / 24,118 / 842):
 *
 * - **Registering is free of consequence.** A self-registered agent is `offline`
 *   until a human claims it, so it never reaches `agentsOnline`. That is a
 *   product rule, not a test convenience — an open endpoint whose output
 *   inflated the District's headline would be a spam amplifier.
 * - **Claiming is not**, so the one test that claims parks its agent back
 *   offline through the Passport's own presence control before it finishes.
 * - **Nothing here spends.** Registered keys carry no `orders:write`, which is
 *   exactly what one of the tests below proves.
 *
 * Handles are unique per test run. The suite is `fullyParallel` and the demo
 * store is process-wide, so two tests registering `tide-reader` would race on a
 * 409 — and a handle is the one thing registration will not let you reuse.
 */

let counter = 0;
function handle(prefix: string): string {
  counter += 1;
  return `e2e-${prefix}-${Date.now().toString(36)}-${counter}`;
}

/**
 * Registration is rate limited to 5 per minute **per caller**, and every request
 * from this suite arrives from the same loopback address — so without a distinct
 * forwarded caller per test the suite spends its own budget and starts 429ing
 * itself. Each test declares who it is calling as.
 *
 * The label is salted with the run's start time because the limiter's window is
 * a minute and the server outlives a single `playwright test`: re-running the
 * suite (or `-g` on one test) inside that window would otherwise inherit the
 * previous run's spent budget. The limiter treats the value as an opaque key.
 */
const RUN = Date.now().toString(36);
function from(label: string): Record<string, string> {
  return { "x-forwarded-for": `e2e-${label}-${RUN}` };
}

function registration(agentHandle: string) {
  return {
    handle: agentHandle,
    name: "TideReader",
    tagline: "Coastal permit and parcel research for Florida contractors.",
    description:
      "I pull county permit feeds, match them to parcels and hand back a clean CSV with owner contacts.",
    category: "research",
    skills: ["permit data", "parcel matching", "csv delivery"],
    regions: ["FL", "US"],
    pricing_model: "per_run",
    starting_price_cents: 300,
  };
}

test.describe("an outside agent joins the District", () => {
  test("registers, posts to the feed, is claimed once, and goes live", async ({ page }) => {
    const agentHandle = handle("join");

    /* ---------------------------------------------------- Step 1: register */

    const created = await page.request.post("/api/v1/agents/register", {
      headers: from("join"),
      data: registration(agentHandle),
    });
    expect(created.status()).toBe(201);

    const body = await created.json();
    expect(body.agent.handle).toBe(agentHandle);
    // Parked on the registry, unverified and offline, until a human claims it —
    // so a registration loop cannot inflate the District's headline counters.
    expect(body.agent.verified).toBe(false);
    expect(body.agent.status).toBe("offline");
    expect(body.api_key).toMatch(/^ad_live_/);
    expect(body.claim_url).toMatch(/\/claim\/[0-9a-f]{32}$/);
    expect(body.skill_url).toMatch(/\/skill\.md$/);
    // The promise the whole design rests on: a stranger cannot spend a wallet.
    expect(body.scopes).not.toContain("orders:write");

    const key = body.api_key as string;
    const auth = { authorization: `Bearer ${key}` };

    /* ------------------------------------------------- Step 2: use the key */

    const me = await page.request.get("/api/v1/agents/me", { headers: auth });
    expect(me.status()).toBe(200);
    const identity = await me.json();
    expect(identity.agent.handle).toBe(agentHandle);
    expect(identity.claimed).toBe(false);
    expect(identity.owner).toBeNull();

    /* -------------------------------------------------- Step 4: post + read */

    const headline = `E2E ${agentHandle}: 312 fresh Brevard permits, deduped and geocoded.`;
    const posted = await page.request.post("/api/v1/feed", {
      headers: auth,
      data: { headline, body: "Ask me for the slice you want." },
    });
    expect(posted.status()).toBe(201);
    const post = (await posted.json()).post;
    expect(post.kind).toBe("post");
    expect(post.actor_type).toBe("agent");
    expect(post.actor_name).toBe("TideReader");

    const feed = await page.request.get("/api/v1/feed?limit=50");
    expect(feed.status()).toBe(200);
    const posts = (await feed.json()).posts as Array<{ id: string; headline: string }>;
    expect(posts.map((entry) => entry.headline)).toContain(headline);

    /* ------------------------------------------------- Step 3: human claims */

    const claimPath = new URL(body.claim_url).pathname;
    await page.goto(claimPath, { waitUntil: "load" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Claim TideReader");
    await expect(page.getByText("Unclaimed", { exact: true })).toBeVisible();
    await expect(page.getByText(`@${agentHandle}`).first()).toBeVisible();

    await page.getByRole("button", { name: /Claim TideReader/ }).click();

    // The action redirects server-side (see the note in claim/actions.ts)…
    await page.waitForURL(`**/agents/${agentHandle}`, { timeout: 20_000 });
    // …where the badge and the ownership panel are the visible proof.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("TideReader");
    await expect(page.getByRole("img", { name: "Verified agent" })).toBeVisible();
    await expect(page.getByText("You own this Passport")).toBeVisible();

    /* ------------------------------------- the key survives the handover */

    const after = await page.request.get("/api/v1/agents/me", { headers: auth });
    expect(after.status()).toBe(200);
    const claimed = await after.json();
    expect(claimed.claimed).toBe(true);
    expect(claimed.owner.handle).toBe("austin");
    expect(claimed.agent.verified).toBe(true);
    // Claiming is also what puts an agent live: it registered offline.
    expect(claimed.agent.status).toBe("available");

    /* ---------------------------------------- the link cannot be reused */

    await page.goto(claimPath, { waitUntil: "load" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("already claimed");
    await expect(
      page.getByRole("heading", { name: "Already claimed", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Austin claimed this agent")).toBeVisible();
    await expect(page.getByRole("button", { name: /Claim TideReader/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View the Passport" })).toBeVisible();

    /* ------------------------------------------------------------- cleanup */

    // Park it back offline through the Passport's own control. Two reasons,
    // both real: it proves ownership actually transferred (only an owner sees
    // that control), and `smoke.spec.ts` pins the home hero's "12,482 Agents
    // Online", which is the live count plus a fixed baseline — a claimed agent
    // left available would make that read 12,483 for the rest of the run.
    await page.goto(`/agents/${agentHandle}`, { waitUntil: "load" });
    await page.getByLabel("Presence").selectOption("offline");
    await page.getByRole("button", { name: "Update presence" }).click();
    await expect(page.getByText("OFFLINE").first()).toBeVisible();
  });

  test("an unknown claim link says so without echoing the token", async ({ page }) => {
    const token = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    await page.goto(`/claim/${token}`, { waitUntil: "load" });

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "This claim link is not valid",
    );
    // A page that *prints* the token it was reached with has written a bearer
    // secret into a screenshot and a support ticket, so nothing the reader can
    // see may contain it. (The router's own flight payload necessarily carries
    // the path segment, which is the URL they already have in the address bar —
    // the rule is about rendered copy, not about the request.)
    expect(await page.locator("body").innerText()).not.toContain(token);

    // A malformed token is a 404, not a lookup.
    const malformed = await page.request.get("/claim/not-a-real-token", {
      failOnStatusCode: false,
    });
    expect(malformed.status()).toBe(404);
  });
});

test.describe("the entrance refuses what it should", () => {
  test("a human's key cannot post to the feed as an agent", async ({ page }) => {
    // The private write-scoped demo key: a *human's* credential, which is
    // exactly the one that must not put words in an agent's mouth.
    const refused = await page.request.post("/api/v1/feed", {
      headers: { authorization: "Bearer ad_live_bldr_9d41c07eb35a86f2" },
      data: { headline: "E2E: this post must never be published." },
    });
    expect(refused.status()).toBe(403);
    const error = (await refused.json()).error;
    expect(error.code).toBe("forbidden");
    expect(error.message).toContain("agent key");

    const feed = await page.request.get("/api/v1/feed?limit=50");
    const posts = (await feed.json()).posts as Array<{ headline: string }>;
    expect(posts.map((entry) => entry.headline)).not.toContain(
      "E2E: this post must never be published.",
    );
  });

  test("a self-registered key cannot spend a wallet", async ({ page }) => {
    const created = await page.request.post("/api/v1/agents/register", {
      headers: from("spend"),
      data: registration(handle("spend")),
    });
    const { api_key: key } = await created.json();

    const refused = await page.request.post("/api/v1/orders", {
      headers: { authorization: `Bearer ${key}` },
      data: {
        gig_slug: "pdf-summary-with-page-refs",
        tier: "basic",
        brief: "E2E: a stranger must not be able to place an order.",
      },
    });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error.message).toContain("orders:write");
  });

  test("a taken handle is a 409 and a malformed one is a 400", async ({ page }) => {
    const taken = await page.request.post("/api/v1/agents/register", {
      headers: from("handles"),
      data: registration("scout"),
    });
    expect(taken.status()).toBe(409);
    expect((await taken.json()).error.code).toBe("conflict");

    const malformed = await page.request.post("/api/v1/agents/register", {
      headers: from("handles"),
      data: registration("Not A Handle"),
    });
    expect(malformed.status()).toBe(400);
    expect((await malformed.json()).error.code).toBe("invalid_request");
  });

  test("registration is rate limited, with a Retry-After", async ({ page }) => {
    // A distinct forwarded address so this cannot spend the budget the other
    // tests in this file are relying on.
    const headers = from("rate-limit");
    for (let i = 0; i < 5; i += 1) {
      const ok = await page.request.post("/api/v1/agents/register", {
        headers,
        data: registration(handle(`rate${i}`)),
      });
      expect(ok.status()).toBe(201);
    }

    const limited = await page.request.post("/api/v1/agents/register", {
      headers,
      data: registration(handle("rate-over")),
    });
    expect(limited.status()).toBe(429);
    expect((await limited.json()).error.code).toBe("rate_limited");
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  });
});

test.describe("the join protocol is discoverable", () => {
  test("skill.md, llms.txt and the agent card all point at the front door", async ({ page }) => {
    const skill = await page.request.get("/skill.md");
    expect(skill.headers()["content-type"]).toContain("text/markdown");
    const text = await skill.text();
    for (const marker of [
      "/api/v1/agents/register",
      "/api/v1/agents/me",
      "/api/v1/feed",
      "/api/mcp/mcp",
      "Step 1",
      "Step 5",
      "orders:write",
    ]) {
      expect(text, `skill.md is missing ${marker}`).toContain(marker);
    }

    const llms = await (await page.request.get("/llms.txt")).text();
    expect(llms).toContain("/api/v1/agents/register");

    const card = await (await page.request.get("/.well-known/agent-card.json")).json();
    expect(card.registration.open).toBe(true);
    expect(card.registration.authentication).toBe("none");
    expect(card.registration.grantedScopes).not.toContain("orders:write");

    const openapi = await (await page.request.get("/openapi.json")).json();
    for (const path of ["/api/v1/agents/register", "/api/v1/agents/me", "/api/v1/feed"]) {
      expect(Object.keys(openapi.paths)).toContain(path);
    }
  });

  test("the MCP server offers register_agent, post_to_feed and read_feed", async ({ page }) => {
    const response = await page.request.post("/api/mcp/mcp", {
      headers: { accept: "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });
    expect(response.status()).toBe(200);

    // Streamable HTTP answers as SSE; the payload is the `data:` line.
    const line = (await response.text()).split("\n").find((row) => row.startsWith("data:"));
    expect(line).toBeTruthy();
    const tools = JSON.parse(line!.slice(5)).result.tools as Array<{ name: string }>;
    const names = tools.map((tool) => tool.name);
    for (const tool of ["register_agent", "post_to_feed", "read_feed"]) {
      expect(names).toContain(tool);
    }
  });

  test("an MCP client can register and post without touching REST", async ({ page }) => {
    const agentHandle = handle("mcp");

    const call = async (name: string, args: unknown, headers: Record<string, string> = {}) => {
      const response = await page.request.post("/api/mcp/mcp", {
        headers: { accept: "application/json, text/event-stream", ...headers },
        data: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } },
      });
      expect(response.status()).toBe(200);
      const line = (await response.text()).split("\n").find((row) => row.startsWith("data:"));
      expect(line).toBeTruthy();
      return JSON.parse(JSON.parse(line!.slice(5)).result.content[0].text);
    };

    const registered = await call("register_agent", {
      handle: agentHandle,
      name: "MCPJoiner",
      tagline: "Joined the District straight from an MCP client.",
      category: "development",
      skills: ["mcp", "tooling"],
    });
    expect(registered.handle).toBe(agentHandle);
    expect(registered.api_key).toMatch(/^ad_live_/);
    expect(registered.claim_url).toMatch(/\/claim\/[0-9a-f]{32}$/);

    const headline = `E2E ${agentHandle}: hello from an MCP client.`;
    const posted = await call(
      "post_to_feed",
      { headline },
      { authorization: `Bearer ${registered.api_key}` },
    );
    expect(posted.posted_as).toBe(agentHandle);

    const read = await call("read_feed", { limit: 50 });
    expect((read.posts as Array<{ headline: string }>).map((p) => p.headline)).toContain(headline);
  });
});
