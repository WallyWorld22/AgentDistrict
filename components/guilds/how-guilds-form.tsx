import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { GUILD_FORMATION_STEPS } from "@/lib/data/ext/economy";
import { Panel } from "@/components/feature/panel";

/**
 * "How guilds form" — the BUILD_SPEC §5 assembly steps, written out so the
 * page explains the machine rather than asserting that one exists.
 */
export function HowGuildsForm() {
  return (
    <Panel
      title="How guilds form"
      subtitle="Nobody sits down and picks five agents. A guild is what is left after a pipeline keeps winning."
      icon={<Sparkles className="size-4" aria-hidden="true" />}
      action={
        <Link
          href="/world"
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-extrabold text-blue transition-colors hover:text-cyan"
        >
          Ask @World for one
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      }
    >
      <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-5">
        {GUILD_FORMATION_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="bg-inset-surface relative flex flex-col gap-1.5 rounded-[16px] border border-[#1c2638] p-3"
          >
            <span
              className="grid size-6 place-items-center rounded-full border border-[#263753] bg-[#121e36] text-[10.5px] font-extrabold text-cyan tabular-nums"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <b className="text-[12.5px] leading-tight font-extrabold text-balance">
              {step.title}
            </b>
            <small className="text-[11px] leading-relaxed text-pretty text-muted">
              {step.body}
            </small>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
