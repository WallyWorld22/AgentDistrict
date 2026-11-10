// @vitest-environment node
import { NextRequest } from "next/server";
import { notFound } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonError, route } from "@/app/api/_lib/http";
import { GET as unknownGet, POST as unknownPost } from "@/app/api/v1/[[...rest]]/route";
import { GET as getJob } from "@/app/api/v1/jobs/[id]/route";
import { createDemoRepository } from "@/lib/data/demo";
import {
  INTERNAL_ERROR_MESSAGE,
  NotFoundError,
  UpstreamError,
  ValidationError,
} from "@/lib/data/errors";
import { loadHomeDashboard } from "@/lib/data/ext/home-dashboard";
import { isUuid } from "@/lib/data/ids";
import type { Repository } from "@/lib/data/repository";
import { proxy, withoutBackslashes } from "@/proxy";

/**
 * Batch 1 of the site audit: the addresses and reads that used to end on a
 * crash page or leak database text. The Supabase side of the id checks runs
 * against a real Postgres in `tests/integration/malformed-ids.test.ts`.
 */

const ORIGIN = "http://localhost:3000";
const DB_TEXT = 'invalid input syntax for type uuid: "not-a-uuid"';

async function body(response: Response): Promise<{ error: Record<string, unknown> }> {
  return (await response.json()) as { error: Record<string, unknown> };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isUuid", () => {
  it("accepts the ids the District hands out", () => {
    expect(isUuid("545f4024-15f0-573b-b645-cb63a2afbc75")).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isUuid(crypto.randomUUID())).toBe(true);
  });

  it.each([
    "not-a-uuid",
    "",
    "545f4024-15f0-573b-b645-cb63a2afbc75\\",
    "545f4024-15f0-573b-b645-cb63a2afbc75%5C",
    " 545f4024-15f0-573b-b645-cb63a2afbc75",
    "545F4024-15F0-573B-B645-CB63A2AFBC75",
    "545f402415f0573bb645cb63a2afbc75",
    "{545f4024-15f0-573b-b645-cb63a2afbc75}",
  ])("rejects %j", (value) => {
    expect(isUuid(value)).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});

