import * as React from "react";
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/lib/data/types";
import { ambientChatLine } from "@/lib/data/ext/lounge";

/**
 * District TV chat mixes two kinds of line: ones somebody posted, and ambient
 * chatter this browser generates on a live channel to keep the room company.
 * The second kind must never pass for the first. These pin that an ambient
 * line is tagged and styled apart, and that the footer owns up to the mix —
 * on a live channel only, the one place ambient lines appear.
 *
 * The transport and the Server Actions are stubbed: this is about what the
 * component renders, not how lines arrive.
 */

vi.mock("@/app/actions", () => ({
  postChannelChatAction: vi.fn(async () => ({ ok: true as const, message: "" })),
}));
vi.mock("@/app/(app)/tv/actions", () => ({
  fetchChannelChatAction: vi.fn(async () => []),
}));
vi.mock("@/lib/realtime/use-channel-chat", () => ({
  useChannelChat: ({ initial }: { initial: ChatMessage[] }) => ({
    rows: initial,
    transport: "poll" as const,
    refresh: async () => {},
  }),
}));

const { ChannelChat } = await import("@/components/tv/channel-chat");

const NOW = Date.parse("2026-09-05T18:00:00.000Z");
const POSTED: ChatMessage[] = [
  {
    id: "posted-1",
    channel_id: "channel-1",
    author_name: "devdan",
    body: "a real line somebody typed",
    created_at: new Date(NOW - 120_000).toISOString(),
  },
];

function renderChat(isLive: boolean) {
  return render(
    <ChannelChat
      slug="the-otto-and-wally-show"
      channelId="channel-1"
      messages={POSTED}
      now={NOW}
      nowIso={new Date(NOW).toISOString()}
      authorName="You"
      isLive={isLive}
    />,
  );
}

describe("ChannelChat ambient lines", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tags an ambient line, keeps the posted line plain, and says so in the footer", () => {
    renderChat(true);
    const list = screen.getByTestId("channel-chat");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(7000);
    });

    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const [posted, ambient] = items;

    // The posted line: a timestamp, no tag.
    expect(posted).not.toHaveAttribute("data-ambient");
    expect(within(posted).getByText("2m ago")).toBeInTheDocument();
    expect(within(posted).queryByText(/ambient/i)).toBeNull();

    // The ambient line: the rotation's own copy, tagged in place of a time.
    const line = ambientChatLine("the-otto-and-wally-show", 0);
    expect(ambient).toHaveAttribute("data-ambient", "true");
    expect(within(ambient).getByText(line.body)).toBeInTheDocument();
    const tag = within(ambient).getByTitle(/generated in your browser/i);
    expect(tag).toHaveTextContent(/^ambient/);
    expect(within(ambient).queryByText(/ago$|^now$/)).toBeNull();

    // The footer names both halves of the room.
    expect(screen.getByTestId("chat-transport")).toHaveTextContent(
      "Posted lines: polling every 4s (demo mode)",
    );
    expect(screen.getByTestId("chat-ambient-note")).toHaveTextContent(
      /lines tagged ambient are generated in your browser, not posted by viewers/i,
    );
  });

  it("stops at the cap and never relabels a posted line", () => {
    renderChat(true);
    act(() => {
      vi.advanceTimersByTime(7000 * 20);
    });
    const list = screen.getByTestId("channel-chat");
    const ambient = list.querySelectorAll('[data-ambient="true"]');
    expect(ambient).toHaveLength(8);
    expect(list.querySelectorAll("li:not([data-ambient])")).toHaveLength(1);
  });

  it("adds nothing — and claims nothing — on a channel that is off air", () => {
    renderChat(false);
    act(() => {
      vi.advanceTimersByTime(7000 * 3);
    });
    const list = screen.getByTestId("channel-chat");
    expect(list.querySelectorAll('[data-ambient="true"]')).toHaveLength(0);
    expect(screen.queryByTestId("chat-ambient-note")).toBeNull();
    expect(screen.getByTestId("chat-transport")).toHaveTextContent("Posted lines:");
  });
});
