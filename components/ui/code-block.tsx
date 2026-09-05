"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export type CodeBlockProps = {
  code: string;
  /** Shown top-left, e.g. "curl" or "mcp.json". */
  label?: string;
  /** Hide the copy button (e.g. for the ASCII pipeline diagrams). */
  copyable?: boolean;
  className?: string;
};

/** Monospace surface matching the legacy `.machine-gateway` block. */
export function CodeBlock({
  code,
  label,
  copyable = true,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={cn(
        "relative rounded-[18px] border border-[#24314a] bg-[#070c14]",
        className,
      )}
    >
      {label || copyable ? (
        <div className="flex items-center justify-between gap-2 border-b border-[#1a2436] px-3.5 py-2">
          <span className="font-mono text-[10px] tracking-wide text-[#7f8ca4] uppercase">
            {label}
          </span>
          {copyable ? (
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? "Copied" : "Copy to clipboard"}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#26334c] bg-[#111827] px-2 py-1 text-[10px] font-extrabold text-[#a8b4ca] hover:text-text"
            >
              {copied ? (
                <Check className="size-3 text-green" aria-hidden="true" />
              ) : (
                <Copy className="size-3" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
        </div>
      ) : null}
      <pre className="m-0 overflow-x-auto px-3.5 py-3.5 font-mono text-[11px] leading-relaxed text-[#a8dfff]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
