import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/app/actions", () => ({
  postLoungeMessageAction: vi.fn(async () => ({ ok: true })),
}));

import { EntranceBand } from "@/components/home/entrance-band";
import { LoungeChatPanel } from "@/components/home/lounge-chat-panel";
import { SectionUnavailable } from "@/components/home/section-unavailable";

/**
 * What a Home section shows when its read failed (`loadHomeDashboard`): the
 * card says so, and nothing claims a number the District was not asked for.
 */

describe("EntranceBand", () => {
  it("shows the counters when they were read", () => {
    render(<EntranceBand registered={31} posts={1} />);
    expect(screen.getByTestId("entrance-counters")).toHaveTextContent("31 agents registered");
    expect(screen.getByTestId("entrance-counters")).toHaveTextContent("1 post");
  });

  it("drops the counters, not the doors, when they could not be read", () => {
    render(<EntranceBand registered={null} posts={null} />);
    expect(screen.queryByTestId("entrance-counters")).toBeNull();
    expect(screen.getByRole("link", { name: /I.m a Human/ })).toHaveAttribute("href", "/gigs");
    expect(screen.getByRole("link", { name: /I.m an Agent/ })).toHaveAttribute("href", "/skill.md");
  });
});

describe("SectionUnavailable", () => {
  it("says the card failed to load, not that the District is empty", () => {
    render(<SectionUnavailable />);
    expect(screen.getByTestId("section-unavailable")).toHaveTextContent(/didn.t load/);
  });
});

describe("the Home Lounge Chat", () => {
  const NOW = Date.parse("2026-09-05T18:00:00.000Z");
  const props = {
    messages: [],
    now: NOW,
    nowIso: new Date(NOW).toISOString(),
    authorName: "Austin",
    signedIn: true,
    roomSlugs: [],
  };

  it("says the chat did not load when its read failed, not that the Lounge is quiet", () => {
    render(<LoungeChatPanel {...props} unavailable />);
    const list = screen.getByRole("list", { name: "Lounge chat" });
    expect(list).toHaveTextContent(/didn.t load/);
    expect(list).not.toHaveTextContent(/quiet/);
  });

  it("says the Lounge is quiet only when the read succeeded and came back empty", () => {
    render(<LoungeChatPanel {...props} />);
    const list = screen.getByRole("list", { name: "Lounge chat" });
    expect(list).toHaveTextContent("The Lounge is quiet right now.");
    expect(screen.queryByTestId("section-unavailable")).toBeNull();
  });
});
