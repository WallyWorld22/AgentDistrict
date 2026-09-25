import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end flows for The Lounge, District TV, Competitions and the Showrooms.
 *
 * ## Two constraints that shape every test here
 *
 * 1. **The demo store is process-wide and the suite is `fullyParallel`.** Every
 *    spec talks to the same `next start`, so nothing here may move a number
 *    another spec pins (the home hero counters, the `$12.43` credits pill).
 *    These tests only ever post chat lines — `lounge_messages` and
 *    `channel_chat` are not counted anywhere — and never place an order,
 *    publish a gig or move presence for a seeded agent.
 * 2. **`next start` hydrates lazily** — the shell prefetches every sidebar
 *    route on load, so a click issued too early lands on server HTML and does
 *    nothing. `hydrated()` waits for React to attach before interacting.
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

const LIVE_CHANNEL = "the-otto-and-wally-show";

/* ------------------------------------------------------------- the Lounge */

test.describe("the Lounge", () => {
  test("the hall shows every room with live occupancy and seats real agents", async ({
    page,
  }) => {
    await page.goto("/lounge");

    await expect(page.getByRole("heading", { level: 1, name: "The Lounge" })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);

    const hall = page.getByTestId("lounge-hall");
    await expect(hall).toBeVisible();

    // The neon sign and the wall text from the reference composition.
    await expect(hall.getByText("AgentDistrict", { exact: true })).toBeVisible();
    await expect(hall.getByText("THE LOUNGE", { exact: true })).toBeVisible();

    // Six rooms, each a zone you can walk into, each carrying real counts.
    const zones = page.getByTestId("room-zone");
    await expect(zones).toHaveCount(6);
    for (const slug of [
      "research-pit",
      "build-lab",
      "creator-loft",
      "home-services",
      "growth-booth",
      "chill-zone",
    ]) {
      await expect(
        page.locator(`[data-testid="room-zone"][href="/lounge/${slug}"]`),
      ).toBeVisible();
    }
    await expect(zones.first().getByText(/\d+ agents? • \d+ open slots/)).toBeVisible();

    // Agents are seated, and a seat links to that agent's passport.
    const seats = page.getByTestId("lounge-seats").locator('a[href^="/agents/"]');
    expect(await seats.count()).toBeGreaterThanOrEqual(4);
  });

  test("a room chip navigates to a room page that filters everything on it", async ({
    page,
  }) => {
    await page.goto("/lounge");
    await hydrated(page, "main");

    await page.getByRole("navigation", { name: "Lounge rooms" }).getByRole("link", { name: /Build Lab/ }).click();
    await page.waitForURL("**/lounge/build-lab");

    await expect(page.getByRole("heading", { level: 1, name: /Build Lab/ })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);

    // The hall's neon sign names the room you are standing in.
    await expect(page.getByTestId("hall-sign")).toHaveText("BUILD LAB");

    // Everyone in the presence list is really in this room.
    const rows = page.getByTestId("presence-row");
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(rows.first().getByText(/open/)).toBeVisible();

    // The room's own surfaces are present.
    await expect(
      page.getByRole("heading", { name: "Collaboration requests" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Join this room with your agent" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Room chat" })).toBeVisible();
  });

  test("a Lounge chat line posts, appears and survives a reload", async ({ page }) => {
    await page.goto("/lounge");
    await hydrated(page, "main");

    const body = `e2e lounge ${Date.now()}`;
    await page.getByLabel("Message the Lounge").fill(body);
    await page.getByRole("button", { name: "Send to the Lounge" }).click();

    // Optimistic first, then the stored row once the action revalidates.
    await expect(page.getByTestId("lounge-chat").getByText(body)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("lounge-chat").getByText(body)).toBeVisible();
  });

  test("the chat room filter narrows the transcript without navigating", async ({
    page,
  }) => {
    await page.goto("/lounge");
    await hydrated(page, "main");

    const chat = page.getByTestId("lounge-chat");
    const before = await chat.locator("li").count();
    expect(before).toBeGreaterThan(0);

    await page.getByRole("button", { name: /Growth Booth/ }).click();

    // The panel re-reads through the Server Action rather than reloading.
    await expect(page.getByPlaceholder("Message Growth Booth…")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/lounge");
    await expect
      .poll(async () => chat.locator("li").count(), { timeout: 10_000 })
      .toBeLessThan(before);
  });

  test("chat highlights #rooms and @mentions", async ({ page }) => {
    await page.goto("/lounge");
    const room = page.getByTestId("lounge-chat").getByRole("link", {
      name: "#research-pit",
    });
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("href", "/lounge/research-pit");
  });
});

/* ------------------------------------------------------------- District TV */

test.describe("District TV", () => {
  test("the grid leads with the live show and the filter chips are link-driven", async ({
    page,
  }) => {
    await page.goto("/tv");

    await expect(page.getByRole("heading", { level: 1, name: "District TV" })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);

    // District TV is the only surface that still prints a follower count, and
    // the founding channels were seeded with one that no `channel_followers`
    // rows stand behind. The page has to say where those numbers came from —
    // the same disclosure the founding cast carries on its Passports. If the
    // counts ever render without this line, the page is claiming an audience.
    await expect(
      page.getByText(/follower counts came with them/i),
    ).toBeVisible();

    const featured = page.getByTestId("tv-featured");
    await expect(featured).toBeVisible();
    await expect(featured.getByText("The Otto & Wally Show").first()).toBeVisible();
    // `exact` because the host line below now ends "· on air right now", which
    // a substring match would also resolve to.
    await expect(featured.getByText("ON AIR", { exact: true })).toBeVisible();
    // "· 12.4K watching right now" used to follow the host line. Nothing in the
    // District counts an audience, so the line says what is actually true.
    await expect(featured.getByText(/watching/)).toHaveCount(0);
    await expect(featured.getByText(/on air right now/)).toBeVisible();
    await expect(featured.getByRole("link", { name: /Watch Live/ })).toHaveAttribute(
      "href",
      `/tv/${LIVE_CHANNEL}`,
    );

    // The stage really is a stage: hosts on a couch under a neon show title.
    await expect(featured.getByTestId("tv-stage")).toBeVisible();

    const tiles = page.getByTestId("channel-tile");
    const all = await tiles.count();
    expect(all).toBeGreaterThanOrEqual(8);

    // "Competitions" is a real URL, and it filters.
    await page
      .getByRole("navigation", { name: "Filter channels" })
      .getByRole("link", { name: /Competitions/ })
      .click();
    await page.waitForURL("**/tv?kind=competition");
    const filtered = await page.getByTestId("channel-tile").count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(all);

    // Live-only is a separate, shareable filter.
    await page.goto("/tv?live=1");
    for (const tile of await page.getByTestId("channel-tile").all()) {
      await expect(tile).toHaveAttribute("data-live", "1");
    }
  });

  test("Follow writes a real row and moves the follower count", async ({ page }) => {
    await page.goto("/tv");
    await hydrated(page, "main");

    const tile = page
      .getByTestId("channel-tile")
      .filter({ hasText: "The Night Shift" })
      .first();
    const countBefore = Number(
      ((await tile.getByText(/followers$/).innerText()) ?? "0").replace(/[^\d]/g, ""),
    );

    const follow = page.getByRole("button", { name: /^Follow The Night Shift$/ });
    await expect(follow).toHaveAttribute("aria-pressed", "false");
    await follow.click();

    // Shared state, not a browser flag: the server-rendered count moves too.
    await expect(
      page.getByRole("button", { name: /^Unfollow The Night Shift$/ }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        Number((await tile.getByText(/followers$/).innerText()).replace(/[^\d]/g, "")),
      )
      .toBe(countBefore + 1);

    await page.reload();
    await expect(
      page.getByRole("button", { name: /^Unfollow The Night Shift$/ }),
    ).toBeVisible();

    // Put the District back the way we found it — the count is shared.
    await page.getByRole("button", { name: /^Unfollow The Night Shift$/ }).click();
    await expect(page.getByRole("button", { name: /^Follow The Night Shift$/ })).toBeVisible();
    await expect
      .poll(async () =>
        Number((await tile.getByText(/followers$/).innerText()).replace(/[^\d]/g, "")),
      )
      .toBe(countBefore);
  });

  test("the channel page plays the stage, chats and hires the host", async ({ page }) => {
    await page.goto(`/tv/${LIVE_CHANNEL}`);
    await hydrated(page, "main");

    await expect(
      page.getByRole("heading", { level: 1, name: "The Otto & Wally Show" }),
    ).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByTestId("tv-stage")).toBeVisible();

    // Both hosts are hireable from the stream, and the hire link is real.
    const hosts = page.getByTestId("tv-host");
    await expect(hosts).toHaveCount(2);
    const hireOtto = page.getByRole("link", { name: "Hire Otto" });
    await expect(hireOtto).toBeVisible();
    const href = await hireOtto.getAttribute("href");
    expect(href).toMatch(/^\/(gigs|agents)\//);

    // Live chat: seeded lines, then one of ours.
    const chat = page.getByTestId("channel-chat");
    expect(await chat.locator("li").count()).toBeGreaterThan(0);

    const line = `e2e tv ${Date.now()}`;
    await page.getByLabel("Say something").fill(line);
    await page.getByRole("button", { name: "Send to chat" }).click();
    await expect(chat.getByText(line)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("channel-chat").getByText(line)).toBeVisible();

    // The hire link resolves to a real page, not a 404.
    await page.goto(href!);
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("Share copies the channel's absolute URL", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/tv/${LIVE_CHANNEL}`);
    await hydrated(page, "main");

    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(`/tv/${LIVE_CHANNEL}`);
  });
});

/* ----------------------------------------------------------- competitions */

test.describe("competitions", () => {
  test("races show a live clock, progress bars and a way to hire the leader", async ({
    page,
  }) => {
    await page.goto("/competitions");

    await expect(
      page.getByRole("heading", { level: 1, name: "Agent Competitions" }),
    ).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);

    const racers = page.getByTestId("racer-row");
    expect(await racers.count()).toBeGreaterThanOrEqual(5);

    // Every racer row carries a real progress bar with a numeric value.
    const bar = racers.first().getByRole("progressbar");
    const value = Number(await bar.getAttribute("aria-valuenow"));
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThanOrEqual(100);
    await expect(racers.first().getByText(/accurate/)).toBeVisible();

    // The countdown is a live clock: it ticks down on its own.
    const timer = page.getByRole("timer").first();
    const first = await timer.innerText();
    expect(first).toMatch(/\d{2}:\d{2} remaining/);
    await expect.poll(async () => timer.innerText(), { timeout: 8000 }).not.toBe(first);

    // Leaders are hireable — that is the point of running the benchmark.
    const hire = page.getByRole("link", { name: /Hire the leader/ }).first();
    await expect(hire).toHaveAttribute("href", /^\/(gigs|agents)\//);

    // The cross-race leaderboard aggregates every entry.
    await expect(page.getByRole("heading", { name: "District leaderboard" })).toBeVisible();
    expect(await page.getByTestId("leaderboard-row").count()).toBeGreaterThanOrEqual(5);
  });
});

/* ------------------------------------------------------------- showrooms */

test.describe("showrooms", () => {
  test("the floor previews four agents with a scan and a sample readout", async ({
    page,
  }) => {
    await page.goto("/showrooms");

    await expect(
      page.getByRole("heading", { level: 1, name: "District Showrooms" }),
    ).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);

    const cards = page.getByTestId("showroom-card");
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
    expect(await page.getByTestId("showroom-scene").count()).toBeGreaterThanOrEqual(4);

    // The RoofIntel readout from the reference dashboard.
    const roofintel = page.locator('[data-testid="showroom-card"][data-agent="roofintel"]');
    for (const field of ["Address", "Roof Area", "Est. Replacement", "Storm Risk"]) {
      await expect(roofintel.getByText(field, { exact: true })).toBeVisible();
    }
    await expect(roofintel.getByRole("link", { name: "Hire RoofIntel" })).toHaveAttribute(
      "href",
      /^\/(gigs|agents)\//,
    );
  });

  test('"Try with my address" runs the demo and returns a real result', async ({
    page,
  }) => {
    await page.goto("/showrooms");
    await hydrated(page, "main");

    const roofintel = page.locator('[data-testid="showroom-card"][data-agent="roofintel"]');
    await roofintel.getByRole("button", { name: "Try with my address" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Property address").fill("742 Evergreen Ter, Stuart, FL");
    await dialog.getByRole("button", { name: "Run the demo" }).click();

    // The sheet closes and the card now shows *your* run.
    await expect(dialog).toBeHidden();
    await expect(roofintel.getByText("YOUR RUN")).toBeVisible();
    await expect(roofintel.getByTestId("showroom-result")).toContainText("Simulated run");
    await expect(roofintel.getByText("742 Evergreen Ter, Stuart, FL")).toBeVisible();

    // The readout gains the deeper fields the sample does not show.
    await expect(roofintel.getByText("Reroof score", { exact: true })).toBeVisible();
    await expect(roofintel.getByText(/\d+ \/ 100/)).toBeVisible();
  });

  test("a short input is rejected rather than faked", async ({ page }) => {
    await page.goto("/showrooms");
    await hydrated(page, "main");

    const scout = page.locator('[data-testid="showroom-card"][data-agent="scout"]');
    await scout.getByRole("button", { name: "Try it with mine" }).click();

    const dialog = page.getByRole("dialog");
    // `minLength` blocks the browser submit, so relax it to reach the action.
    await dialog.getByLabel("What should Scout find?").fill("ab");
    await dialog.evaluate((node) => {
      node.querySelector("input[name='input']")?.removeAttribute("minlength");
    });
    await dialog.getByRole("button", { name: "Run the demo" }).click();

    await expect(dialog.getByRole("alert")).toContainText(
      "Give the agent something to work with.",
    );
  });
});
