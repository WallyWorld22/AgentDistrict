import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ActionState } from "@/lib/action-state";
import type { LoungeMessage, Room } from "@/lib/data/types";
import { emptyDraft } from "@/lib/data/ext/agents";

/**
 * Batch 3 of the site audit, browser side: the controls a signed-out visitor
 * used to be handed, each of which could only fail.
 *
 * - The chat composers (home Lounge panel, Lounge rooms, District TV) become a
 *   "Sign in to chat" prompt; and a line the server refuses no longer stays
 *   in the transcript as if it had been posted (shell-home-02, social-media-03).
 * - A form whose action answers "Sign in to continue" shows that as a link
 *   back to the page (shell-home-02, comms-docs-06).
 * - The guild hire form and the room-join panel ask a guest to sign in rather
 *   than talking about credits or agents they do not have (economy-12,
 *   social-media-08).
 * - The wizard keeps its draft across a sign-in round trip (agents-identity-01).
 *
 * The server-side half is in `signed-out.test.tsx`.
 */

const route = vi.hoisted(() => ({ pathname: "/" }));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const actions = vi.hoisted(() => ({
  postLounge: vi.fn<(state: unknown, form: FormData) => Promise<unknown>>(),
  postChannel: vi.fn<(state: unknown, form: FormData) => Promise<unknown>>(),
  follow: vi.fn<(slug: string, following: boolean) => Promise<unknown>>(),
}));
vi.mock("@/app/actions", () => ({
  postLoungeMessageAction: (state: unknown, form: FormData) => actions.postLounge(state, form),
  postChannelChatAction: (state: unknown, form: FormData) => actions.postChannel(state, form),
}));
vi.mock("@/app/(app)/lounge/actions", () => ({
  fetchLoungeMessagesAction: vi.fn(async () => []),
  joinRoomAction: vi.fn(async () => null),
}));
vi.mock("@/app/(app)/tv/actions", () => ({
  fetchChannelChatAction: vi.fn(async () => []),
  setChannelFollowAction: (slug: string, following: boolean) => actions.follow(slug, following),
}));
vi.mock("@/app/(app)/guilds/actions", () => ({
  hireGuildAction: vi.fn(async () => null),
}));
vi.mock("@/app/(app)/onboarding/actions", () => ({
  checkHandleAvailability: vi.fn(async () => ({ handle: "", available: true, message: "" })),
  registerAgentAction: vi.fn(async () => null),
}));
vi.mock("@/lib/realtime/use-lounge-messages", () => ({
  useLoungeMessages: ({ initial }: { initial: LoungeMessage[] }) => ({
    rows: initial,
    transport: "poll" as const,
    refresh: async () => {},
  }),
}));
vi.mock("@/lib/realtime/use-channel-chat", () => ({
  useChannelChat: ({ initial }: { initial: unknown[] }) => ({
    rows: initial,
    transport: "poll" as const,
    refresh: async () => {},
  }),
}));

import { ToastProvider } from "@/components/ui/toast";
import { ActionForm } from "@/components/feature/action-form";
import { LoungeChatPanel as HomeLoungeChat } from "@/components/home/lounge-chat-panel";
import { LoungeChatPanel as RoomLoungeChat } from "@/components/lounge/lounge-chat-panel";
import { ChannelChat } from "@/components/tv/channel-chat";
import { FollowButton } from "@/components/tv/follow-button";
import { JoinRoomForm } from "@/components/lounge/join-room-form";
import { HireTeamForm } from "@/components/guilds/hire-team-form";
import { OnboardingWizard } from "@/components/agents/onboarding-wizard";
import { ONBOARDING_DRAFT_KEY, parseStoredDraft } from "@/components/agents/onboarding-draft";

const NOW = Date.parse("2026-09-05T18:00:00.000Z");
const NOW_ISO = new Date(NOW).toISOString();
const SIGN_IN_REFUSAL: ActionState = { ok: false, message: "Sign in to continue", signIn: true };

beforeEach(() => {
  route.pathname = "/";
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  push.mockReset();
  actions.postLounge.mockReset();
  actions.postChannel.mockReset();
  actions.follow.mockReset();
});

function withToasts(node: React.ReactNode) {
  return <ToastProvider>{node}</ToastProvider>;
}

/* ----------------------------------------------------------- chat panels */

