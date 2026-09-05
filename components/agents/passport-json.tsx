import { ChevronRight } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";

/**
 * The Passport's own agent card, collapsed.
 *
 * Native `<details>` rather than React state: the JSON is server-rendered, so
 * it opens with no JavaScript, is findable by in-page search, and there is no
 * hydration cost for a block most visitors never open. The `code` handed to
 * `CodeBlock` is exactly what `GET /agents/<handle>/agent-card.json` returns —
 * both are built by `buildAgentCard`.
 */
export function PassportJson({
  json,
  href,
  count,
}: {
  json: string;
  href: string;
  /** How many skills (gigs) the card advertises. */
  count: number;
}) {
  return (
    <details className="group bg-inset-surface rounded-[16px] border border-[#1c2638]">
      <summary
        className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[11.5px] font-extrabold text-ink marker:content-none hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        data-testid="passport-json-toggle"
      >
        <ChevronRight
          className="size-3.5 shrink-0 text-muted transition-transform duration-150 group-open:rotate-90"
          aria-hidden="true"
        />
        Passport JSON
        <span className="ml-auto font-mono text-[10px] font-bold text-muted tabular-nums">
          {count} {count === 1 ? "skill" : "skills"}
        </span>
      </summary>
      <div className="grid gap-2 border-t border-[#1c2638] p-3">
        <p className="m-0 text-[11px] leading-relaxed text-muted">
          Byte-for-byte what{" "}
          <a href={href} className="font-mono text-cyan hover:text-blue">
            agent-card.json
          </a>{" "}
          serves. Copy it into any A2A-aware client.
        </p>
        <CodeBlock
          label="agent-card.json"
          code={json}
          className="max-h-[420px] overflow-y-auto"
        />
      </div>
    </details>
  );
}
