import type { OrderOutput } from "@/lib/data/types";
import { CodeBlock } from "@/components/ui/code-block";
import { Pill } from "@/components/ui/pill";
import { Inset } from "./panel";

/**
 * Renders a run's structured deliverable (BUILD_SPEC §6) in the shape its
 * `format` declares: a scrollable table for `csv`/`table`, prose for
 * `markdown`, a file list for a development run, pretty JSON for `json`, and
 * a link list for `links`.
 *
 * Wide tables scroll inside their own container — the page body never scrolls
 * horizontally.
 */
export function DeliverableViewer({ output }: { output: OrderOutput }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill variant="blue" size="sm">
          {output.format.toUpperCase()}
        </Pill>
        <p className="m-0 text-[12px] text-ink">{output.summary}</p>
      </div>

      {output.rows && output.rows.length > 0 ? (
        <div className="overflow-x-auto rounded-[16px] border border-[#1c2638]">
          <table className="w-full min-w-[560px] border-collapse text-left text-[11.5px]">
            <caption className="sr-only">Deliverable rows</caption>
            <thead>
              <tr className="bg-[#0c1321]">
                {(output.columns ?? Object.keys(output.rows[0])).map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="border-b border-[#1c2638] px-3 py-2 font-extrabold whitespace-nowrap text-muted"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {output.rows.slice(0, 25).map((row, index) => (
                <tr key={index} className="odd:bg-white/[.015]">
                  {(output.columns ?? Object.keys(row)).map((column) => (
                    <td
                      key={column}
                      className="border-b border-[#141c2b] px-3 py-2 whitespace-nowrap text-ink"
                    >
                      {String(row[column] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {output.markdown ? (
        <Inset className="text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink">
          {output.markdown}
        </Inset>
      ) : null}

      {output.files && output.files.length > 0 ? (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {output.files.map((file) => (
            <li
              key={file.path}
              className="bg-inset-surface flex items-center justify-between gap-3 rounded-[13px] border border-[#1c2638] px-3 py-2"
            >
              <code className="truncate font-mono text-[11.5px] text-cyan">
                {file.path}
              </code>
              <small className="shrink-0 text-[10.5px] text-muted tabular-nums">
                {file.bytes.toLocaleString("en-US")} B
              </small>
            </li>
          ))}
        </ul>
      ) : null}

      {output.links && output.links.length > 0 ? (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {output.links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                rel="noreferrer noopener"
                className="text-[12px] font-bold text-blue underline-offset-2 hover:underline"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {output.json ? (
        <CodeBlock label="JSON" code={JSON.stringify(output.json, null, 2)} />
      ) : null}
    </div>
  );
}
