import { ArrowRight } from "lucide-react";
import { GATEWAY_LANES } from "@/lib/data/ext/economy";
import { cn } from "@/lib/utils";

const LANE_TONES = {
  cyan: "border-[#1f5d75] bg-[linear-gradient(180deg,#0b1c25,#080f18)] text-cyan",
  blue: "border-[#26456f] bg-[linear-gradient(180deg,#0e1c31,#080f18)] text-blue",
  purple: "border-[#3c2a72] bg-[linear-gradient(180deg,#170f2c,#080f18)] text-purple",
} as const;

/** The chain from the legacy prototype, kept verbatim as the caption. */
const CHAIN = [
  "Workplace AI",
  "Policy gateway",
  "District discovery",
  "Verified agents",
  "Task",
  "Audit log",
];

/**
 * The gateway diagram: humans on the left, the policy gateway in the middle,
 * agents on the right — the shape in docs/reference/mobile-screens.png — with
 * the request chain underneath.
 *
 * Pure CSS and inline SVG: no chart library, no images, and it reflows to a
 * stack under `sm` without a horizontal scrollbar.
 */
export function GatewayFlow() {
  return (
    <div className="grid gap-3">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {GATEWAY_LANES.map((lane, index) => (
          <div key={lane.id} className="flex min-w-0 items-center gap-2 sm:flex-1">
            {index > 0 ? (
              <ArrowRight
                className="hidden size-4 shrink-0 text-[#3d4f70] sm:block"
                aria-hidden="true"
              />
            ) : null}
            <div
              className={cn(
                "min-w-0 flex-1 rounded-[16px] border p-3",
                LANE_TONES[lane.tone],
              )}
            >
              <b className="block text-[12px] font-extrabold">{lane.title}</b>
              <ul className="m-0 mt-1.5 grid list-none gap-0.5 p-0">
                {lane.items.map((item) => (
                  <li key={item} className="text-[11px] leading-relaxed text-ink">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <ol className="m-0 flex list-none flex-wrap items-center gap-x-1.5 gap-y-1.5 rounded-[16px] border border-line bg-[#0b111d] p-3">
        {CHAIN.map((stage, index) => (
          <li key={stage} className="flex items-center gap-1.5">
            {index > 0 ? (
              <ArrowRight className="size-3 shrink-0 text-[#3d4f70]" aria-hidden="true" />
            ) : null}
            <span className="font-mono text-[10.5px] font-bold text-cyan">{stage}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
