import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Tabs } from "@/components/ui/tabs";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { AgentCard } from "@/components/cards/agent-card";
import { GigCard } from "@/components/cards/gig-card";
import { JobCard } from "@/components/cards/job-card";
import { GuildCard } from "@/components/cards/guild-card";
import { ChannelCard } from "@/components/cards/channel-card";
import { StatTile } from "@/components/cards/stat-tile";
import { ContractTable } from "@/components/feature/contract-table";
import { DeliverableViewer } from "@/components/feature/deliverable-viewer";

/**
 * Component tests for the pieces whose behaviour is not visible in a smoke
 * screenshot: roving focus, focus trapping, timer cleanup, and that every card
 * renders the href/price/rating a page depends on.
 *
 * `next/link` is stubbed to a plain anchor — these tests are about the
 * components, not the router.
 */
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

const AGENT = {
  handle: "scout",
  name: "Scout",
  tagline: "Local business research",
  avatar_emoji: "🔭",
  avatar_gradient: "linear-gradient(135deg,#297dff,#7559ff)",
  category: "research",
  skills: ["leads", "enrichment", "csv"],
  status: "available" as const,
  starting_price_cents: 79,
  pricing_model: "per_run" as const,
  rating_avg: 4.96,
  rating_count: 1842,
  verified: true,
  is_free: false,
};

describe("Tabs", () => {
  const items = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ];

  it("is one tab stop and moves focus with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Tabs items={items} value="a" label="Filters" />);

    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    expect(tabs[0]).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveFocus();

    await user.keyboard("{End}");
    expect(tabs[2]).toHaveFocus();

    await user.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();

    // Wraps rather than dead-ending.
    await user.keyboard("{ArrowLeft}");
    expect(tabs[2]).toHaveFocus();
  });

  it("marks exactly one tab selected and reports changes", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Tabs items={items} value="b" onValueChange={onValueChange} />);

    const selected = screen.getAllByRole("tab", { selected: true });
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("Beta");

    await user.click(screen.getByRole("tab", { name: "Gamma" }));
    expect(onValueChange).toHaveBeenCalledWith("c");
  });

  it("does not fire for a disabled chip", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Tabs
        items={[...items, { value: "d", label: "Delta", disabled: true }]}
        value="a"
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByText("Delta"));
    expect(onValueChange).not.toHaveBeenCalledWith("d");
  });
});

