// @vitest-environment node
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Batch 3 of the site audit: what a visitor with no account meets.
 *
 * Production runs with real accounts, so every visitor there starts signed
 * out; the demo copy signs everyone in as @austin and never showed any of
 * this. Each case below takes the viewer away (the repository's
 * `getCurrentProfile` answers `null`, or the proxy's session check says
 * `signed_out`) and checks what the page, the proxy or the auth routes do.
 *
 * The browser-side half (chat composers, the guild hire form, the room-join
 * panel, the wizard's saved draft) is in `signed-out-ui.test.tsx`.
 */

const session = vi.hoisted(() => ({ state: "signed_out" as "signed_in" | "signed_out" | "unknown" }));
vi.mock("@/lib/supabase/middleware", async () => {
  const { NextResponse } = await import("next/server");
  return {
    updateSession: async (request: NextRequest) => {
      const response = NextResponse.next({ request });
      // What the real refresh does to a dead token: clear it.
      response.cookies.set("sb-test-auth-token", "", { maxAge: 0, path: "/" });
      return { response, session: session.state };
    },
  };
});

// `ActionForm` (the signed-in claim button) asks for the router; the pages
// here render outside an app router, so it gets a stub. Everything else in
// `next/navigation` — `redirect`, `notFound` — is the real thing.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
}));

// The Passport page reads request headers for its canonical origin.
vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/headers")>()),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

import { safeInternalPath } from "@/lib/utils";
import { returnPath, signInHref, signUpHref, AUTH_NEXT_COOKIE } from "@/lib/auth/return-to";
import { PRIVATE_ROUTES, isPrivatePath } from "@/lib/auth/private-routes";
import { actionError } from "@/lib/action-state";
import { AuthRequiredError, ConflictError } from "@/lib/data/errors";
import { getRepo } from "@/lib/data";
import { DEMO_PROFILE_ID } from "@/lib/seed";
import { proxy } from "@/proxy";
import { ToastProvider } from "@/components/ui/toast";

/** Server-render a page's element the way the app shell would host it. */
async function html(element: Promise<unknown>): Promise<string> {
  return renderToStaticMarkup(<ToastProvider>{(await element) as React.ReactNode}</ToastProvider>);
}

const ORIGIN = "http://localhost:3000";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Make the shared demo repository answer "nobody is signed in". */
function signOut() {
  vi.spyOn(getRepo(), "getCurrentProfile").mockResolvedValue(null);
}

/** Run a Server Component page and return the redirect it threw, if any. */
async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (!digest.startsWith("NEXT_REDIRECT")) throw error;
    return digest.split(";")[2] ?? null;
  }
}

async function notFoundOf(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return false;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest === "NEXT_HTTP_ERROR_FALLBACK;404") return true;
    throw error;
  }
}

/* ------------------------------------------------------- return-to links */

describe("the return-to path only ever names this site", () => {
  it.each([
    "/wallet",
    "/inbox?tab=unread",
    "/agents/scout#message",
    "/claim/0123456789abcdef0123456789abcdef",
    "/search?q=a%2Fb",
  ])("accepts %s", (path) => {
    expect(safeInternalPath(path)).toBe(path);
    expect(returnPath(path)).toBe(path);
    expect(signInHref(path)).toBe(`/login?next=${encodeURIComponent(path)}`);
  });

  it.each([
    // Absolute URLs and schemes.
    "https://evil.example/",
    "http://evil.example",
    "javascript:alert(1)",
    "data:text/html,hi",
    "mailto:a@b.c",
    // Protocol-relative and its disguises.
    "//evil.example",
    "//evil.example/wallet",
    "///evil.example",
    // Backslash variants: browsers read `\` as `/`.
    "/\\evil.example",
    "\\\\evil.example",
    "\\/evil.example",
    "/wallet\\..\\x",
    "/%5Cevil.example",
    "/%5cevil.example",
    "/%2F/evil.example",
    "/%2f%2fevil.example",
    // Browsers strip tabs and newlines, which turns these into `//host`.
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/ /evil.example",
    // Not a path at all.
    "evil.example",
    "wallet",
    "",
    "?next=/x",
  ])("refuses %j and falls back to the home page", (value) => {
    expect(safeInternalPath(value)).toBeNull();
    expect(returnPath(value)).toBe("/");
    expect(signInHref(value)).toBe("/login");
    expect(signUpHref(value)).toBe("/signup");
  });

  it("refuses values that are not strings", () => {
    for (const value of [null, undefined, 42, {}, ["/wallet"]]) {
      expect(safeInternalPath(value)).toBeNull();
      expect(signInHref(value)).toBe("/login");
    }
  });

  it("keeps the home page itself as a bare /login", () => {
    expect(signInHref("/")).toBe("/login");
    expect(signUpHref("/claim/abc")).toBe(`/signup?next=${encodeURIComponent("/claim/abc")}`);
  });
});

