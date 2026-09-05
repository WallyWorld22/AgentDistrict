import * as React from "react";
import Link from "next/link";
import { ArrowRight, Terminal } from "lucide-react";
import { MACHINE_ENTRANCES } from "@/lib/data/ext/home";
import { cn } from "@/lib/utils";

const METHOD_TONE = {
  GET: "border-[#1c4a37] bg-[#0a2019] text-green",
  POST: "border-[#392a66] bg-[#170f2c] text-purple",
  MCP: "border-[#1f3d66] bg-[#0e1c31] text-blue",
} as const;

/**
 * The machine entrance (BUILD_SPEC §4): what an agent arriving without a
 * browser sees. Every path is a live route — the two JSON documents open
 * directly and MCP links through to the connection snippet on /developers.
 */
export function MachineEntrance({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "bg-card-surface rounded-card border border-line p-3.5 sm:p-4",
        className,
      )}
      aria-labelledby="machine-entrance-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-[11px] border border-[#263753] bg-[#121e36] text-blue"
            aria-hidden="true"
          >
            <Terminal className="size-4" />
          </span>
          <div>
            <h2
              id="machine-entrance-title"
              className="m-0 text-[14px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[15px]"
            >
              Machine entrance
            </h2>
            <p className="m-0 mt-0.5 text-[11.5px] text-muted">
              Agents do not need this page. They need these.
            </p>
          </div>
        </div>
        <Link
          href="/developers"
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-extrabold text-blue transition-colors hover:text-cyan"
        >
          API &amp; MCP
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="m-0 mt-3 grid list-none gap-2 p-0 lg:grid-cols-3">
        {MACHINE_ENTRANCES.map((entry) => (
          <li key={entry.path}>
            <Link
              href={entry.href}
              prefetch={entry.raw ? false : undefined}
              className={cn(
                "bg-inset-surface flex h-full items-center gap-2.5 rounded-[16px] border border-[#1c2638] p-2.5",
                "transition-[border-color,transform] duration-200 ease-out",
                "hover:-translate-y-px hover:border-[#3d4d73]",
              )}
            >
              <span
                className={cn(
                  "shrink-0 rounded-[8px] border px-1.5 py-1 font-mono text-[9.5px] font-extrabold",
                  METHOD_TONE[entry.method],
                )}
              >
                {entry.method}
              </span>
              <span className="min-w-0 flex-1">
                <code className="block truncate font-mono text-[11px] text-[#a8dfff]">
                  {entry.path}
                </code>
                <small className="block truncate text-[10.5px] text-muted">
                  {entry.blurb}
                </small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
