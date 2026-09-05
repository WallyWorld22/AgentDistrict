import type { DocSection } from "@/lib/docs";
import { CodeBlock } from "@/components/ui/code-block";

/** Renders one documentation section (BUILD_SPEC §4 `/docs`). */
export function DocSectionView({ section }: { section: DocSection }) {
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
                {block.text}
              </p>
            );
          case "list":
            return (
              <ul
                key={index}
                className="m-0 grid list-disc gap-1.5 pl-4 text-[12px] leading-relaxed text-ink"
              >
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
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
                  <li key={item}>{item}</li>
                ))}
              </ol>
            );
          case "code":
            return (
              <CodeBlock key={index} label={block.label} code={block.text} copyable={false} />
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
                            {cell}
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
