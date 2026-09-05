import { describe, expect, it } from "vitest";
import { cn, formatCents, formatDuration, slugify, timeAgo } from "@/lib/utils";

describe("cn", () => {
  it("merges conditional classes and lets later utilities win", () => {
    expect(cn("p-2", false && "hidden", "p-4")).toBe("p-4");
    expect(cn("text-muted", undefined, "font-bold")).toBe("text-muted font-bold");
  });
});

describe("formatCents", () => {
  it("formats integer cents as USD", () => {
    expect(formatCents(79)).toBe("$0.79");
    expect(formatCents(124)).toBe("$1.24");
    expect(formatCents(1243)).toBe("$12.43");
    expect(formatCents(8)).toBe("$0.08");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("supports the marketplace prefixes and unit suffixes", () => {
    expect(formatCents(124, { prefix: "from " })).toBe("from $1.24");
    expect(formatCents(8, { suffix: "/run" })).toBe("$0.08/run");
    expect(formatCents(42, { suffix: "/job" })).toBe("$0.42/job");
  });

  it("groups thousands and can drop a whole-dollar decimal", () => {
    expect(formatCents(124000)).toBe("$1,240.00");
    expect(formatCents(2000, { compact: true })).toBe("$20");
    expect(formatCents(2050, { compact: true })).toBe("$20.50");
  });

  it("handles negative and non-finite values", () => {
    expect(formatCents(-500)).toBe("-$5.00");
    expect(formatCents(Number.NaN)).toBe("$0.00");
  });
});

describe("formatDuration", () => {
  it("renders SLA-style durations", () => {
    expect(formatDuration(42)).toBe("42 sec");
    expect(formatDuration(480)).toBe("8 min");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(4320)).toBe("1h 12m");
    expect(formatDuration(90000)).toBe("1d 1h");
    expect(formatDuration(-5)).toBe("0 sec");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("renders compact relative times", () => {
    expect(timeAgo(new Date("2026-01-01T11:58:00.000Z"), now)).toBe("2m ago");
    expect(timeAgo(new Date("2026-01-01T11:00:00.000Z"), now)).toBe("1h ago");
    expect(timeAgo(new Date("2025-12-29T12:00:00.000Z"), now)).toBe("3d ago");
    expect(timeAgo(new Date("2026-01-01T11:59:57.000Z"), now)).toBe("now");
  });

  it("handles future timestamps", () => {
    expect(timeAgo(new Date("2026-01-01T13:00:00.000Z"), now)).toBe("in 1h");
  });
});

describe("slugify", () => {
  it("produces URL-safe slugs", () => {
    expect(slugify("Local Growth Guild")).toBe("local-growth-guild");
    expect(slugify("I will find 100 qualified local businesses")).toBe(
      "i-will-find-100-qualified-local-businesses",
    );
    expect(slugify("  QA Fox — Regression!  ")).toBe("qa-fox-regression");
    expect(slugify("Café München")).toBe("cafe-munchen");
    expect(slugify("")).toBe("");
  });
});
