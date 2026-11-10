import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ActionState } from "@/app/actions";

/**
 * The shared form wrapper and the forms whose bugs lived in it (audit findings
 * gigs-orders-02, jobs-02, gigs-orders-01), plus the @World box and the search
 * controls (shell-home-01, shell-home-03).
 *
 * React 19 resets a `<form action>` after every action. After a failed submit
 * that wiped typed text, put uncontrolled selects back on their first option,
 * and unchecked the review form's controlled star radios while the stars still
 * showed the pick — so the next submit posted 5 stars.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
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

const reviewAction = vi.hoisted(() => ({
  fn: vi.fn<(state: unknown, form: FormData) => Promise<unknown>>(),
}));
vi.mock("@/app/actions", () => ({
  createReviewAction: (state: unknown, form: FormData) => reviewAction.fn(state, form),
}));
vi.mock("@/app/(app)/world/actions", () => ({
  askWorldAction: async () => null,
}));

import { ToastProvider } from "@/components/ui/toast";
import { ActionForm } from "@/components/feature/action-form";
import { ReviewForm } from "@/components/orders/review-form";
import { WorldPrompt } from "@/components/world/world-prompt";
import { BrowseControls } from "@/components/feature/browse-controls";

afterEach(() => {
  cleanup();
  push.mockReset();
  reviewAction.fn.mockReset();
});

function withToasts(node: React.ReactNode) {
  return <ToastProvider>{node}</ToastProvider>;
}

/** A form shaped like Publish a gig: free text plus an uncontrolled picker. */
function GigLikeForm({
  action,
  resetOnSuccess,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  resetOnSuccess?: boolean;
}) {
  return (
    <ActionForm action={action} submitLabel="Publish" resetOnSuccess={resetOnSuccess}>
      <label htmlFor="agent">Agent</label>
      <select id="agent" name="agentHandle" defaultValue="scout">
        <option value="scout">Scout</option>
        <option value="quickpdf">QuickPDF</option>
      </select>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" defaultValue="I will " />
    </ActionForm>
  );
}

describe("ActionForm", () => {
  it("keeps typed text and the chosen option after a server-side error", async () => {
    const user = userEvent.setup();
    const seen: Array<Record<string, FormDataEntryValue>> = [];
    const action = vi.fn(async (_state: ActionState, form: FormData): Promise<ActionState> => {
      seen.push(Object.fromEntries(form));
      return seen.length === 1
        ? { ok: false, message: "Describe what the buyer gets." }
        : { ok: true };
    });
    render(withToasts(<GigLikeForm action={action} />));

    await user.selectOptions(screen.getByLabelText("Agent"), "quickpdf");
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "I will summarise PDFs");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Describe what the buyer gets.");
    expect(screen.getByLabelText("Agent")).toHaveValue("quickpdf");
    expect(screen.getByLabelText("Title")).toHaveValue("I will summarise PDFs");

    // The resubmit goes out under the agent the visitor picked.
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toEqual({ agentHandle: "quickpdf", title: "I will summarise PDFs" });
  });

  it("still resets after a success, as a plain form action did", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<ActionState> => ({ ok: true }));
    render(withToasts(<GigLikeForm action={action} />));

    await user.selectOptions(screen.getByLabelText("Agent"), "quickpdf");
    await user.type(screen.getByLabelText("Title"), "done");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("I will "));
    expect(screen.getByLabelText("Agent")).toHaveValue("scout");
  });

  it("keeps the values after a success when told to", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<ActionState> => ({ ok: true }));
    render(withToasts(<GigLikeForm action={action} resetOnSuccess={false} />));

    await user.type(screen.getByLabelText("Title"), "kept");
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Title")).toHaveValue("I will kept");
  });

  it("sends a named submit button's value", async () => {
    const user = userEvent.setup();
    const seen: FormData[] = [];
    const action = vi.fn(async (_state: ActionState, form: FormData): Promise<ActionState> => {
      seen.push(form);
      return null;
    });
    render(
      withToasts(
        <ActionForm
          action={action}
          footer={
            <button type="submit" name="intent" value="pause">
              Pause
            </button>
          }
        >
          <input name="x" defaultValue="1" readOnly />
        </ActionForm>,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].get("intent")).toBe("pause");
    expect(seen[0].get("x")).toBe("1");
  });
});

describe("ReviewForm (gigs-orders-01)", () => {
  it("posts the rating the stars show after a failed first submit", async () => {
    const user = userEvent.setup();
    reviewAction.fn
      .mockResolvedValueOnce({ ok: false, message: "A review needs a sentence." })
      .mockResolvedValueOnce({ ok: true });
    render(withToasts(<ReviewForm orderId="order-1" agentName="QA Fox" />));

    await user.click(screen.getByLabelText(/^2 stars/));
    await user.type(screen.getByLabelText(/How did QA Fox do/), "meh ");
    await user.click(screen.getByRole("button", { name: "Post review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A review needs a sentence.");

    // What is posted next must match what is on screen.
    expect(screen.getByLabelText(/^2 stars/)).toBeChecked();
    expect(screen.getByLabelText(/How did QA Fox do/)).toHaveValue("meh ");

    await user.type(screen.getByLabelText(/How did QA Fox do/), "but it shipped.");
    await user.click(screen.getByRole("button", { name: "Post review" }));
    await waitFor(() => expect(reviewAction.fn).toHaveBeenCalledTimes(2));
    const second = reviewAction.fn.mock.calls[1][1];
    expect(second.get("rating")).toBe("2");
    expect(second.get("body")).toBe("meh but it shipped.");
  });
});

describe("WorldPrompt (shell-home-01)", () => {
  it("follows a new request from the @World bar while already on /world", () => {
    const { rerender } = render(
      withToasts(<WorldPrompt defaultValue="Find 200 roofing companies" examples={[]} />),
    );
    const box = screen.getByLabelText("Tell @World what you need");
    expect(box).toHaveValue("Find 200 roofing companies");

    rerender(
      withToasts(<WorldPrompt defaultValue="Build a landing page for a pool company" examples={[]} />),
    );
    expect(box).toHaveValue("Build a landing page for a pool company");
  });

  it("keeps what the visitor is typing while the request is unchanged", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      withToasts(<WorldPrompt defaultValue="Find roofers" examples={[]} />),
    );
    const box = screen.getByLabelText("Tell @World what you need");
    await user.type(box, " in Tampa");
    rerender(withToasts(<WorldPrompt defaultValue="Find roofers" examples={[]} />));
    expect(box).toHaveValue("Find roofers in Tampa");
  });
});

describe("BrowseControls (shell-home-03)", () => {
  it("drops the params a new search should not carry", () => {
    const { container } = render(
      <BrowseControls
        basePath="/search"
        params={{ q: "roof", kind: "gig", sort: undefined }}
        dropOnSearch={["kind"]}
      />,
    );
    expect(container.querySelector('input[type="hidden"][name="kind"]')).toBeNull();
  });

  it("keeps every other filter on a browse page", () => {
    const { container } = render(
      <BrowseControls basePath="/gigs" params={{ q: "roof", category: "research" }} />,
    );
    expect(container.querySelector('input[type="hidden"][name="category"]')).toHaveValue(
      "research",
    );
    expect(container.querySelector('input[type="hidden"][name="q"]')).toBeNull();
  });
});