/* -------------------------------------------- "Sign in to continue" errors */

describe("a Server Action refused for want of an account", () => {
  it("says so with a flag the form turns into a sign-in link (shell-home-02)", () => {
    expect(actionError(new AuthRequiredError("Sign in to continue"))).toEqual({
      ok: false,
      message: "Sign in to continue",
      signIn: true,
    });
  });

  it("leaves every other failure as it was", () => {
    expect(actionError(new ConflictError("That gig is paused."))).toEqual({
      ok: false,
      message: "That gig is paused.",
    });
    expect(actionError(new Error("boom"))).not.toHaveProperty("signIn");
  });

  it("is what the shared actions answer a guest with", async () => {
    signOut();
    const { postLoungeMessageAction, startThreadAction } = await import("@/app/actions");
    const form = new FormData();
    form.set("body", "hello lounge");
    form.set("agentHandle", "scout");
    expect(await postLoungeMessageAction(null, form)).toMatchObject({ ok: false, signIn: true });
    expect(await startThreadAction(null, form)).toMatchObject({ ok: false, signIn: true });

    const { hireGuildAction } = await import("@/app/(app)/guilds/actions");
    const { assembleGuildAction, hireRankedAgentAction } = await import("@/app/(app)/world/actions");
    const { joinRoomAction } = await import("@/app/(app)/lounge/actions");
    const { registerAgentAction } = await import("@/app/(app)/onboarding/actions");
    for (const action of [
      hireGuildAction,
      assembleGuildAction,
      hireRankedAgentAction,
      joinRoomAction,
      registerAgentAction,
    ]) {
      expect(await action(null, form)).toMatchObject({ ok: false, signIn: true });
    }
  });
});

/* --------------------------------------------------------- account pages */

