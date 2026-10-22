import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Fight Night — the District TV Fight League on `/tv/bot-brawl`, plus the two
 * honesty fixes that ship with it (finished-only leaderboard wins live in the
 * unit suite; the ambient chat label is checked here, in a real browser).
 *
 * ## What the clock says when this runs
 *
 * The suite runs in demo mode, where "now" is the seed epoch plus however long
 * `next start` has been up — minutes, not weeks. So at the moment any test here
 * reads the card:
 *
 *   bouts 1–2  were decided in the seed;
 *   bouts 3–5  have rung but were not decided in the seed — the first read of
 *              the page decides them (advance-on-read), whichever test or
 *              worker gets there first;
 *   bouts 6–8  are still days away.
 *
 * Every assertion below holds whichever read did the deciding, because the
 * result is the stored bout's formula and is recorded once. The results it
 * pins are the formula's (`tests/unit/league.test.ts` pins the same card).
 *
 * ## Shared state
 *
 * The demo store is process-wide and the suite is `fullyParallel`. Deciding a
 * bout writes a `bout_result` feed event, which nothing else in the suite
 * counts (the home counters and `/feed`'s post count read `kind = post` only).
 * Nothing here posts chat, follows a channel or moves a pinned number.
 */

/** Wait until React has attached to `selector`. */
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

function collectErrors(page: Page, sink: string[]) {
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|Download the React DevTools/i.test(text)) return;
    sink.push(`console.error: ${text}`);
  });
  page.on("pageerror", (error) => sink.push(`pageerror: ${error.message}`));
}

const FIGHT_CHANNEL = "/tv/bot-brawl";
const LIVE_CHANNEL = "/tv/the-otto-and-wally-show";

/** What the formula records for Season 1's first five bouts. */
const RESULTS = [
  { bout: 1, winner: "Velvet Voltage", loser: "Rusty Knuckles", method: "unanimous decision" },
  { bout: 2, winner: "Rusty Knuckles", loser: "Velvet Voltage", method: "knockout" },
  { bout: 3, winner: "Velvet Voltage", loser: "Rusty Knuckles", method: "technical knockout" },
  { bout: 4, winner: "Rusty Knuckles", loser: "Velvet Voltage", method: "split decision" },
  { bout: 5, winner: "Velvet Voltage", loser: "Rusty Knuckles", method: "majority decision" },
] as const;

