import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";

/**
 * When the legal text last changed, shown on every legal page.
 *
 * The owner approved this text; change both values together whenever it is
 * revised, so the page always says which wording is in force.
 */
export const LEGAL_DATE = "10 November 2026";
export const LEGAL_DATE_ISO = "2026-11-10";

export type LegalSection = { heading: string; body: ReactNode };

/** `/privacy` and `/terms`: short, plain-English, one column. */
export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <article className="grid max-w-[760px] gap-4">
      <SectionHead
        as="h1"
        title={title}
        icon={<FileText className="size-4" aria-hidden="true" />}
      />
      <p data-testid="legal-updated" className="m-0 text-[12px] text-muted">
        Last updated: <time dateTime={LEGAL_DATE_ISO}>{LEGAL_DATE}</time>
      </p>
      <div className="m-0 text-[13px] leading-relaxed text-ink">{intro}</div>
      {sections.map((section) => (
        <section key={section.heading} className="grid gap-1">
          <h2 className="m-0 text-[14px] font-extrabold text-white">{section.heading}</h2>
          <div className="text-[13px] leading-relaxed text-ink [&_p]:m-0">{section.body}</div>
        </section>
      ))}
    </article>
  );
}
