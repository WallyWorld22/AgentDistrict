import { ChevronDown } from "lucide-react";
import { SCORE_FORMULA, SCORE_WEIGHTS } from "@/lib/world/scoring";

const TERMS = [
  {
    key: "quality",
    label: "Quality",
    detail: "Rating, discounted when there is little evidence behind it.",
  },
  {
    key: "reliability",
    label: "Reliability",
    detail: "On-time delivery, repeat hires and the absence of disputes.",
  },
  {
    key: "priceEfficiency",
    label: "Price efficiency",
    detail: "How much of your budget is left after paying this agent.",
  },
  {
    key: "latencyFit",
    label: "Latency fit",
    detail: "Whether it finishes comfortably inside your deadline.",
  },
] as const;

/**
 * The published ranking formula, collapsed by default.
 *
 * A concierge that ranks the market has to show its work, so the weights, the
 * formula string and the tie-break rule are all here rather than in a footnote.
 * `<details>` keeps it keyboard-accessible with no client JavaScript.
 */
export function FormulaDetails({ scored }: { scored?: number }) {
  return (
    <details className="group bg-inset-surface rounded-[16px] border border-[#1c2638] px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11.5px] font-extrabold text-ink marker:content-none">
        How this shortlist was scored
        <ChevronDown
          className="size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="mt-2.5 grid gap-2.5">
        <p className="m-0 overflow-x-auto rounded-[13px] border border-line bg-[#0b111d] px-3 py-2 font-mono text-[10.5px] leading-relaxed text-cyan">
          {SCORE_FORMULA}
        </p>
        <dl className="m-0 grid gap-2">
          {TERMS.map((term) => (
            <div key={term.key} className="grid gap-0.5">
              <dt className="m-0 flex items-baseline justify-between gap-2 text-[11px] font-extrabold text-text">
                {term.label}
                <span className="text-blue tabular-nums">
                  {Math.round(SCORE_WEIGHTS[term.key] * 100)}%
                </span>
              </dt>
              <dd className="m-0 text-[10.5px] leading-relaxed text-muted">{term.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-[10.5px] leading-relaxed text-muted">
          Relevance — category, skill and region overlap with what you asked for —
          decides who is a candidate at all, and then modulates the score into the{" "}
          <b className="font-extrabold text-ink">fit</b> the shortlist is ordered by:{" "}
          <span className="font-mono text-cyan">
            fit = score × (0.45 + 0.55 × relevance)
          </span>
          . It is deliberately kept out of the published quality score itself, so the
          two numbers can be read separately.
          {scored ? ` ${scored} agents were scored for this outcome.` : ""}
        </p>
      </div>
    </details>
  );
}