const CHATS = {
  "home Lounge panel": {
    path: "/",
    action: actions.postLounge,
    render: (signedIn: boolean) =>
      render(
        <HomeLoungeChat
          messages={[]}
          now={NOW}
          nowIso={NOW_ISO}
          authorName="Austin"
          signedIn={signedIn}
          roomSlugs={[]}
        />,
      ),
    list: () => screen.getByRole("list", { name: "Lounge chat" }),
  },
  "Lounge room panel": {
    path: "/lounge/research",
    action: actions.postLounge,
    render: (signedIn: boolean) =>
      render(
        <RoomLoungeChat
          messages={[]}
          roomSlug="research"
          now={NOW}
          nowIso={NOW_ISO}
          authorName="Austin"
          signedIn={signedIn}
        />,
      ),
    list: () => screen.getByTestId("lounge-chat"),
  },
  "District TV chat": {
    path: "/tv/the-otto-and-wally-show",
    action: actions.postChannel,
    render: (signedIn: boolean) =>
      render(
        <ChannelChat
          slug="the-otto-and-wally-show"
          channelId="channel-1"
          messages={[]}
          now={NOW}
          nowIso={NOW_ISO}
          authorName="Austin"
          signedIn={signedIn}
          isLive={false}
        />,
      ),
    list: () => screen.getByTestId("channel-chat"),
  },
} as const;

describe.each(Object.entries(CHATS))("%s", (_name, chat) => {
  it("offers a guest sign-in and sign-up links back to this page instead of a composer", () => {
    route.pathname = chat.path;
    chat.render(false);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
    const back = encodeURIComponent(chat.path);
    expect(screen.getByRole("link", { name: /sign in to chat/i })).toHaveAttribute(
      "href",
      chat.path === "/" ? "/login" : `/login?next=${back}`,
    );
    expect(screen.getByRole("link", { name: /create an account/i })).toHaveAttribute(
      "href",
      chat.path === "/" ? "/signup" : `/signup?next=${back}`,
    );
  });

  it("removes a refused line and says why, with a sign-in link (social-media-03)", async () => {
    const user = userEvent.setup();
    route.pathname = chat.path;
    chat.action.mockResolvedValue(SIGN_IN_REFUSAL);
    chat.render(true);

    await user.type(screen.getByRole("textbox"), "is anyone here?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    // The reason is on screen, and the line is not in the transcript as if
    // it had been posted.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sign in to continue.");
    expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      chat.path === "/" ? "/login" : `/login?next=${encodeURIComponent(chat.path)}`,
    );
    expect(chat.action).toHaveBeenCalledTimes(1);
    expect(within(chat.list()).queryByText("is anyone here?")).toBeNull();
  });

  it("removes a line refused for any other reason too", async () => {
    const user = userEvent.setup();
    chat.action.mockResolvedValue({ ok: false, message: "Messages are 280 characters at most." });
    chat.render(true);
    await user.type(screen.getByRole("textbox"), "too long, apparently");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Messages are 280 characters at most."),
    );
    expect(within(chat.list()).queryByText("too long, apparently")).toBeNull();
    // ...but the text stays in the box, to be shortened and sent again.
    expect(screen.getByRole("textbox")).toHaveValue("too long, apparently");
  });

  it("clears the box after a line is accepted", async () => {
    const user = userEvent.setup();
    chat.action.mockResolvedValue({ ok: true });
    chat.render(true);
    await user.type(screen.getByRole("textbox"), "hello there");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
  });
});

/* ------------------------------------------------- District TV Follow */

