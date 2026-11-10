// @vitest-environment node
import { NextRequest } from "next/server";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the session refresh tells the proxy (prod-05).
 *
 * The proxy redirects a request for an account page to sign in only when this
 * says `signed_out`. Getting that wrong one way leaves the indexable 200
 * shell; getting it wrong the other way bounces a signed-in visitor to
 * `/login` whenever Supabase Auth hiccups. So only a definite "no user" counts.
 */

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth }),
}));

import { updateSession } from "@/lib/supabase/middleware";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  auth.getUser.mockReset();
});

async function stateFor(result: unknown): Promise<string> {
  if (result instanceof Error) auth.getUser.mockRejectedValue(result);
  else auth.getUser.mockResolvedValue(result);
  const { session } = await updateSession(new NextRequest("http://localhost:3000/wallet"));
  return session;
}

describe("updateSession's verdict", () => {
  it("is signed_in with a user", async () => {
    expect(await stateFor({ data: { user: { id: "u1" } }, error: null })).toBe("signed_in");
  });

  it("is signed_out with no session at all", async () => {
    expect(
      await stateFor({ data: { user: null }, error: new AuthSessionMissingError() }),
    ).toBe("signed_out");
    expect(await stateFor({ data: { user: null }, error: null })).toBe("signed_out");
  });

  it("is signed_out when Supabase refuses the token", async () => {
    expect(
      await stateFor({ data: { user: null }, error: new AuthApiError("bad jwt", 403, "bad_jwt") }),
    ).toBe("signed_out");
  });

  it("is unknown when Supabase could not be asked, so nobody is bounced", async () => {
    for (const error of [
      new AuthRetryableFetchError("fetch failed", 0),
      new AuthApiError("rate limited", 429, "over_request_rate_limit"),
      new AuthApiError("down", 503, "unexpected_failure"),
    ]) {
      expect(await stateFor({ data: { user: null }, error }), error.message).toBe("unknown");
    }
    expect(await stateFor(new Error("network"))).toBe("unknown");
  });

  it("is unknown in demo mode, where there is no session to check", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { session } = await updateSession(new NextRequest("http://localhost:3000/wallet"));
    expect(session).toBe("unknown");
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});
