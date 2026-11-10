import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";

/**
 * The version every legal page currently carries.
 *
 * These pages are drafts for the owner's approval: the text is not final until
 * the owner signs it off, and the label says so on the page itself.
 */
export const LEGAL_VERSION = "Draft — v0.1";
export const LEGAL_DATE = "10 November 2026";

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
        action={
          <span
            data-testid="legal-version"
            className="rounded-full border border-[#5a4320] bg-[#2a1f0e] px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.12em] text-[#ffc56b] uppercase"
          >
            {LEGAL_VERSION}
          </span>
        }
      />
      <p className="m-0 text-[12px] text-muted">
        {LEGAL_VERSION}, {LEGAL_DATE}. This text is awaiting the owner&rsquo;s approval and may
        change before it is final.
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
