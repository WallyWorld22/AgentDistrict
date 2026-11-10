import * as React from "react";
import { DOC_ORIGIN, type DocSection } from "@/lib/docs";
import { CodeBlock } from "@/components/ui/code-block";

/**
 * A backticked span that is a page or document a reader can open: a plain
 * site path such as `/openapi.json` or `/developers`. Templates
 * (`/agents/{handle}`, `/orders/:id`) and the API itself (`/api/...`, which
 * answers machines, not readers) stay code.
 */
function linkablePath(code: string): boolean {
  return /^\/[A-Za-z0-9._~/-]*$/.test(code) && !code.startsWith("/api/");
}

/**
 * `**bold**` and `*italic*` inside one stretch of prose. The doc source uses
 * both (`**input contract**`, `*autonomous*`), and they used to print as
 * literal asterisks (comms-docs-09). A lone `*` with a space after it is left
 * alone, so arithmetic like `0.35 × quality` or `a * b` survives.
 */
function Emphasis({ text }: { text: string }) {
  const pattern = /\*\*([^*]+?)\*\*|\*(?!\s)([^*]+?)(?<!\s)\*/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    out.push(
      match[1] !== undefined ? (
        <strong key={index} className="font-extrabold">
          {match[1]}
        </strong>
      ) : (
        <em key={index}>{match[2]}</em>
      ),
    );
    last = index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/**
 * Renders the doc source's inline markup: `` `backticked` `` spans as real
 * inline code (a site path among them as a link), and bold and italic.
 *
 * The doc source is written the way anyone writes prose about code, so the
 * backticks have to mean something — printing them verbatim made
 * `approval_threshold_cents` read as punctuation on /docs/cost-model.
 */
export function InlineDocText({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) return <Emphasis key={index} text={part} />;
        const code = (
          <code className="rounded-[6px] bg-[#111a2b] px-1 py-px font-mono text-[0.92em] text-cyan">
            {part}
          </code>
        );
        return linkablePath(part) ? (
          <a
            key={index}
            href={part}
            className="underline decoration-cyan/40 underline-offset-2 hover:decoration-cyan"
          >
            {code}
          </a>
        ) : (
          <React.Fragment key={index}>{code}</React.Fragment>
        );
      })}
    </>
  );
}

/**
 * Renders one documentation section (BUILD_SPEC §4 `/docs`).
 *
 * `origin` replaces the source's `DOC_ORIGIN` placeholder in code samples, so
 * the Copy button hands over a command aimed at this site.
 */
export function DocSectionView({ section, origin }: { section: DocSection; origin: string }) {
  return (
    <section className="grid gap-2">
      <h3 className="m-0 text-[13.5px] font-extrabold tracking-[-0.01em]">
        {section.heading}
      </h3>
      {section.blocks.map((block, index) => {
        switch (block.kind) {
          case "p":
            return (
              <p key={index} className="m-0 text-[12.5px] leading-relaxed text-ink">
                <InlineDocText text={block.text} />
              </p>
            );
          case "list":
            return (
              <ul
                key={index}
                className="m-0 grid list-disc gap-1.5 pl-4 text-[12px] leading-relaxed text-ink"
              >
                {block.items.map((item) => (
                  <li key={item}>
                    <InlineDocText text={item} />
                  </li>
                ))}
              </ul>
            );
          case "ordered":
            return (
              <ol
                key={index}
                className="m-0 grid list-decimal gap-1.5 pl-4 text-[12px] leading-relaxed text-ink"
              >
                {block.items.map((item) => (
                  <li key={item}>
                    <InlineDocText text={item} />
                  </li>
                ))}
              </ol>
            );
          case "code":
            return (
              <CodeBlock
                key={index}
                label={block.label}
                code={block.text.split(DOC_ORIGIN).join(origin)}
                copyable={!block.diagram}
                wrap={!block.diagram}
              />
            );
          case "table":
            return (
              <div
                key={index}
                className="overflow-x-auto rounded-[16px] border border-[#1c2638]"
              >
                <table className="w-full min-w-[420px] border-collapse text-left text-[11.5px]">
                  <thead>
                    <tr className="bg-[#0c1321]">
                      {block.head.map((cell) => (
                        <th
                          key={cell}
                          scope="col"
                          className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted"
                        >
                          {cell}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row) => (
                      <tr key={row.join("|")} className="odd:bg-white/[.015]">
                        {row.map((cell) => (
                          <td
                            key={cell}
                            className="border-b border-[#141c2b] px-3 py-2 align-top text-ink"
                          >
                            <InlineDocText text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </section>
  );
}
