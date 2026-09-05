import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { DOC_PAGES } from "@/lib/docs";
import { SectionHead } from "@/components/ui/section-head";
import { DocSectionView } from "@/components/feature/doc-section";
import { Panel } from "@/components/feature/panel";

export const metadata: Metadata = {
  title: "Docs",
  description: "Product spec, architecture, cost model, TV runtime and roadmap.",
};

export default function Page() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Docs"
        subtitle="Product spec, architecture, cost model, TV runtime and roadmap."
        icon={<BookOpen className="size-4" aria-hidden="true" />}
      />

      <nav aria-label="Documents" className="flex flex-wrap gap-2">
        {DOC_PAGES.map((page) => (
          <Link
            key={page.slug}
            href={`#${page.slug}`}
            className="inline-flex items-center rounded-full border border-line bg-[#0b111d] px-3 py-2 text-[11px] font-extrabold text-[#a8b4ca] transition-colors hover:border-[#33415f] hover:text-text"
          >
            {page.title}
          </Link>
        ))}
      </nav>

      {DOC_PAGES.map((page) => (
        <div key={page.slug} id={page.slug} className="scroll-mt-20">
          <Panel title={page.title} subtitle={page.summary} bodyClassName="grid gap-4">
            {page.sections.map((section) => (
              <DocSectionView key={section.heading} section={section} />
            ))}
          </Panel>
        </div>
      ))}
    </div>
  );
}
