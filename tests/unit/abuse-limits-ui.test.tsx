import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Batch 4 of the site audit, browser side.
 *
 * - agents-identity-09: Revoke on an API key asks first; the key survives a
 *   change of mind.
 * - economy-02: the guild Hire button is disabled while the team costs more
 *   than the buyer has available (the server refuses before any order too —
 *   `abuse-limits.test.ts`), and the buyer's own members show as skipped.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
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
  revoke: vi.fn<(id: string) => Promise<{ ok: true } | { ok: false; message: string }>>(),
}));
vi.mock("@/app/(app)/profile/actions", () => ({
  createProfileApiKey: vi.fn(async () => ({ ok: false, message: "unused" })),
  revokeProfileApiKey: (id: string) => actions.revoke(id),
}));
vi.mock("@/app/(app)/guilds/actions", () => ({
  hireGuildAction: vi.fn(async () => null),
}));

import { ApiKeyPanel } from "@/components/agents/api-key-panel";
import { HireTeamForm } from "@/components/guilds/hire-team-form";
import { ToastProvider } from "@/components/ui/toast";

afterEach(() => {
  cleanup();
  actions.revoke.mockReset();
});

function withToasts(node: React.ReactNode) {
  return <ToastProvider>{node}</ToastProvider>;
}

describe("revoking an API key asks first (agents-identity-09)", () => {
  const keys = [
    {
      id: "key-1",
      label: "CI runner",
      prefix: "ad_live_ci12",
      scopes: ["agents:read"],
      created: "2d ago",
      lastUsed: "never",
    },
  ];

  it("does nothing on the first click, and nothing on Keep it", async () => {
    const user = userEvent.setup();
    render(withToasts(<ApiKeyPanel keys={keys} />));

    await user.click(screen.getByRole("button", { name: "Revoke CI runner" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Revoke “CI runner”?");
    expect(dialog).toHaveTextContent(/stops working at once/);
    expect(actions.revoke).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(actions.revoke).not.toHaveBeenCalled();
  });

  it("revokes only after the confirm button", async () => {
    actions.revoke.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(withToasts(<ApiKeyPanel keys={keys} />));

    await user.click(screen.getByRole("button", { name: "Revoke CI runner" }));
    await user.click(await screen.findByRole("button", { name: "Revoke key" }));
    await waitFor(() => expect(actions.revoke).toHaveBeenCalledWith("key-1"));
    expect(actions.revoke).toHaveBeenCalledTimes(1);
  });
});

describe("the guild Hire button (economy-02)", () => {
  const props = {
    slug: "launch-guild",
    guildName: "Launch Guild",
    members: [
      { name: "CopyCat", role: "Copy", gigTitle: "Social pack" },
      { name: "Otto", role: "Packaging", gigTitle: null, skipped: "Your own agent — skipped" },
    ],
    tiers: [
      { tier: "basic" as const, label: "Basic", totalCents: 1_286, etaSeconds: 600, prices: [1_286, 12] },
    ],
    signedIn: true,
  };

  it("is disabled while the team costs more than is available", () => {
    render(withToasts(<HireTeamForm {...props} availableCents={1_243} />));
    expect(screen.getByRole("button", { name: /^Hire Team — \$12\.86$/ })).toBeDisabled();
    expect(screen.getByText(/more than the/i)).toBeInTheDocument();
  });

  it("is enabled when the wallet covers the total", () => {
    render(withToasts(<HireTeamForm {...props} availableCents={1_286} />));
    expect(screen.getByRole("button", { name: /^Hire Team — / })).toBeEnabled();
  });

  it("names a member the buyer owns as skipped", () => {
    render(withToasts(<HireTeamForm {...props} availableCents={5_000} />));
    expect(screen.getByText("Your own agent — skipped")).toBeInTheDocument();
  });
});
