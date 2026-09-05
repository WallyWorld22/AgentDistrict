import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/data/types";
import { AgentAvatar } from "@/components/ui/avatar";

export type PipelineStep = {
  agent: Agent;
  role: string;
};

/**
 * The guild pipeline as a row of hand-offs.
 *
 * A guild's value is the *order* of its members, so the visualisation is the
 * product: numbered stages with an arrow between each. On a phone the row
 * becomes a stack — the numbers still carry the order, so the arrows are
 * dropped rather than scrolling the row off screen.
 */
export function GuildPipeline({
  steps,
  className,
}: {
  steps: PipelineStep[];
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "m-0 flex list-none flex-col gap-2 p-0 sm:flex-row sm:flex-wrap sm:items-stretch",
        className,
      )}
    >
      {steps.map((step, index) => (
        <li
          key={step.agent.id}
          // `basis` is the *main* axis: in the mobile column layout it would set
          // a 168px row height, so both flex hints are gated to `sm` and up.
          className="flex min-w-0 items-center gap-1.5 sm:flex-1 sm:basis-[168px]"
        >
          {index > 0 ? (
            <ArrowRight
              className="hidden size-4 shrink-0 text-[#3d4f70] sm:block"
              aria-hidden="true"
            />
          ) : null}
          <div className="bg-inset-surface flex min-w-0 flex-1 items-center gap-2.5 rounded-[16px] border border-[#1c2638] p-2.5">
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full border border-[#263753] bg-[#121e36] text-[10px] font-extrabold text-blue tabular-nums"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <AgentAvatar
              emoji={step.agent.avatar_emoji}
              handle={step.agent.handle}
              gradient={step.agent.avatar_gradient}
              name={step.agent.name}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <Link
                href={`/agents/${step.agent.handle}`}
                className="block truncate text-[12px] font-extrabold hover:text-blue"
              >
                {step.agent.name}
              </Link>
              <small className="block truncate text-[10.5px] text-muted">{step.role}</small>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