describe("account pages, signed out", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    session.state = "signed_out";
  });

  it.each([
    ["/wallet", "/wallet"],
    ["/orders", "/orders"],
    ["/orders/545f4024-15f0-573b-b645-cb63a2afbc75", "/orders/545f4024-15f0-573b-b645-cb63a2afbc75"],
    ["/profile", "/profile"],
    ["/settings", "/settings"],
    ["/command?runs=a,b", "/command?runs=a,b"],
    ["/workplace", "/workplace"],
    ["/inbox", "/inbox"],
    ["/inbox/some-thread", "/inbox/some-thread"],
    ["/gigs/new", "/gigs/new"],
    ["/analytics", "/analytics"],
  ])("GET %s is a real 307 to sign in and back (prod-05)", async (path, next) => {
    const response = await proxy(new NextRequest(`${ORIGIN}${path}`));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(next);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    // The session refresh's cookie decision rides along on the redirect.
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("");
  });

  it("leaves the router's _rsc cache-buster out of the return path", async () => {
    const response = await proxy(
      new NextRequest(`${ORIGIN}/orders?status=open&_rsc=abc123`, { headers: { rsc: "1" } }),
    );
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("next")).toBe("/orders?status=open");
  });

  it("does not touch public pages, or pages that merely start with the same letters", async () => {
    for (const path of ["/", "/gigs", "/gigs/some-gig", "/agents/scout", "/lounge", "/onboarding/agent", "/inboxes", "/walletguide"]) {
      const response = await proxy(new NextRequest(`${ORIGIN}${path}`));
      expect(response.headers.get("location"), path).toBeNull();
      expect(response.headers.get("x-robots-tag"), path).toBeNull();
    }
  });

  it("lets a Server Action POST through to answer for itself", async () => {
    const response = await proxy(new NextRequest(`${ORIGIN}/wallet`, { method: "POST" }));
    expect(response.headers.get("location")).toBeNull();
  });

  it("never bounces a signed-in visitor, or one Supabase could not vouch for either way", async () => {
    for (const state of ["signed_in", "unknown"] as const) {
      session.state = state;
      const response = await proxy(new NextRequest(`${ORIGIN}/wallet`));
      expect(response.headers.get("location"), state).toBeNull();
      expect(response.headers.get("x-robots-tag"), state).toBe("noindex, nofollow");
    }
  });

  it("marks account pages noindex in demo mode too", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const response = await proxy(new NextRequest(`${ORIGIN}/wallet`));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("covers exactly the list robots.txt and the sitemap use", () => {
    for (const route of PRIVATE_ROUTES) {
      expect(isPrivatePath(route)).toBe(true);
      expect(isPrivatePath(`${route}/`)).toBe(true);
      expect(isPrivatePath(`${route}/x`)).toBe(true);
      expect(isPrivatePath(`${route}x`)).toBe(false);
    }
  });

  it("says noindex in each account page's own metadata (economy-13, comms-docs-13)", async () => {
    const pages = {
      wallet: await import("@/app/(app)/wallet/page"),
      orders: await import("@/app/(app)/orders/(index)/page"),
      profile: await import("@/app/(app)/profile/page"),
      settings: await import("@/app/(app)/settings/page"),
      command: await import("@/app/(app)/command/page"),
      workplace: await import("@/app/(app)/workplace/page"),
      inbox: await import("@/app/(app)/inbox/(index)/page"),
      gigsNew: await import("@/app/(app)/gigs/new/page"),
      analytics: await import("@/app/(app)/analytics/page"),
    };
    for (const [name, mod] of Object.entries(pages)) {
      expect(mod.metadata.robots, name).toEqual({ index: false, follow: false });
    }
  });

  it("redirects in the page as well, for a request the proxy could not decide", async () => {
    signOut();
    const { default: Wallet } = await import("@/app/(app)/wallet/page");
    expect(await redirectOf(() => Wallet())).toBe("/login?next=%2Fwallet");
  });
});

/* ---------------------------------------------------------- inbox threads */

describe("an inbox thread link (comms-docs-05)", () => {
  async function aThreadId(): Promise<string> {
    const threads = await getRepo().listThreads(DEMO_PROFILE_ID);
    expect(threads.length).toBeGreaterThan(0);
    return threads[0].id;
  }

  it("sends a signed-out visitor to sign in and back, not to 'not found'", async () => {
    const id = await aThreadId();
    signOut();
    const { default: Thread } = await import("@/app/(app)/inbox/[thread]/page");
    expect(await redirectOf(() => Thread({ params: Promise.resolve({ thread: id }) }))).toBe(
      `/login?next=${encodeURIComponent(`/inbox/${id}`)}`,
    );
  });

  it("does the same for an id that does not exist, so a guest learns nothing", async () => {
    signOut();
    const { default: Thread } = await import("@/app/(app)/inbox/[thread]/page");
    expect(
      await redirectOf(() => Thread({ params: Promise.resolve({ thread: "no-such-thread" }) })),
    ).toBe(`/login?next=${encodeURIComponent("/inbox/no-such-thread")}`);
  });

  it("keeps 'not found' for someone else's thread", async () => {
    const id = await aThreadId();
    const repo = getRepo();
    const owner = await repo.getCurrentProfile();
    vi.spyOn(repo, "getCurrentProfile").mockResolvedValue({
      ...owner!,
      id: "00000000-0000-4000-8000-00000000beef",
      handle: "someone-else",
    });
    const { default: Thread } = await import("@/app/(app)/inbox/[thread]/page");
    expect(await notFoundOf(() => Thread({ params: Promise.resolve({ thread: id }) }))).toBe(true);
  });
});

/* -------------------------------------------------------- claim and wizard */

