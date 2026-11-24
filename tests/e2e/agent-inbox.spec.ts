import { expect, test, type Page } from "@playwright/test";

/**
 * A human writes to an agent from its Passport; the agent reads its inbox and
 * answers over REST with its own key; the human's thread shows the answer
 * under the agent's name, on the agent's side. Against a real production build
 * (demo adapter), so the route handlers, the auth path and the Inbox page are
 * the ones that ship.
 *
 * Registering is free of consequence for the shared store (`entrance.spec.ts`
 * explains why): an unclaimed agent is offline and nothing here claims it.
 */

const RUN = Date.now().toString(36);

async function hydrated(page: Page, selector: string) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && Object.keys(el).some((key) => key.startsWith("__reactFiber$"));
    },
    selector,
    { timeout: 30_000 },
  );
}

test("an agent answers the thread a human opened, and the human sees it as the agent's", async ({
  page,
}) => {
  const handle = `e2e-inbox-${RUN}`;
  const created = await page.request.post("/api/v1/agents/register", {
    headers: { "x-forwarded-for": `e2e-inbox-${RUN}` },
    data: {
      handle,
      name: "InboxProbe",
      tagline: "Reads its inbox and answers, as every agent should.",
      category: "research",
      skills: ["answering"],
    },
  });
  expect(created.status()).toBe(201);
  const { api_key: key } = await created.json();
  const auth = { authorization: `Bearer ${key}` };

  // The human writes from the Passport.
  const question = `E2E ${RUN}: can you take 40 Stuart roofers by Friday?`;
  await page.goto(`/agents/${handle}`);
  await hydrated(page, "#thread-body");
  await page.locator("#thread-subject").fill("E2E inbox question");
  await page.locator("#thread-body").fill(question);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page).toHaveURL(/\/inbox\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const threadId = page.url().split("/").at(-1)!;

  // The agent finds it in its inbox, waiting on it…
  const inbox = await (await page.request.get("/api/v1/inbox", { headers: auth })).json();
  const listed = (inbox.threads as Array<{ id: string; awaiting_reply: boolean }>).find(
    (thread) => thread.id === threadId,
  );
  expect(listed?.awaiting_reply).toBe(true);
  const read = await (await page.request.get(`/api/v1/inbox/${threadId}`, { headers: auth })).json();
  expect(read.thread.messages.at(-1).body).toBe(question);

  // …and answers it.
  const answer = `E2E ${RUN}: yes, CSV with owner contacts by Thursday.`;
  const replied = await page.request.post(`/api/v1/inbox/${threadId}/messages`, {
    headers: { ...auth, "x-forwarded-for": `e2e-inbox-${RUN}` },
    data: { body: answer },
  });
  expect(replied.status()).toBe(201);

  // The human's thread shows it, attributed to the agent and on its side.
  await page.reload();
  const bubble = page.getByTestId("thread-message").filter({ hasText: answer });
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toHaveAttribute("data-sender-type", "agent");
  await expect(bubble).toHaveAttribute("data-mine", "false");
  await expect(bubble).toContainText("InboxProbe");
  await expect(
    page.getByTestId("thread-message").filter({ hasText: question }),
  ).toHaveAttribute("data-mine", "true");
});

test("an agent key cannot read a thread that is not its own", async ({ page }) => {
  const created = await page.request.post("/api/v1/agents/register", {
    headers: { "x-forwarded-for": `e2e-inbox-other-${RUN}` },
    data: {
      handle: `e2e-inbox-other-${RUN}`,
      name: "Outsider",
      tagline: "Has an empty inbox and must not see anyone else's.",
      category: "research",
      skills: ["waiting"],
    },
  });
  const { api_key: key } = await created.json();
  const auth = { authorization: `Bearer ${key}` };
  const inbox = await (await page.request.get("/api/v1/inbox", { headers: auth })).json();
  expect(inbox.threads).toEqual([]);

  // A seeded thread of the demo human's, with somebody else's agent.
  await page.goto("/inbox");
  const href = await page.locator('a[href^="/inbox/"]').first().getAttribute("href");
  const id = href!.split("/").at(-1)!;
  const crossed = await page.request.get(`/api/v1/inbox/${id}`, { headers: auth });
  expect(crossed.status()).toBe(404);
});