describe("Sheet", () => {
  function Harness({ onClose }: { onClose: () => void }) {
    return (
      <>
        <button type="button">outside</button>
        <Sheet open onClose={onClose} title="Filters" description="Narrow it down">
          <button type="button">first</button>
          <button type="button">last</button>
        </Sheet>
      </>
    );
  }

  it("is a modal dialog labelled by its title", () => {
    render(<Harness onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("Filters")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("traps Tab inside the panel", async () => {
    const user = userEvent.setup();
    render(<Harness onClose={() => {}} />);

    const dialog = screen.getByRole("dialog");
    // Tab a few times; focus must never escape to the button outside.
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("closes when the close button is used", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Switch", () => {
  it("exposes role=switch and toggles", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch checked={false} onCheckedChange={onCheckedChange} label="Verified only" />,
    );
    const control = screen.getByRole("switch", { name: "Verified only" });
    expect(control).toHaveAttribute("aria-checked", "false");
    await user.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch checked onCheckedChange={onCheckedChange} label="Locked" disabled />,
    );
    await user.click(screen.getByRole("switch", { name: "Locked" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});

describe("Toast", () => {
  function Publisher({ count, tone }: { count: number; tone?: "error" | "success" }) {
    const { toast } = useToast();
    return (
      <button
        type="button"
        onClick={() => {
          for (let i = 0; i < count; i += 1) toast({ title: `Toast ${i}`, tone });
        }}
      >
        publish
      </button>
    );
  }

  it("keeps at most three toasts", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Publisher count={5} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "publish" }));
    await waitFor(() => {
      expect(screen.getAllByText(/^Toast \d$/)).toHaveLength(3);
    });
  });

  it("announces an error toast assertively", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Publisher count={1} tone="error" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "publish" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Toast 0");
    });
  });

  it("clears its timers on unmount", async () => {
    const user = userEvent.setup();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const view = render(
      <ToastProvider>
        <Publisher count={1} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "publish" }));
    await waitFor(() => expect(screen.getByText("Toast 0")).toBeInTheDocument());
    view.unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});

describe("cards", () => {
  it("AgentCard links to the Passport and shows price and rating", () => {
    render(<AgentCard agent={AGENT} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/agents/scout");
    expect(screen.getByText("Scout")).toBeInTheDocument();
    expect(screen.getByText(/4\.96/)).toBeInTheDocument();
    expect(screen.getByText("$0.79/run")).toBeInTheDocument();
  });

  it("AgentCard row shows the trend delta instead of a price", () => {
    render(<AgentCard agent={AGENT} variant="row" trendDelta={312} />);
    expect(screen.getByText("▲ +312")).toBeInTheDocument();
    expect(screen.queryByText("$0.79/run")).not.toBeInTheDocument();
  });

  it("GigCard links to the gig and shows the starting price", () => {
    render(
      <GigCard
        gig={{
          slug: "find-100-qualified-local-businesses",
          title: "I'll find 100 qualified local businesses",
          starting_price_cents: 79,
          delivery_seconds: 300,
          rating_avg: 4.96,
          rating_count: 1842,
          agent: AGENT,
        }}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/gigs/find-100-qualified-local-businesses",
    );
    expect(screen.getByText("$0.79")).toBeInTheDocument();
    expect(screen.getByText("5 min")).toBeInTheDocument();
  });

  it("JobCard renders budget, bid count and preformatted age", () => {
    render(
      <JobCard
        job={{
          id: "job-1",
          title: "500 Reroof Opportunities - Orlando",
          category: "home_services",
          budget_cents: 1500,
          status: "open",
          bidCount: 11,
          postedAgo: "42m ago",
        }}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/jobs/job-1");
    expect(screen.getByText("$15 budget • 11 bids • 42m ago")).toBeInTheDocument();
  });

  it("GuildCard shows the pipeline and a Hire Team action", () => {
    render(
      <GuildCard
        guild={{
          slug: "local-growth-guild",
          name: "Local Growth Guild",
          pipeline: "Research • Copy • Web • Ads",
          rating_avg: 4.98,
          rating_count: 428,
          status: "available",
          members: [AGENT],
        }}
      />,
    );
    expect(screen.getByText("Local Growth Guild")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hire Team" })).toHaveAttribute(
      "href",
      "/guilds/local-growth-guild",
    );
  });

  it("ChannelCard marks a live channel and links to the player", () => {
    render(
      <ChannelCard
        channel={{
          slug: "the-otto-and-wally-show",
          title: "The Otto & Wally Show",
          description: "AI news, tools, opportunities and chaos.",
          kind: "show",
          is_live: true,
          viewers: 1400,
          hosts: [AGENT],
        }}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/tv/the-otto-and-wally-show",
    );
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText("1.4K")).toBeInTheDocument();
  });

  it("StatTile renders a value, label and optional link", () => {
    render(<StatTile value="12,482" label="Agents Online" href="/agents" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/agents");
    expect(screen.getByText("12,482")).toBeInTheDocument();
  });
});

describe("ContractTable", () => {
  it("renders every declared field with its type", () => {
    render(
      <ContractTable
        fields={[
          {
            name: "city",
            type: "string",
            required: true,
            description: "Where to search.",
          },
          { name: "limit", type: "number", description: "How many records." },
        ]}
      />,
    );
    expect(screen.getByText("city")).toBeInTheDocument();
    expect(screen.getByText("limit")).toBeInTheDocument();
    expect(screen.getByText("number")).toBeInTheDocument();
  });

  it("says so when a contract declares nothing", () => {
    render(<ContractTable fields={[]} />);
    expect(screen.getByText("No fields declared.")).toBeInTheDocument();
  });
});

describe("DeliverableViewer", () => {
  it("renders a csv deliverable as a table", () => {
    render(
      <DeliverableViewer
        output={{
          format: "csv",
          summary: "100 businesses in Brevard County.",
          columns: ["business_name", "phone"],
          rows: [{ business_name: "Palm Roofing", phone: "321-555-0134" }],
        }}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Palm Roofing")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
  });

  it("renders a development deliverable's file list", () => {
    render(
      <DeliverableViewer
        output={{
          format: "markdown",
          summary: "Landing page assembled.",
          markdown: "# Landing page\n\nDone.",
          files: [{ path: "app/page.tsx", bytes: 2048 }],
        }}
      />,
    );
    expect(screen.getByText("app/page.tsx")).toBeInTheDocument();
    expect(screen.getByText("2,048 B")).toBeInTheDocument();
  });
});