describe("the claim page (agents-identity-02)", () => {
  async function freshClaim(): Promise<{ token: string; name: string }> {
    const handle = `claimable-${Math.random().toString(36).slice(2, 8)}`;
    const { agent, claimToken } = await getRepo().registerAgent({
      handle,
      name: "Claimable",
      tagline: "Waiting for its human",
      category: "research",
      skills: ["testing"],
    });
    return { token: claimToken, name: agent.name };
  }

  it("offers sign-in and sign-up links back to the claim, and no Claim button, to a guest", async () => {
    const { token, name } = await freshClaim();
    signOut();
    const { default: Claim } = await import("@/app/(app)/claim/[token]/page");
    const page = await html(Claim({ params: Promise.resolve({ token }) }));
    const back = encodeURIComponent(`/claim/${token}`);
    expect(page).toContain(`href="/login?next=${back}"`);
    expect(page).toContain(`href="/signup?next=${back}"`);
    expect(page).toContain("Sign in to claim");
    expect(page).not.toContain(`>Claim ${name}</button>`);
    expect(page).not.toContain('type="submit"');
  });

  it("still shows the Claim button to a signed-in visitor", async () => {
    const { token, name } = await freshClaim();
    const { default: Claim } = await import("@/app/(app)/claim/[token]/page");
    const page = await html(Claim({ params: Promise.resolve({ token }) }));
    expect(page).toContain('type="submit"');
    expect(page).toContain(`Claim ${name}`);
    expect(page).not.toContain("/login?next=");
  });
});

describe("the agent onboarding wizard (agents-identity-01)", () => {
  it("asks a guest to sign in before step one, coming back to the wizard", async () => {
    signOut();
    const { default: Onboarding } = await import("@/app/(app)/onboarding/agent/page");
    const page = await html(Onboarding());
    expect(page).toContain(`href="/login?next=${encodeURIComponent("/onboarding/agent")}"`);
    expect(page).toContain(`href="/signup?next=${encodeURIComponent("/onboarding/agent")}"`);
    expect(page).not.toContain('data-testid="wizard-step-identity"');
  });

  it("shows the wizard to a signed-in creator", async () => {
    const { default: Onboarding } = await import("@/app/(app)/onboarding/agent/page");
    const page = await html(Onboarding());
    expect(page).toContain('data-testid="wizard-step-identity"');
    expect(page).not.toContain("/login?next=");
  });
});

describe("messaging an agent from its Passport (comms-docs-06)", () => {
  it("offers a guest a sign-in link back to the message box instead of a form", async () => {
    signOut();
    const { default: Passport } = await import("@/app/(app)/agents/[handle]/page");
    const page = await html(
      Passport({ params: Promise.resolve({ handle: "scout" }), searchParams: Promise.resolve({}) }),
    );
    expect(page).toContain(`href="/login?next=${encodeURIComponent("/agents/scout#message")}"`);
    expect(page).not.toContain('id="thread-body"');
  });

  it("keeps the message form for a signed-in visitor", async () => {
    const { default: Passport } = await import("@/app/(app)/agents/[handle]/page");
    const page = await html(
      Passport({ params: Promise.resolve({ handle: "scout" }), searchParams: Promise.resolve({}) }),
    );
    expect(page).toContain('id="thread-body"');
  });
});

/* -------------------------------------------------------- auth callback */

describe("/auth/callback", () => {
  async function land(query: string, cookie?: string): Promise<Response> {
    const { GET } = await import("@/app/(auth)/auth/callback/route");
    const headers = cookie ? { cookie: `${AUTH_NEXT_COOKIE}=${encodeURIComponent(cookie)}` } : undefined;
    return GET(new NextRequest(`${ORIGIN}/auth/callback${query}`, { headers }));
  }

  it("returns to a same-site ?next=", async () => {
    const response = await land(`?next=${encodeURIComponent("/claim/abc")}`);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/claim/abc`);
  });

  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "/%5Cevil.example", "/\t/evil.example"])(
    "refuses ?next=%j and lands on the home page",
    async (next) => {
      const response = await land(`?next=${encodeURIComponent(next)}`);
      expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
    },
  );

  it("falls back to the path the sign-up form remembered, and clears it", async () => {
    const response = await land("", "/onboarding/agent");
    expect(response.headers.get("location")).toBe(`${ORIGIN}/onboarding/agent`);
    expect(response.headers.get("set-cookie")).toContain(`${AUTH_NEXT_COOKIE}=;`);
  });

  it("refuses a remembered path that is not same-site", async () => {
    const response = await land("", "//evil.example");
    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });
});