test.describe("Fight Night on Bot Brawl", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the league section decides the due bouts on read and labels every result as fiction", async ({
    page,
  }) => {
    const errors: string[] = [];
    collectErrors(page, errors);

    const response = await page.goto(FIGHT_CHANNEL, { waitUntil: "load" });
    expect(response!.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Bot Brawl" })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);

    // The league section, and the label on it.
    const league = page.getByTestId("fight-night");
    await expect(league).toBeVisible();
    await expect(league.getByRole("heading", { name: "Fight Night" })).toBeVisible();
    await expect(league.getByText("District TV Fight League · Season 1")).toBeVisible();
    const sectionBadge = league.getByTestId("fiction-badge").first();
    await expect(sectionBadge).toBeVisible();
    await expect(sectionBadge).toHaveAttribute("title", /scripted robot-boxing show/);

    // Fighter cards: both fighters, each labelled, each linking to a Passport.
    const fighters = league.getByTestId("fighter-card");
    await expect(fighters).toHaveCount(2);
    for (const [handle, name] of [
      ["velvet-voltage", "Velvet Voltage"],
      ["rusty-knuckles", "Rusty Knuckles"],
    ] as const) {
      const card = fighters.filter({ hasText: name });
      await expect(card.getByRole("link", { name })).toHaveAttribute("href", `/agents/${handle}`);
      await expect(card.getByTestId("fiction-badge")).toContainText("Fictional fighter");
    }

    // The card: every fought bout has its result, nothing is left pending.
    const rows = page.getByTestId("bout-row");
    await expect(rows).toHaveCount(8);
    await expect(page.locator('[data-testid="bout-row"][data-phase="decided"]')).toHaveCount(5);
    await expect(page.locator('[data-testid="bout-row"][data-phase="due"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="bout-row"][data-phase="upcoming"]')).toHaveCount(3);

    for (const result of RESULTS) {
      const row = page.locator(`[data-testid="bout-row"][data-bout="${result.bout}"]`);
      await expect(row).toHaveAttribute("data-phase", "decided");
      const recorded = row.getByTestId("bout-result");
      await expect(recorded).toContainText(`${result.winner} def. ${result.loser}`);
      await expect(recorded).toContainText(result.method);
      await expect(recorded.getByTestId("fiction-badge")).toBeVisible();

      // The sports desk recap: credited to the desk, ending in the ledger's
      // own result.
      const recap = row.getByTestId("bout-recap");
      await expect(recap).toContainText("Commentary — District TV sports desk");
      await expect(recap.locator("blockquote")).toContainText(
        `Official result: ${result.winner} def. ${result.loser} by ${result.method}.`,
      );
    }

    // Upcoming bouts carry a time and a clock, and no result of any kind.
    for (const bout of [6, 7, 8]) {
      const row = page.locator(`[data-testid="bout-row"][data-bout="${bout}"]`);
      await expect(row.getByRole("timer")).toHaveText(/^\d+d \d{2}:\d{2}:\d{2} to the bell$/);
      await expect(row.getByTestId("bout-result")).toHaveCount(0);
      await expect(row.getByTestId("bout-recap")).toHaveCount(0);
      await expect(row.locator("time")).toContainText(/Fri, Sep \d+ · 9:00 PM EDT/);
    }
    await expect(page.getByTestId("next-bout")).toContainText("Bout 6");

    // Standings, from recorded results only: 3–2 and 2–3.
    const table = page.getByTestId("league-standings");
    await expect(table).toBeVisible();
    const standings = table.getByTestId("standing-row");
    await expect(standings).toHaveCount(2);
    await expect(standings.nth(0)).toContainText("Velvet Voltage");
    await expect(standings.nth(0).locator("td").nth(2)).toHaveText("3");
    await expect(standings.nth(0).locator("td").nth(3)).toHaveText("2");
    await expect(standings.nth(1)).toContainText("Rusty Knuckles");
    await expect(standings.nth(1).locator("td").nth(2)).toHaveText("2");
    await expect(standings.nth(1).locator("td").nth(3)).toHaveText("3");
    await expect(
      page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Standings" }) })
        .getByTestId("fiction-badge"),
    ).toBeVisible();

    // Fighters are characters: nobody on this couch is sold as a hire.
    await expect(page.getByTestId("tv-host")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Hire (Rusty Knuckles|Velvet Voltage)$/ })).toHaveCount(0);

    // An off-air room has no ambient chatter, so its footer claims none.
    await expect(page.getByTestId("chat-ambient-note")).toHaveCount(0);
    await expect(page.getByTestId("chat-transport")).toContainText("Posted lines:");

    expect(errors).toEqual([]);
  });

  test("a reload records nothing new: the same results, the same table", async ({ page }) => {
    await page.goto(FIGHT_CHANNEL, { waitUntil: "load" });
    const read = async () => ({
      results: await page.getByTestId("bout-result").allInnerTexts(),
      recaps: await page.locator('[data-testid="bout-recap"] blockquote').allInnerTexts(),
      standings: await page.getByTestId("standing-row").allInnerTexts(),
    });
    const first = await read();
    expect(first.results).toHaveLength(5);

    await page.reload({ waitUntil: "load" });
    expect(await read()).toEqual(first);
  });

  test("a decided bout reaches the District feed, labelled as fiction", async ({ page }) => {
    // Make sure the card has been read (and so decided) before looking.
    await page.goto(FIGHT_CHANNEL, { waitUntil: "load" });
    await expect(page.locator('[data-testid="bout-row"][data-phase="decided"]')).toHaveCount(5);

    await page.goto("/feed?view=all", { waitUntil: "load" });
    const bout = page.locator('[data-testid="feed-item"][data-kind="bout_result"]').first();
    await expect(bout).toBeVisible();
    await expect(bout).toContainText("FIGHT LEAGUE · FICTION");
    await expect(bout).toContainText(/Fight League \(fiction\): .+ def\. .+ by /);
    await expect(bout.getByRole("link", { name: /See the fight card/ })).toHaveAttribute(
      "href",
      FIGHT_CHANNEL,
    );
  });

  test("fits a phone without horizontal scroll or console errors", async ({ page }) => {
    const errors: string[] = [];
    collectErrors(page, errors);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FIGHT_CHANNEL, { waitUntil: "load" });
    await expect(page.getByTestId("fight-night")).toBeVisible();
    await page.getByTestId("league-standings").scrollIntoViewIfNeeded();

    const box = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
    expect(errors).toEqual([]);
  });
});

test.describe("District TV chat", () => {
  test("ambient lines on a live channel are tagged, and the footer says the room is a mix", async ({
    page,
  }) => {
    await page.goto(LIVE_CHANNEL);
    await hydrated(page, "main");

    const chat = page.getByTestId("channel-chat");
    // Seeded lines were posted by somebody: no tag.
    expect(await chat.locator("li:not([data-ambient])").count()).toBeGreaterThan(0);

    await expect(page.getByTestId("chat-ambient-note")).toContainText(
      /lines tagged ambient are generated in your browser, not posted by viewers/i,
    );

    // The rotation drops its first line in after seven seconds.
    const ambient = chat.locator('li[data-ambient="true"]').first();
    await expect(ambient).toBeVisible({ timeout: 15_000 });
    const tag = ambient.getByTitle(/generated in your browser/i);
    await expect(tag).toBeVisible();
    await expect(tag).toHaveText(/ambient/i);
  });
});
