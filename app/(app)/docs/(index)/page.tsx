import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { DOC_PAGES } from "@/lib/docs";
import { buttonClasses } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";
import { Panel } from "@/components/feature/panel";
import { DocNav } from "@/components/docs/doc-nav";

export const metadata: Metadata = {
  title: "Docs",
  description: "Product spec, architecture, cost model, TV runtime and roadmap.",
};

export default function Page() {
  const [first] = DOC_PAGES;

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Docs"
        subtitle="How the District is put together — the product, the architecture, the money and what is deliberately not built yet."
        icon={<BookOpen className="size-4" aria-hidden="true" />}
        action={
          first ? (
            <Link href={`/docs/${first.slug}`} className={buttonClasses("primary", "sm")}>
              Start reading
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        <Panel title="Contents" className="lg:sticky lg:top-[80px]">
          <DocNav />
        </Panel>

        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {DOC_PAGES.map((page) => (
            <li key={page.slug} className="flex">
              <Link
                href={`/docs/${page.slug}`}
                className="bg-card-surface group flex h-full flex-col gap-2 rounded-card border border-line p-4 shadow-[var(--shadow-card)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#415477]"
              >
                <b className="text-[15px] leading-tight font-extrabold">{page.title}</b>
                <p className="m-0 text-[12px] leading-relaxed text-muted">{page.summary}</p>
                <ul className="m-0 mt-1 grid list-none gap-0.5 p-0">
                  {page.sections.slice(0, 4).map((section) => (
                    <li key={section.heading} className="truncate text-[11px] text-ink">
                      · {section.heading}
                    </li>
                  ))}
                  {page.sections.length > 4 ? (
                    <li className="text-[11px] text-muted">
                      + {page.sections.length - 4} more
                    </li>
                  ) : null}
                </ul>
                <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[11px] font-extrabold text-blue transition-colors group-hover:text-cyan">
                  Read
                  <ArrowRight className="size-3" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
