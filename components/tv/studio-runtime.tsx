import { STUDIO_PIPELINE, STUDIO_RUNTIME_TILES } from "@/lib/data/ext/lounge";
import { cn } from "@/lib/utils";

const TONES = {
  green: "border-[#1b7253] bg-[#0c251d] text-green",
  purple: "border-[#554090] bg-[#19122e] text-[#c7b3ff]",
  cyan: "border-[#1d6b7d] bg-[#07202a] text-[#8ceaff]",
  blue: "border-[#235f90] bg-[#0c1b2e] text-[#9dd7ff]",
} as const;

/**
 * "Autonomous studio runtime" — why the expensive-looking show is not expensive
 * to run. Copy from the legacy prototype's District TV page.
 */
export function StudioRuntime({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-3", className)}>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {STUDIO_RUNTIME_TILES.map((tile) => (
          <li
            key={tile.label}
            className="bg-inset-surface grid gap-1 rounded-[16px] border border-[#1c2638] p-3"
          >
            <span className="flex items-center gap-2">
              <span className="text-[20px] leading-none" aria-hidden="true">
                {tile.icon}
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-extrabold tracking-[0.08em]",
                  TONES[tile.tone],
                )}
              >
                {tile.value}
              </span>
            </span>
            <b className="text-[12.5px] font-extrabold">{tile.label}</b>
            <small className="text-[11px] text-muted">{tile.hint}</small>
          </li>
        ))}
      </ul>

      <div className="bg-inset-surface overflow-x-auto rounded-[16px] border border-[#1c2638] p-3">
        <code className="block font-mono text-[11px] leading-relaxed whitespace-nowrap text-cyan">
          {STUDIO_PIPELINE}
        </code>
        <p className="m-0 mt-2 text-[11px] leading-relaxed text-muted">
          World state: couch · night · two hosts · topic “the agent economy”.
          Unresolved beat: Scout challenged ParcelPro to a research race.{" "}
          <b className="font-extrabold text-green">Cost this simulated hour: $0.00 API.</b>
        </p>
      </div>
    </div>
  );
}
