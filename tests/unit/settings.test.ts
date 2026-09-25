// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ANALYTICS_NAV_ITEM,
  ALL_APP_ROUTES,
  EXTRA_ROUTES,
  NAV_ITEMS,
  withAdminRows,
  withBadges,
} from "@/lib/nav";
import {
  DEFAULT_PROFILE_EMOJI,
  encodeProfileAvatar,
  gradientIdFor,
  parseProfileAvatar,
  profileAvatarOrDefault,
} from "@/lib/data/ext/profiles";
import { AVATAR_GRADIENTS } from "@/lib/data/ext/agents";
import { seed } from "@/lib/seed";

/**
 * The account surfaces: the profile avatar convention that `/settings` writes
 * into `profiles.avatar_url`, and the operator row the shell appends to the
 * static nav.
 */

describe("profile avatars", () => {
  it("round-trips a pick through the stored token", () => {
    const token = encodeProfileAvatar("🛰️", "violet");
    expect(token).toBe("district:🛰️:violet");

    const parsed = parseProfileAvatar(token);
    expect(parsed?.emoji).toBe("🛰️");
    expect(parsed?.gradientId).toBe("violet");
    expect(parsed?.gradient).toBe(
      AVATAR_GRADIENTS.find((choice) => choice.id === "violet")!.value,
    );
  });

  it("refuses to encode anything the picker does not offer", () => {
    expect(() => encodeProfileAvatar("💣", "violet")).toThrow();
    expect(() => encodeProfileAvatar("🛰️", "chartreuse")).toThrow();
  });

  /**
   * The column is user-writable and its value reaches the DOM as an inline
   * `background-image`. Anything that is not a token from the offered lists has
   * to parse as "no District avatar" — never as CSS to paint.
   */
  it.each([
    null,
    "",
    "https://example.com/me.png",
    "district:🛰️:url(javascript:alert(1))",
    "district:<script>:violet",
    "district:violet",
    "linear-gradient(135deg,#000,#fff)",
  ])("parses %s as no avatar", (value) => {
    expect(parseProfileAvatar(value)).toBeNull();
  });

  it("falls back to a default the picker can start on", () => {
    const fallback = profileAvatarOrDefault({ avatar_url: null });
    expect(fallback.emoji).toBe(DEFAULT_PROFILE_EMOJI);
    expect(gradientIdFor(fallback.gradient)).toBe(fallback.gradientId);
  });
});

describe("operator nav row", () => {
  it("is absent for everyone but an admin", () => {
    expect(withAdminRows(NAV_ITEMS)).toBe(NAV_ITEMS);
    expect(withAdminRows(NAV_ITEMS, { isAdmin: false })).toBe(NAV_ITEMS);
    expect(NAV_ITEMS.some((item) => item.href === "/analytics")).toBe(false);
  });

  it("sits directly under the Command Center for an admin, exactly once", () => {
    const rows = withAdminRows(NAV_ITEMS, { isAdmin: true });
    expect(rows).toHaveLength(NAV_ITEMS.length + 1);

    const command = rows.findIndex((item) => item.href === "/command");
    expect(rows[command + 1]).toBe(ANALYTICS_NAV_ITEM);
    expect(rows.filter((item) => item.href === "/analytics")).toHaveLength(1);

    // Idempotent: the sidebar and the More sheet both apply it.
    expect(withAdminRows(rows, { isAdmin: true })).toHaveLength(rows.length);
  });

  it("composes with the badge transform without losing the unread count", () => {
    const rows = withAdminRows(withBadges(NAV_ITEMS, { unread: 4 }), { isAdmin: true });
    expect(rows.find((item) => item.href === "/inbox")?.badge?.label).toBe("4");
    expect(rows.some((item) => item.href === "/analytics")).toBe(true);
  });

  it("keeps /settings and /analytics walkable by the smoke suite", () => {
    expect(EXTRA_ROUTES).toContain("/settings");
    expect(EXTRA_ROUTES).toContain("/analytics");
    expect(ALL_APP_ROUTES).toContain("/settings");
    expect(ALL_APP_ROUTES).toContain("/analytics");
  });

  it("seeds exactly one operator, the demo human", () => {
    // /analytics renders in demo mode because of this row, and the e2e suite
    // depends on it being the only one.
    const admins = seed.profiles.filter((profile) => profile.is_admin);
    expect(admins.map((profile) => profile.handle)).toEqual(["austin"]);
  });
});
