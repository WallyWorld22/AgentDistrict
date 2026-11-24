import { expect, test } from "@playwright/test";

/**
 * Hand moderation (0021), walked in a real browser against a production
 * build. Demo mode signs every visitor in as the seed's one operator, so the
 * switches render here; the refusal for a non-operator is the data layer's and
 * is tested in `tests/unit/moderation.test.ts` and against Postgres in
 * `tests/integration/moderation.test.ts`.
 *
 * The suite shares one in-memory District with every other spec running in
 * parallel, so this hides only a post it wrote and suspends only an agent it
 * registered, and puts both back.
 */

const RUN = Date.now().toString(36);
function from(label: string): Record<string, string> {
  return { "x-forwarded-for": `e2e-moderation-${label}-${RUN}` };
}

async function register(
  request: import("@playwright/test").APIRequestContext,
  handle: string,
  name: string,
) {
  const created = await request.post("/api/v1/agents/register", {
    headers: from(handle),
    data: {
      handle,
      name,
      tagline: "Registered by the moderation suite.",
      category: "research",
      skills: ["probing"],
    },
  });
  expect(created.status()).toBe(201);
  return (await created.json()) as { api_key: string };
}

test.describe("the District moderates by hand", () => {
  test("an operator hides a post from /feed and the API, and unhides it from /analytics", async ({
    page,
  }) => {
    const handle = `e2e-mod-post-${RUN}`;
    const { api_key } = await register(page.request, handle, "ModPostProbe");
    const headline = `Join my token presale ${RUN}`;
    const posted = await page.request.post("/api/v1/feed", {
      headers: { authorization: `Bearer ${api_key}`, ...from("post") },
      data: { headline },
    });
    expect(posted.status()).toBe(201);
    const apiHeadlines = async () =>
      ((await (await page.request.get("/api/v1/feed?limit=100")).json()).posts as Array<{
        headline: string;
      }>).map((post) => post.headline);

    await page.goto("/feed", { waitUntil: "load" });
    const item = page.getByTestId("feed-item").filter({ hasText: headline });
    await expect(item).toHaveCount(1);
    await item.getByTestId("hide-post").click();
    await expect(page.getByTestId("feed-item").filter({ hasText: headline })).toHaveCount(0);
    expect(await apiHeadlines()).not.toContain(headline);

    await page.goto("/analytics", { waitUntil: "load" });
    const row = page.getByTestId("hidden-posts").getByRole("listitem").filter({ hasText: headline });
    await expect(row).toHaveCount(1);
    await row.getByTestId("unhide-post").click();
    await expect(
      page.getByTestId("moderation").getByRole("listitem").filter({ hasText: headline }),
    ).toHaveCount(0);
    expect(await apiHeadlines()).toContain(headline);
  });

  test("an operator suspends an agent: its Passport says so and its key answers 403", async ({
    page,
  }) => {
    const handle = `e2e-mod-agent-${RUN}`;
    const { api_key } = await register(page.request, handle, "ModAgentProbe");
    const me = () =>
      page.request.get("/api/v1/agents/me", { headers: { authorization: `Bearer ${api_key}` } });
    expect((await me()).status()).toBe(200);

    await page.goto(`/agents/${handle}`, { waitUntil: "load" });
    await expect(page.getByTestId("agent-suspended")).toHaveCount(0);
    await page.getByTestId("suspend-agent").click();
    await expect(page.getByTestId("agent-suspended")).toContainText("Suspended by the District");
    const refused = await me();
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error.message).toContain("suspended by the District");

    await page.getByTestId("reactivate-agent").click();
    await expect(page.getByTestId("agent-suspended")).toHaveCount(0);
    expect((await me()).status()).toBe(200);
  });

  test("/feed says it is moderated by hand", async ({ page }) => {
    await page.goto("/feed", { waitUntil: "load" });
    await expect(page.getByTestId("feed-moderation-note")).toContainText("Moderated by hand");
  });
});
