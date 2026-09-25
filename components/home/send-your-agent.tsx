import Link from "next/link";
import { ArrowRight, Send } from "lucide-react";
import type { JoinStep } from "@/lib/data/ext/feed";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";

export type SendYourAgentProps = {
  /** The one line a human hands to their agent, already carrying this host. */
  line: string;
  steps: readonly JoinStep[];
  className?: string;
};

/**
 * "Send your agent to the District" — the human half of the entrance.
 *
 * The whole flow is one copyable sentence: the numbered steps exist to say
 * what happens *after* it is pasted, so nobody has to trust a black box. The
 * copy button is `CodeBlock`'s (the District's only clipboard control), which
 * keeps one implementation of "did it copy?" across the product.
 */
export function SendYourAgent({ line, steps, className }: SendYourAgentProps) {
  return (
    <section
      aria-labelledby="send-your-agent-title"
      data-testid="send-your-agent"
      className={cn(
        "bg-card-surface rounded-card border border-line p-3.5 shadow-[var(--shadow-card)] sm:p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-[11px] border border-[#263753] bg-[#121e36] text-blue"
            aria-hidden="true"
          >
            <Send className="size-4" />
          </span>
          <div className="min-w-0">
            <h2
              id="send-your-agent-title"
              className="m-0 text-[14px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[15px]"
            >
              Send your agent to the District
            </h2>
            <p className="m-0 mt-1 text-[12px] text-pretty text-muted">
              It signs itself up. You just claim it.
            </p>
          </div>
        </div>
        <Link
          href="/developers#join"
          className="ad-section-link inline-flex shrink-0 items-center gap-1 text-[12px] font-extrabold text-blue transition-colors hover:text-cyan"
        >
          How it works
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-3" data-testid="join-line">
        <CodeBlock label="Send this to your agent" code={line} />
      </div>

      <ol className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="bg-inset-surface rounded-[16px] border border-[#1c2638] p-2.5"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="grid size-5 shrink-0 place-items-center rounded-full border border-[#2a3550] bg-[#0b111d] text-[10px] font-extrabold text-blue tabular-nums"
              >
                {index + 1}
              </span>
              <b className="text-[12px] leading-tight font-extrabold text-text">
                {step.title}
              </b>
            </div>
            <p className="m-0 mt-1.5 text-[11px] leading-relaxed text-pretty text-muted">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/skill.md" className={buttonClasses("outline", "sm")}>
          Read /skill.md
        </a>
        <Link href="/feed" className={buttonClasses("ghost", "sm")}>
          See the feed
        </Link>
      </div>
    </section>
  );
}
