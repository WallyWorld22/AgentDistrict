import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { DocSectionView, InlineDocText } from "@/components/feature/doc-section";
import { DOC_ORIGIN, DOC_PAGES, getDocPage } from "@/lib/docs";

/**
 * The /docs renderer (site audit comms-docs-09 and -10): the doc source's
 * bold and italic render as emphasis, not asterisks; code samples carry a Copy
 * button and the site's real address; and a site path is a link.
 */

const ORIGIN = "https://district.example";

describe("doc inline text", () => {
  it("renders **bold** and *italic* instead of printing the markers", () => {
    const { container } = render(
      <p>
        <InlineDocText text="an **input contract** and an *autonomous* caller, 2 * 3 stays" />
      </p>,
    );
    expect(container.textContent).toBe("an input contract and an autonomous caller, 2 * 3 stays");
    expect(container.querySelector("strong")?.textContent).toBe("input contract");
    expect(container.querySelector("em")?.textContent).toBe("autonomous");
  });

  it("links a plain site path, and leaves templates and API paths as code", () => {
    const { container } = render(
      <p>
        <InlineDocText text="Read `/openapi.json`, then `/agents/{handle}` and `/api/mcp/mcp`." />
      </p>,
    );
    const links = Array.from(container.querySelectorAll("a"));
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/openapi.json"]);
    expect(container.querySelectorAll("code")).toHaveLength(3);
  });

  it("leaves no literal ** or stray * markers on any docs page", () => {
    for (const page of DOC_PAGES) {
      const { container, unmount } = render(
        <div>
          {page.sections.map((section) => (
            <DocSectionView key={section.heading} section={section} origin={ORIGIN} />
          ))}
        </div>,
      );
      const prose = Array.from(container.querySelectorAll("p, li, td"))
        .map((node) => node.textContent ?? "")
        .join("\n");
      expect(prose, page.slug).not.toMatch(/\*\*|(^|\s)\*\S/);
      unmount();
    }
  });
});

describe("doc code blocks", () => {
  it("are copyable and aimed at this site, not a placeholder host", () => {
    const page = getDocPage("getting-started-agents")!;
    const { container } = render(
      <div>
        {page.sections.map((section) => (
          <DocSectionView key={section.heading} section={section} origin={ORIGIN} />
        ))}
      </div>,
    );
    const blocks = container.querySelectorAll("pre");
    expect(blocks.length).toBeGreaterThan(1);
    expect(screen.getAllByRole("button", { name: "Copy to clipboard" })).toHaveLength(blocks.length);
    expect(container.textContent).not.toContain(DOC_ORIGIN);
    expect(container.textContent).toContain(`${ORIGIN}/api/mcp/mcp`);

    // The hire sample sends the field the API takes.
    const hire = Array.from(blocks).find((block) => block.textContent?.includes("/api/v1/orders"))!;
    expect(hire.textContent).toContain('"gig_slug":"find-100-qualified-local-businesses"');
  });

  it("keeps the ASCII topology diagram unwrapped and without a Copy button", () => {
    const section = DOC_PAGES.flatMap((page) => page.sections).find((entry) =>
      entry.blocks.some((block) => block.kind === "code" && block.label === "topology"),
    )!;
    const { container } = render(<DocSectionView section={section} origin={ORIGIN} />);
    const diagram = Array.from(container.querySelectorAll("pre")).find((pre) =>
      pre.textContent?.includes("AGENTDISTRICT"),
    )!;
    const panel = diagram.parentElement!;
    expect(within(panel).queryByRole("button")).toBeNull();
  });
});
