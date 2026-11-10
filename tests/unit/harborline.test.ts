import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";
import { createDemoRepository } from "@/lib/data/demo";
import { seed } from "@/lib/seed";
import { DEMO_PROFILE_ID } from "@/lib/seed/profiles";
import { id } from "@/lib/seed/uuid";

/**
 * Owner decision 1 (site audit brand-07): the seed's fictional store and its
 * founder carry clearly invented names, so a real "Built by Wally Works"
 * credit can never be read as vouching for invented hires and ratings.
 *
 * - No seeded row, and nothing in the generated seed.sql, names the old store.
 * - The store and its bounty keep the uuids minted for their old slugs, so a
 *   re-applied seed.sql updates the rows migration 0017 renamed in production
 *   instead of inserting twins that collide on the slug.
 * - The demo adapter serves the store at its new address only, and the old
 *   address is a permanent redirect.
 */

const OLD_NAME = /wally\s*works/i;
const ROOT = process.cwd();

describe("the fictional demo store is clearly invented", () => {
  it("leaves no seeded row naming the old store", () => {
    for (const [table, rows] of Object.entries(seed)) {
      for (const row of rows as unknown[]) {
        expect(JSON.stringify(row), `seed.${table}`).not.toMatch(OLD_NAME);
      }
    }
  });

  it("leaves nothing in the generated seed.sql naming it either", () => {
    const sql = readFileSync(join(ROOT, "supabase", "seed.sql"), "utf8");
    expect(sql).not.toMatch(OLD_NAME);
    expect(sql).toContain("'harborline-labs', 'Harborline Labs'");
  });

  it("names the store Harborline Labs and says it is fiction", () => {
    const store = seed.stores.find((row) => row.slug === "harborline-labs");
    expect(store).toBeDefined();
    expect(store!.name).toBe("Harborline Labs");
    expect(store!.tagline).toMatch(/fictional/i);
    expect(store!.owner_id).toBe(DEMO_PROFILE_ID);
  });

  it("names the demo human Demo Founder, keeping the austin handle", () => {
    const profile = seed.profiles.find((row) => row.id === DEMO_PROFILE_ID)!;
    expect(profile.handle).toBe("austin");
    expect(profile.display_name).toBe("Demo Founder");
    expect(profile.bio).toMatch(/fictional/i);
    // The denormalized copies follow the profile.
    for (const message of seed.messages.filter((row) => row.sender_id === DEMO_PROFILE_ID)) {
      expect(message.sender_name).toBe("Demo Founder");
    }
    for (const event of seed.events.filter((row) => row.actor_id === DEMO_PROFILE_ID)) {
      expect(event.actor_name).toBe("Demo Founder");
    }
  });

  it("keeps the uuids production already holds for the renamed rows", () => {
    const store = seed.stores.find((row) => row.slug === "harborline-labs")!;
    expect(store.id).toBe(id("store", "wallyworks-labs"));
    expect(store.id).toBe("eb4ead9c-bac9-51e7-be76-c756904dc888");

    const job = seed.jobs.find((row) => row.title === "Refresh 6 Harborline location pages")!;
    expect(job.id).toBe("40ed5bfe-805e-5a75-b74e-77237e8e67d6");
    // Its bids, its award and the order on it all still hang off that id.
    const bids = seed.bids.filter((row) => row.job_id === job.id);
    expect(bids.length).toBeGreaterThan(0);
    expect(bids.map((row) => row.id)).toContain(job.awarded_bid_id);
    expect(seed.orders.some((row) => row.job_id === job.id)).toBe(true);
  });

  it("serves the store at its new address only, in the demo adapter", async () => {
    const repo = createDemoRepository();
    const store = await repo.getStoreBySlug("harborline-labs");
    expect(store?.name).toBe("Harborline Labs");
    expect(store?.agents.length).toBeGreaterThan(0);
    expect(store?.owner?.display_name).toBe("Demo Founder");
    expect(await repo.getStoreBySlug("wallyworks-labs")).toBeNull();
  });

  it("redirects the old store address permanently to the new one", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual({
      source: "/stores/wallyworks-labs",
      destination: "/stores/harborline-labs",
      permanent: true,
    });
  });
});
