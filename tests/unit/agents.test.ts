// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  AGENT_PRICE_CEILINGS,
  AGENT_SORT_OPTIONS,
  ALL_KEY_SCOPES,
  AVATAR_EMOJI,
  AVATAR_GRADIENTS,
  DEFAULT_KEY_SCOPES,
  HANDLE_PATTERN,
  absoluteEndpoint,
  bestGig,
  browseAgents,
  buildAgentCard,
  emptyDraft,
  endpointError,
  handleError,
  hireHref,
  isPublicHttpsUrl,
  parsePriceToCents,
  priceUnit,
  requestOrigin,
  resolvedEndpoints,
  stepErrors,
  toApiKeyView,
} from "@/lib/data/ext/agents";
import { getRepo } from "@/lib/data";
import { isAllowedWebhookUrl } from "@/lib/runtime/webhook";
import { AGENT_CATEGORIES } from "@/lib/data/types";
import type { ApiKey, GigWithAgent } from "@/lib/data/types";

/**
 * The Passport surfaces' pure logic (`lib/data/ext/agents.ts`).
 *
 * Two things here are load-bearing beyond the pages themselves:
 *
 * 1. `isPublicHttpsUrl` is a client-safe **mirror** of the server's
 *    `isAllowedWebhookUrl`. The wizard shows its verdict inline; the write path
 *    enforces the real one. The table below is the drift guard — if the server
 *    rule changes and this one does not, this file fails rather than the two
 *    quietly disagreeing.
 * 2. `buildAgentCard` is shared by `/agents/[handle]` and
 *    `/agents/[handle]/agent-card.json`, so what a human copies off the page is
 *    what a machine fetches.
 */

const ENDPOINT_TABLE = [
  "https://api.example.com/run",
  "https://sub.domain.example.co.uk/a2a?x=1",
  "http://api.example.com/run",
  "ftp://api.example.com/run",
  "https://user:pass@api.example.com/run",
  "https://localhost/run",
  "https://localhost.localdomain/run",
  "https://api.localhost/run",
  "https://thing.internal/run",
  "https://printer.local/run",
  "https://127.0.0.1/run",
  "https://10.1.2.3/run",
  "https://192.168.0.9/run",
  "https://172.16.4.4/run",
  "https://169.254.169.254/latest/meta-data",
  "https://metadata.google.internal/x",
  "https://100.70.0.1/run",
  "https://[::1]/run",
  "not a url",
  "",
];

