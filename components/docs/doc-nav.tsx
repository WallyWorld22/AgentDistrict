import Link from "next/link";
import { DOC_PAGES, type DocPage } from "@/lib/docs";
import { cn } from "@/lib/utils";

/**
 * The docs table of contents.
 *
 * A plain nav rather than a client component: the active page comes from the
 * route, and the section links are in-page anchors, so nothing here needs to
 * hydrate. On `lg+` the page layout makes it a sticky left rail.
 */
export function DocNav({ activeSlug }: { activeSlug?: string }) {
  const active: DocPage | undefined = DOC_PAGES.find((page) => page.slug === activeSlug);

  return (
    <nav aria-label="Documentation" className="grid gap-1">
      {DOC_PAGES.map((page) => {
        const current = page.slug === activeSlug;
        return (
          <div key={page.slug} className="grid gap-1">
            <Link
              href={`/docs/${page.slug}`}
              aria-current={current ? "page" : undefined}
              className={cn(
                "block rounded-[13px] border px-3 py-2 text-[12px] font-extrabold transition-colors",
                current
                  ? "border-[#3a72c4] bg-[#101c33] text-text"
                  : "border-transparent text-[#a8b4ca] hover:border-line hover:bg-[#0b111d] hover:text-text",
              )}
            >
              {page.title}
            </Link>
            {current && active ? (
              <ul className="m-0 grid list-none gap-0.5 border-l border-line pl-3 p-0 ml-3">
                {active.sections.map((section) => (
                  <li key={section.heading}>
                    <Link
                      href={`#${anchorFor(section.heading)}`}
                      className="block truncate rounded-[10px] px-2 py-1 text-[11px] text-muted transition-colors hover:text-text"
                    >
                      {section.heading}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/** Stable in-page anchor for a section heading. */
export function anchorFor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