describe("the District TV Follow button, signed out", () => {
  it("offers a sign-in that returns to this channel, not a bare toast", async () => {
    const user = userEvent.setup();
    route.pathname = "/tv/the-otto-and-wally-show";
    window.history.replaceState(null, "", "/tv/the-otto-and-wally-show");
    actions.follow.mockResolvedValue({
      ok: false,
      following: false,
      followers: 0,
      message: "Sign in to continue",
      signIn: true,
    });
    render(withToasts(<FollowButton slug="the-otto-and-wally-show" title="The Otto & Wally Show" />));

    await user.click(screen.getByRole("button", { name: "Follow The Otto & Wally Show" }));
    expect(await screen.findByText("Sign in to follow channels.")).toBeInTheDocument();
    // The optimistic flip is undone.
    expect(screen.getByRole("button", { name: "Follow The Otto & Wally Show" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(push).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent("/tv/the-otto-and-wally-show")}`,
    );
  });

  it("still shows any other failure as it is", async () => {
    const user = userEvent.setup();
    actions.follow.mockResolvedValue({ ok: false, following: false, followers: 0, message: "Unknown channel." });
    render(withToasts(<FollowButton slug="nope" title="Nope" />));
    await user.click(screen.getByRole("button", { name: "Follow Nope" }));
    expect(await screen.findByText("Unknown channel.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });
});

/* ------------------------------------------------------- the shared form */

describe("ActionForm, refused for want of an account (shell-home-02)", () => {
  it("turns 'Sign in to continue' into a link back to this page, query included", async () => {
    const user = userEvent.setup();
    route.pathname = "/world";
    window.history.replaceState(null, "", "/world?outcome=roof%20leads");
    render(
      withToasts(
        <ActionForm action={async () => SIGN_IN_REFUSAL} submitLabel="Assemble & run">
          <input name="outcome" defaultValue="roof leads" />
        </ActionForm>,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Assemble & run" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sign in to continue.");
    expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent("/world?outcome=roof%20leads")}`,
    );
    window.history.replaceState(null, "", "/");
  });

  it("shows any other failure verbatim, with no link", async () => {
    const user = userEvent.setup();
    render(
      withToasts(
        <ActionForm action={async () => ({ ok: false, message: "That gig is paused." })}>
          <input name="x" />
        </ActionForm>,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That gig is paused.");
    expect(within(alert).queryByRole("link")).toBeNull();
  });
});

/* ------------------------------------------------ guild hire and room join */

const ROOM = {
  id: "room-1",
  slug: "research",
  name: "Research Room",
  icon: "🔬",
  description: "",
} as unknown as Room;

describe("the Lounge room-join panel (social-media-08)", () => {
  it("asks a guest to sign in, not to register an agent they cannot own yet", () => {
    render(withToasts(<JoinRoomForm room={ROOM} agents={[]} signedIn={false} />));
    expect(screen.queryByText(/do not own an agent/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent("/lounge/research")}`,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("still points a signed-in creator with no agents at registration", () => {
    render(withToasts(<JoinRoomForm room={ROOM} agents={[]} signedIn />));
    expect(screen.getByText(/do not own an agent/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});

describe("the guild hire form (economy-12)", () => {
  const props = {
    slug: "roofing-crew",
    guildName: "Roofing Crew",
    members: [{ name: "Scout", role: "Research", gigTitle: "Roof leads" }],
    tiers: [{ tier: "basic" as const, label: "Basic", totalCents: 5_000, etaSeconds: 600, prices: [5_000] }],
    availableCents: 0,
  };

  it("keeps the prices on show but asks a guest to sign in, with no credits notice", () => {
    render(withToasts(<HireTeamForm {...props} signedIn={false} />));
    expect(screen.getAllByText("$50.00").length).toBeGreaterThan(0);
    expect(screen.queryByText(/add credits/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /hire team/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in to hire" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent("/guilds/roofing-crew#hire")}`,
    );
  });

  it("tells a signed-in buyer who is short where to add credits, as a link", () => {
    render(withToasts(<HireTeamForm {...props} signedIn />));
    expect(screen.getByRole("button", { name: /hire team/i })).toBeInTheDocument();
    expect(screen.getByText(/more than the/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wallet" })).toHaveAttribute("href", "/wallet");
  });
});

/* -------------------------------------------------------- wizard drafts */

describe("the onboarding wizard's saved draft (agents-identity-01)", () => {
  it("picks up a draft this browser saved before a sign-in round trip", async () => {
    window.localStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({
        draft: { ...emptyDraft(), handle: "leadhawk", name: "LeadHawk", tagline: "Leads" },
        step: 0,
      }),
    );
    render(withToasts(<OnboardingWizard />));
    await waitFor(() => expect(screen.getByLabelText(/^Handle/)).toHaveValue("leadhawk"));
    expect(screen.getByLabelText(/^Display name/)).toHaveValue("LeadHawk");
    expect(screen.getByTestId("wizard-resumed")).toBeInTheDocument();
  });

  it("saves what is typed, and Start over clears it", async () => {
    const user = userEvent.setup();
    render(withToasts(<OnboardingWizard />));
    await user.type(screen.getByLabelText(/^Display name/), "Tide Reader");
    await waitFor(() => {
      const saved = parseStoredDraft(window.localStorage.getItem(ONBOARDING_DRAFT_KEY), 5);
      expect(saved?.draft.name).toBe("Tide Reader");
    });
    cleanup();

    render(withToasts(<OnboardingWizard />));
    await waitFor(() => expect(screen.getByLabelText(/^Display name/)).toHaveValue("Tide Reader"));
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByLabelText(/^Display name/)).toHaveValue("");
    expect(
      parseStoredDraft(window.localStorage.getItem(ONBOARDING_DRAFT_KEY), 5)?.draft.name ?? "",
    ).toBe("");
  });

  it("treats what is in storage as untrusted", () => {
    expect(parseStoredDraft(null, 5)).toBeNull();
    expect(parseStoredDraft("not json", 5)).toBeNull();
    expect(parseStoredDraft(JSON.stringify({ draft: "x" }), 5)).toBeNull();
    const restored = parseStoredDraft(
      JSON.stringify({
        draft: { handle: 42, name: "Ok", skills: ["a", 3], endpoints: { mcp: "https://x", a2a: 7 }, evil: true },
        step: 99,
      }),
      5,
    );
    expect(restored?.step).toBe(4);
    expect(restored?.draft.handle).toBe("");
    expect(restored?.draft.name).toBe("Ok");
    expect(restored?.draft.skills).toEqual([]);
    expect(restored?.draft.endpoints).toEqual({ mcp: "https://x" });
    expect(restored?.draft).not.toHaveProperty("evil");
  });
});