describe("endpoint validation mirrors the runtime rule", () => {
  it.each(ENDPOINT_TABLE)("agrees with isAllowedWebhookUrl for %j", (url) => {
    expect(isPublicHttpsUrl(url)).toBe(isAllowedWebhookUrl(url));
  });

  it("only reports an error for a non-empty, disallowed URL", () => {
    expect(endpointError("")).toBeNull();
    expect(endpointError("   ")).toBeNull();
    expect(endpointError("https://api.example.com/run")).toBeNull();
    expect(endpointError("http://api.example.com/run")).toMatch(/https:\/\//);
  });
});

describe("requestOrigin", () => {
  const headers = (map: Record<string, string>) => ({
    get: (name: string) => map[name.toLowerCase()] ?? null,
  });

  it("derives the origin from the forwarded host and protocol", () => {
    expect(
      requestOrigin(headers({ "x-forwarded-host": "district.example.com", "x-forwarded-proto": "https" })),
    ).toBe("https://district.example.com");
  });

  it("falls back to the Host header and assumes https off loopback", () => {
    expect(requestOrigin(headers({ host: "preview.vercel.app" }))).toBe(
      "https://preview.vercel.app",
    );
    expect(requestOrigin(headers({ host: "127.0.0.1:3100" }))).toBe("http://127.0.0.1:3100");
    expect(requestOrigin(headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("takes the first entry of a comma-joined proxy header", () => {
    expect(
      requestOrigin(
        headers({ "x-forwarded-host": "a.example.com, b.example.com", "x-forwarded-proto": "https, http" }),
      ),
    ).toBe("https://a.example.com");
  });

  it("never returns the localhost default when a host is present", () => {
    expect(requestOrigin(headers({ host: "district.example.com" }))).not.toContain(
      "localhost:3000",
    );
  });

  it("falls back to siteUrl() with no headers at all", () => {
    expect(requestOrigin(null)).toMatch(/^https?:\/\//);
  });
});

describe("endpoint resolution", () => {
  it("joins District-relative endpoints to the origin and leaves absolute ones", () => {
    expect(absoluteEndpoint("https://d.example.com", "/api/mcp/mcp")).toBe(
      "https://d.example.com/api/mcp/mcp",
    );
    expect(absoluteEndpoint("https://d.example.com", "https://other.example/mcp")).toBe(
      "https://other.example/mcp",
    );
  });

  it("drops empty entries", () => {
    expect(
      resolvedEndpoints({ a2a: "/a", mcp: undefined, openapi: "" }, "https://d.example.com"),
    ).toEqual([["a2a", "https://d.example.com/a"]]);
  });
});

describe("browseAgents", () => {
  it("pages cumulatively and counts every category in scope", async () => {
    const repo = getRepo();
    const first = await browseAgents(repo, { perPage: 6 });

    expect(first.agents).toHaveLength(6);
    expect(first.hasMore).toBe(true);
    expect(first.totalAcrossCategories).toBeGreaterThan(20);
    expect(first.total).toBe(first.totalAcrossCategories);
    expect(first.freeCount).toBeGreaterThan(0);

    const second = await browseAgents(repo, { perPage: 6, page: 2 });
    expect(second.agents).toHaveLength(12);
    expect(second.agents.slice(0, 6).map((a) => a.handle)).toEqual(
      first.agents.map((a) => a.handle),
    );

    // Chip counts cover every category the enum declares.
    for (const category of AGENT_CATEGORIES) {
      expect(typeof (first.counts[category] ?? 0)).toBe("number");
    }
    const summed = AGENT_CATEGORIES.reduce(
      (total, category) => total + (first.counts[category] ?? 0),
      0,
    );
    expect(summed).toBe(first.totalAcrossCategories);
  });

  it("narrows total to the chosen category and keeps the other counts", async () => {
    const repo = getRepo();
    const scoped = await browseAgents(repo, { category: "research" });
    expect(scoped.total).toBe(scoped.counts.research);
    expect(scoped.total).toBeLessThan(scoped.totalAcrossCategories);
    expect(scoped.agents.every((agent) => agent.category === "research")).toBe(true);
  });

  it("returns an empty page rather than throwing for an impossible filter", async () => {
    const result = await browseAgents(getRepo(), { q: "zzzz-nothing-matches-this" });
    expect(result.agents).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });
});

describe("hiring", () => {
  const gig = (over: Partial<GigWithAgent>) =>
    ({
      slug: "a",
      status: "active",
      runs_count: 0,
      rating_avg: 0,
      starting_price_cents: 100,
      ...over,
    }) as GigWithAgent;

  it("picks the most-run gig, then the best rated, then the cheapest", () => {
    expect(
      bestGig([
        gig({ slug: "few", runs_count: 10 }),
        gig({ slug: "many", runs_count: 900 }),
        gig({ slug: "some", runs_count: 400 }),
      ])?.slug,
    ).toBe("many");

    expect(
      bestGig([
        gig({ slug: "low", runs_count: 5, rating_avg: 4.1 }),
        gig({ slug: "high", runs_count: 5, rating_avg: 4.9 }),
      ])?.slug,
    ).toBe("high");
  });

  it("ignores paused gigs while any active gig exists", () => {
    expect(
      bestGig([
        gig({ slug: "paused", status: "paused", runs_count: 9000 }),
        gig({ slug: "live", runs_count: 1 }),
      ])?.slug,
    ).toBe("live");
  });

  it("falls back to the agent's filtered gig list when it has published none", () => {
    expect(bestGig([])).toBeNull();
    expect(hireHref("qa-fox", [])).toBe("/gigs?agentHandle=qa-fox");
    expect(hireHref("qa-fox", [gig({ slug: "x" })])).toBe("/gigs/x");
  });
});

describe("buildAgentCard", () => {
  it("is a complete A2A card with absolute URLs for the given origin", async () => {
    const repo = getRepo();
    const agent = await repo.getAgentByHandle("scout");
    expect(agent).not.toBeNull();
    const gigs = await repo.listGigs({ agentHandle: "scout", limit: 12 });

    const card = buildAgentCard(agent!, gigs, "https://district.example.com", {
      organization: "AgentDistrict",
    }) as Record<string, unknown>;

    expect(card.districtId).toBe("@scout");
    expect(card.protocolVersion).toBe("0.3.0");
    expect(card.documentationUrl).toBe("https://district.example.com/agents/scout");
    expect(String(card.url).startsWith("https://district.example.com/")).toBe(true);
    expect(JSON.stringify(card)).not.toContain("localhost:3000");

    const skills = card.skills as Array<{ id: string; hire: string }>;
    expect(skills.length).toBe(gigs.length);
    expect(skills[0].hire).toBe("https://district.example.com/api/v1/orders");

    const interfaces = card.additionalInterfaces as Array<{ url: string }>;
    expect(interfaces.every((entry) => /^https?:\/\//.test(entry.url))).toBe(true);
  });
});

describe("the onboarding draft", () => {
  it("starts from a valid, publishable shape", () => {
    const draft = emptyDraft();
    expect(AVATAR_EMOJI).toContain(draft.avatarEmoji);
    expect(AVATAR_GRADIENTS.map((g) => g.value)).toContain(draft.avatarGradient);
    expect(draft.bringOnline).toBe(true);
    expect(parsePriceToCents(draft.price)).toBe(25);
  });

  it("blocks step 1 until the handle, name and tagline are real", () => {
    const draft = emptyDraft();
    expect(stepErrors("identity", draft)).toHaveLength(3);

    const filled = { ...draft, handle: "parcelpro", name: "ParcelPro", tagline: "Property intel" };
    expect(stepErrors("identity", filled)).toEqual([]);
  });

  it("blocks step 2 without a skill or a region", () => {
    const draft = { ...emptyDraft(), regions: [] };
    expect(stepErrors("capabilities", draft)).toEqual([
      "List at least one skill.",
      "Pick at least one region.",
    ]);
    expect(stepErrors("capabilities", { ...draft, skills: ["QA"], regions: ["FL"] })).toEqual([]);
  });

  it("accepts a free agent but not a nonsense price", () => {
    expect(stepErrors("pricing", { ...emptyDraft(), price: "0" })).toEqual([]);
    expect(stepErrors("pricing", { ...emptyDraft(), price: "$1.24" })).toEqual([]);
    expect(stepErrors("pricing", { ...emptyDraft(), price: "free" })).toHaveLength(1);
    expect(stepErrors("pricing", { ...emptyDraft(), price: "-3" })).toHaveLength(1);
  });

  it("blocks step 4 on any endpoint the write path would reject", () => {
    const bad = { ...emptyDraft(), endpoints: { webhook: "http://127.0.0.1:9/run" } };
    expect(stepErrors("endpoints", bad)).toHaveLength(1);
    const good = { ...emptyDraft(), endpoints: { webhook: "https://api.example.com/run" } };
    expect(stepErrors("endpoints", good)).toEqual([]);
    expect(stepErrors("review", bad)).toEqual([]);
  });

  it("parses dollars into integer cents without float drift", () => {
    expect(parsePriceToCents("0.79")).toBe(79);
    expect(parsePriceToCents("$1,234.56")).toBe(123456);
    expect(parsePriceToCents("0.1")).toBe(10);
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("abc")).toBeNull();
  });

  it("validates handles the same way the server does", () => {
    expect(handleError("scout")).toBeNull();
    expect(handleError("qa-fox")).toBeNull();
    expect(handleError("")).toMatch(/Pick a handle/);
    expect(handleError("a")).toMatch(/at least 2/);
    expect(handleError("-nope")).toMatch(/Lowercase/);
    expect(handleError("no_pe")).toMatch(/Lowercase/);
    expect(handleError("no pe")).toMatch(/Lowercase/);
    // Case is not an error — the field lowercases as you type and the server
    // slugifies before it writes.
    expect(handleError("Scout")).toBeNull();
    expect(handleError("a".repeat(33))).toMatch(/at most 32/);
    expect(HANDLE_PATTERN.test("e2e-probe-agent")).toBe(true);
  });

  it("maps a pricing model onto the unit the cards print", () => {
    expect(priceUnit("per_run")).toBe("run");
    expect(priceUnit("per_job")).toBe("job");
    expect(priceUnit("per_hour")).toBe("hr");
    expect(priceUnit("from")).toBeUndefined();
  });
});

describe("browse controls", () => {
  it("offers every sort the repository understands and an 'any price' escape", () => {
    expect(AGENT_SORT_OPTIONS.map((option) => option.value)).toEqual([
      "trending",
      "rating",
      "price",
      "newest",
    ]);
    expect(AGENT_PRICE_CEILINGS[0]).toEqual({ value: "", label: "Any price" });
  });
});

describe("api keys", () => {
  it("offers only scopes the auth layer understands, and defaults to read-only", () => {
    expect(new Set(ALL_KEY_SCOPES).size).toBe(ALL_KEY_SCOPES.length);
    expect(ALL_KEY_SCOPES).toContain("agents:read");
    expect(ALL_KEY_SCOPES).toContain("orders:write");
    expect(DEFAULT_KEY_SCOPES.every((scope) => ALL_KEY_SCOPES.includes(scope))).toBe(true);
    expect(DEFAULT_KEY_SCOPES.some((scope) => scope.endsWith(":write"))).toBe(false);
  });

  it("projects a key for the client without ever carrying its hash", () => {
    const key: ApiKey = {
      id: "k1",
      profile_id: "p1",
      label: "CI",
      key_hash: "sha256$deadbeef",
      key_prefix: "ad_live_2f8c",
      scopes: ["agents:read"],
      last_used_at: null,
      created_at: "2026-09-01T00:00:00.000Z",
    };
    const view = toApiKeyView(key, () => "2d ago");
    expect(view).toEqual({
      id: "k1",
      label: "CI",
      prefix: "ad_live_2f8c",
      scopes: ["agents:read"],
      lastUsed: "never",
      created: "2d ago",
    });
    expect(JSON.stringify(view)).not.toContain("deadbeef");
  });

  it("revokes a key the profile owns and refuses one it does not", async () => {
    const repo = getRepo();
    const profile = await repo.getCurrentProfile();
    expect(profile).not.toBeNull();

    const { record } = await repo.createApiKey({
      profileId: profile!.id,
      label: "Temporary key",
      scopes: ["agents:read"],
    });
    expect((await repo.listApiKeys(profile!.id)).some((key) => key.id === record.id)).toBe(true);

    await expect(repo.revokeApiKey(record.id, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      /do not own/i,
    );
    await repo.revokeApiKey(record.id, profile!.id);
    expect((await repo.listApiKeys(profile!.id)).some((key) => key.id === record.id)).toBe(false);
  });
});
