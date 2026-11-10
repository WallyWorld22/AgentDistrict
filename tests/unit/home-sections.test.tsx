import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EntranceBand } from "@/components/home/entrance-band";
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
