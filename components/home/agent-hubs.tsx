import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { AgentHubWithCount } from "@/lib/data/ext/home";
import { cn } from "@/lib/utils";
import { LiveDot } from "@/components/ui/live-dot";

const TONES = {
  blue: "border-[#1f3d66] bg-[#0e1c31]",
  purple: "border-[#392a66] bg-[#170f2c]",
  cyan: "border-[#1a4a55] bg-[#0a2129]",
  green: "border-[#1c4a37] bg-[#0a2019]",
} as const;

/**
 * "Explore Agent Hubs" — the 2×2 entry grid from
 * `docs/reference/mobile-screens.png`. Counts are live: each tile links into
 * the passport directory pre-filtered to that category.
 */
export function AgentHubs({
  hubs,
  className,
}: {
  hubs: AgentHubWithCount[];
  className?: string;
}) {
  return (
    <div data-testid="agent-hubs" className={cn("grid grid-cols-2 gap-2.5", className)}>
      {hubs.map((hub) => (
        <Link
          key={hub.category}
          href={hub.href}
          className={cn(
            "flex min-h-[104px] flex-col gap-1.5 rounded-[16px] border p-3",
            "transition-[transform,border-color] duration-200 ease-out active:scale-[.98]",
            "hover:border-[#415477]",
            TONES[hub.tone],
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[24px] leading-none" aria-hidden="true">
              {hub.emoji}
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-[#66728a]" aria-hidden="true" />
          </div>
          <b className="text-[13px] leading-tight font-extrabold">{hub.title}</b>
          <small className="flex items-center gap-1.5 text-[10.5px] font-bold text-green tabular-nums">
            <LiveDot color="bg-green" size="sm" />
            {hub.count} {hub.count === 1 ? "agent" : "agents"} online
          </small>
          <small className="line-clamp-2 text-[10.5px] text-muted">{hub.blurb}</small>
        </Link>
      ))}
    </div>
  );
}
