import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

/**
 * Owner decision 15 on the /tv grid itself, not only on Bot Brawl's own page:
 * once Season 1 is over, the league's tile says "Season 1 complete" instead
 * of the weekly slot it no longer has. The page is rendered with the District
 * clock set past the season's last bell.
 */

const clock = vi.hoisted(() => ({ now: 0 }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/tv",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} data-prefetch={prefetch === undefined ? undefined : String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/app/(app)/tv/actions", () => ({
  setChannelFollowAction: vi.fn(async () => ({ ok: true })),
  fetchChannelChatAction: vi.fn(async () => []),
}));
vi.mock("@/app/actions", () => ({
  postChannelChatAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/auth", () => ({ getCurrentProfile: async () => null }));
vi.mock("@/lib/data", async () => {
  const { createDemoRepository } = await import("@/lib/data/demo");
  const { seed } = await import("@/lib/seed");
  const repo = createDemoRepository({ now: () => clock.now, dataset: structuredClone(seed) });
  return {
    getRepo: () => repo,
    districtNow: () => clock.now,
    districtNowIso: () => new Date(clock.now).toISOString(),
  };
});

import { FIGHT_CHANNEL_ID, seed } from "@/lib/seed";
import { ToastProvider } from "@/components/ui/toast";
import Page from "@/app/(app)/tv/(index)/page";

afterEach(cleanup);

const BRAWL = seed.channels.find((channel) => channel.id === FIGHT_CHANNEL_ID)!;

describe("the /tv grid (decision 15)", () => {
  it("shows Bot Brawl's season as complete once every bell has rung", async () => {
    clock.now =
      Math.max(...seed.bouts.map((bout) => Date.parse(bout.scheduled_at))) + 3600_000;
    render(<ToastProvider>{await Page({ searchParams: Promise.resolve({}) })}</ToastProvider>);

    const tile = screen
      .getAllByTestId("channel-tile")
      .find((element) => within(element).queryByText(BRAWL.title))!;
    expect(tile).toBeDefined();
    expect(tile).toHaveTextContent("Season 1 complete");
    expect(tile).not.toHaveTextContent(BRAWL.schedule);
  });
});
