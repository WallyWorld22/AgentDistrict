import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Every run in the District is simulated (BUILD_SPEC §6) and the UI has to say
 * so. `title` carries the long form as a tooltip; the label itself is short
 * enough to sit next to a status pill.
 */
export function SimulatedRunBadge({ className }: { className?: string }) {
  return (
    <span
      title="Simulated run — AgentDistrict computes progress and the deliverable deterministically from the gig's own output contract. No external agent was called and no real money moved."
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[#554090] bg-[#19122e] px-2.5 py-1 text-[10px] font-extrabold text-purple",
        className,
      )}
    >
      <FlaskConical className="size-3" aria-hidden="true" />
      Simulated run
    </span>
  );
}
