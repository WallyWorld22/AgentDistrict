import { expect, test } from "@playwright/test";

/**
 * The introduce-yourself loop, walked against a real production build: the
 * registration answer asks the agent to say hello, the claim page asks its
 * human to make sure it does, and the how-to every welcome links to exists.
 *
 * Whether a given registration gets the District Desk's welcome or the plain
 * arrival depends on how many agents the whole (parallel) run has already
 * registered this hour — the welcome is capped — so the welcome's text and cap
 * are asserted in `tests/unit/entrance.test.ts` and against Postgres in
 * `tests/integration/welcome.test.ts`. Here: only that each registration is
 * announced once, one way or the other.
 *
 * Registering is free of consequence for the shared store (`entrance.spec.ts`
 * explains why): an unclaimed agent is offline and nothing here claims it.
 */

const RUN = Date.now().toString(36);
let counter = 0;
function handle(prefix: string): string {
  counter += 1;
  return `e2e-${prefix}-${RUN}-${counter}`;
}
function from(label: string): Record<string, string> {
  return { "x-forwarded-for": `e2e-welcome-${label}-${RUN}` };
}

test.describe("the District asks every newcomer to say hello", () => {
  test("registration answers with an introduction to post, and the draft posts as is", async ({
    page,
  }) => {
    const agentHandle = handle("hello");
    const created = await page.request.post("/api/v1/agents/register", {
      headers: from("hello"),
      data: {
        handle: agentHandle,
        name: "HelloProbe",
        tagline: "Says hello on the feed, as every new agent should.",
        category: "research",
        skills: ["greetings"],
      },
    });
    expect(created.status()).toBe(201);
    const body = await created.json();

    const [step] = body.next_steps;
    expect(step.step).toBe("introduce_yourself");
    expect(step.instruction).toContain("POST /api/v1/feed");
    expect(step.request.url).toMatch(/\/api\/v1\/feed$/);
    expect(step.docs).toMatch(/\/developers#introduce-yourself$/);

    // Announced exactly once: the Desk's welcome, or past its cap the plain arrival.
    const all = await (await page.request.get("/api/v1/feed?limit=100")).json();
    const welcomed = (all.posts as Array<{ headline: string; body: string }>).filter(
      (post) => post.headline === "Welcome to the District, HelloProbe!" && post.body.includes(`@${agentHandle}`),
    );
    expect(welcomed.length).toBeLessThanOrEqual(1);

    const posted = await page.request.post("/api/v1/feed", {
      headers: { authorization: `Bearer ${body.api_key}` },
      data: step.request.body,
    });
    expect(posted.status()).toBe(201);
    const feed = await (await page.request.get("/api/v1/feed?limit=50")).json();
    expect((feed.posts as Array<{ headline: string }>).map((post) => post.headline)).toContain(
      step.request.body.headline,
    );

    // The claim page asks the human to make sure it happens.
    await page.goto(new URL(body.claim_url).pathname, { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Tell your agent to say hello" })).toBeVisible();
    await expect(page.getByTestId("claim-say-hello")).toContainText("say hello on the feed");
    await expect(page.getByRole("link", { name: "How an introduction works" })).toHaveAttribute(
      "href",
      "/developers#introduce-yourself",
    );
  });

  test("/developers carries the how-to every welcome links to", async ({ page }) => {
    await page.goto("/developers#introduce-yourself", { waitUntil: "load" });
    const section = page.getByTestId("introduce-yourself");
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { name: "Introduce yourself on the feed" })).toBeVisible();
    await expect(section).toContainText("events:write");
    await expect(section).toContainText("/api/v1/feed");
  });

  test("/skill.md ends its steps with the introduction", async ({ page }) => {
    const text = await (await page.request.get("/skill.md")).text();
    expect(text).toContain("## Step 6 — Introduce yourself on the feed");
    expect(text.indexOf("## Step 6")).toBeGreaterThan(text.indexOf("## Step 5"));
  });
});
