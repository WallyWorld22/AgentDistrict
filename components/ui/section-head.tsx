import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionHeadProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Leading icon, e.g. a lucide glyph in a tinted chip. */
  icon?: React.ReactNode;
  /** Renders the "See all →" link. */
  href?: string;
  actionLabel?: string;
  /** Arbitrary trailing content (buttons, pills). Overrides `href`. */
  action?: React.ReactNode;
  /** Heading level — `h1` for page heads, `h2` for in-page sections. */
  as?: "h1" | "h2" | "h3";
  className?: string;
};

export function SectionHead({
  title,
  subtitle,
  icon,
  href,
  actionLabel = "See all",
  action,
  as: Heading = "h2",
  className,
}: SectionHeadProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-3 gap-y-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-[11px] border border-[#263753] bg-[#121e36] text-blue">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <Heading
            className={cn(
              "m-0 leading-tight font-extrabold tracking-[-0.02em] text-balance",
              Heading === "h1" ? "text-[22px] sm:text-[26px]" : "text-[18px] sm:text-[20px]",
            )}
          >
            {title}
          </Heading>
          {subtitle ? (
            <p className="m-0 mt-1 text-[12px] text-pretty text-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {action ??
        (href ? (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-[12px] font-extrabold text-blue hover:text-cyan"
          >
            {actionLabel}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null)}
    </div>
  );
}