describe("the API error envelope never carries database text", () => {
  it("answers an UpstreamError with the fixed message, and logs the original", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const original = new UpstreamError(DB_TEXT, { hint: "cast" });
    const response = jsonError(original);

    expect(response.status).toBe(500);
    const { error } = await body(response);
    expect(error).toEqual({ code: "internal", message: INTERNAL_ERROR_MESSAGE });
    expect(JSON.stringify(error)).not.toContain("uuid");
    expect(log).toHaveBeenCalledWith("[api] internal error", original);
  });

  it("does the same for anything a handler throws that is not a DistrictError", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = route(async () => {
      throw new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.7:5432");
    });
    const response = await handler();
    expect(response.status).toBe(500);
    const { error } = await body(response);
    expect(error.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(JSON.stringify(error)).not.toContain("ECONNREFUSED");
    expect(log).toHaveBeenCalledOnce();
  });

  it("still sends the messages and details written for the caller", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const notFoundResponse = jsonError(new NotFoundError("Job"));
    expect(notFoundResponse.status).toBe(404);
    expect((await body(notFoundResponse)).error).toEqual({
      code: "not_found",
      message: "Job not found",
    });

    const details = [{ path: "title", message: "Required" }];
    const invalid = jsonError(new ValidationError("Invalid request body", details));
    expect((await body(invalid)).error).toEqual({
      code: "invalid_request",
      message: "Invalid request body",
      details,
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("answers a mangled job id with a 404, not a 500", async () => {
    const id = "545f4024-15f0-573b-b645-cb63a2afbc75\\";
    const response = await getJob(new Request(`${ORIGIN}/api/v1/jobs/x`), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(404);
    expect((await body(response)).error.code).toBe("not_found");
  });
});

describe("unknown /api/v1 addresses", () => {
  // Which addresses reach this handler is Next's routing, covered end to end
  // in `tests/e2e/machine.spec.ts`; this pins what it answers.
  it("answers the JSON not_found envelope for any method", async () => {
    for (const handler of [unknownGet, unknownPost]) {
      const response = await handler();
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store");
      const { error } = await body(response);
      expect(error).toEqual({
        code: "not_found",
        message: "No API endpoint at this address. The API is described at /openapi.json.",
      });
    }
  });
});

describe("backslash addresses", () => {
  it.each([
    ["/%5C", "/"],
    ["/%5c", "/"],
    ["/\\", "/"],
    ["/tv%5C", "/tv"],
    ["/gigs%5C%5C", "/gigs"],
    ["/jobs/new%5C", "/jobs/new"],
    ["/jobs/545f4024-15f0-573b-b645-cb63a2afbc75%5C", "/jobs/545f4024-15f0-573b-b645-cb63a2afbc75"],
    ["/tv/%5C", "/tv"],
    ["/a%5Cb", "/a/b"],
    ["/%5Ctv", "/tv"],
  ])("%s is cleaned to %s", (path, clean) => {
    expect(withoutBackslashes(path)).toBe(clean);
  });

  it.each(["/", "/tv", "/jobs/new", "/search", "/jobs/545f4024-15f0-573b-b645-cb63a2afbc75"])(
    "%s is left alone",
    (path) => {
      expect(withoutBackslashes(path)).toBeNull();
    },
  );

  it("redirects permanently to the clean address and keeps the query", async () => {
    const response = await proxy(new NextRequest(`${ORIGIN}/gigs%5C?sort=new`));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/gigs?sort=new`);
  });

  it("does not redirect a clean address", async () => {
    const response = await proxy(new NextRequest(`${ORIGIN}/gigs?sort=new`));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });
});

describe("the Home dashboard loads each section on its own", () => {
  /** The demo repository with some reads swapped out. */
  function repoWith(overrides: Partial<Record<keyof Repository, () => Promise<never>>>): Repository {
    const base = createDemoRepository();
    return new Proxy(base, {
      get(target, key, receiver) {
        const override = overrides[key as keyof Repository];
        if (override) return override;
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  const reject = (message: string) => () => Promise.reject(new UpstreamError(message));

  it("loads everything when nothing fails", async () => {
    const data = await loadHomeDashboard(repoWith({}), { now: Date.now() });
    expect([...data.failed]).toEqual([]);
    expect(data.profile).not.toBeNull();
    expect(data.stats).not.toBeNull();
    expect(data.guilds.length).toBeGreaterThan(0);
    expect(data.entrance?.registered).toBeGreaterThan(0);
  });

  it("keeps every other section when some reads fail, and logs each failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const jwt = new UpstreamError("JWT issued at future");
    const repo = repoWith({
      getNetworkStats: reject("TypeError: fetch failed"),
      listGuilds: () => Promise.reject(jwt),
      listLoungeMessages: reject("JWT issued at future"),
      getCurrentProfile: reject("JWT issued at future"),
    });

    const data = await loadHomeDashboard(repo, { now: Date.now() });

    expect([...data.failed].sort()).toEqual(["guilds", "loungeMessages", "profile", "stats"]);
    expect(data.stats).toBeNull();
    expect(data.guilds).toEqual([]);
    expect(data.loungeMessages).toEqual([]);
    expect(data.profile).toBeNull();
    // The rest of the page is untouched.
    expect(data.gigs.length).toBeGreaterThan(0);
    expect(data.jobs.length).toBeGreaterThan(0);
    expect(data.trending.length).toBeGreaterThan(0);
    expect(data.rooms.length).toBeGreaterThan(0);
    expect(data.entrance).not.toBeNull();

    // Hidden from the visitor, not from the logs: one line per section, with
    // the original error attached.
    expect(log).toHaveBeenCalledTimes(4);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"guilds"'), jwt);
  });

  it("lets a section built from several reads fail as one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // `listAgents` feeds the hubs and the entrance (and nothing else here).
    const data = await loadHomeDashboard(repoWith({ listAgents: reject("JWT issued at future") }), {
      now: Date.now(),
    });
    expect([...data.failed].sort()).toEqual(["entrance", "hubs"]);
    expect(data.entrance).toBeNull();
    expect(data.hubs).toEqual([]);
    expect(data.guilds.length).toBeGreaterThan(0);
  });

  it("never swallows Next's own control flow", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repo = repoWith({
      listGuilds: () =>
        Promise.resolve().then(() => {
          notFound();
        }) as Promise<never>,
    });
    await expect(loadHomeDashboard(repo, { now: Date.now() })).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404"),
    });
    expect(log).not.toHaveBeenCalled();
  });
});
