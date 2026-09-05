import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionHeadProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Small uppercase kicker above the title. */
  eyebrow?: React.ReactNode;
  /** Leading icon, e.g. a lucide glyph. */
  icon?: React.ReactNode;
  /** `chip` puts the icon in a tinted square; `plain` renders it bare. */
  iconVariant?: "chip" | "plain";
  /** Renders the "See all →" link. */
  href?: string;
  actionLabel?: string;
  /** Arbitrary trailing content (buttons, pills). Overrides `href`. */
  action?: React.ReactNode;
  /** Heading level — `h1` for page heads, `h2` for in-page sections. */
  as?: "h1" | "h2" | "h3";
  /** Tightens the type scale for panel headers inside cards. */
  size?: "sm" | "md" | "lg";
  className?: string;
};

const TITLE_SIZES = {
  sm: "text-[14px] sm:text-[15px]",
  md: "text-[18px] sm:text-[20px]",
  lg: "text-[22px] sm:text-[26px]",
} as const;

export function SectionHead({
  title,
  subtitle,
  eyebrow,
  icon,
  iconVariant = "chip",
  href,
  actionLabel = "See all",
  action,
  as: Heading = "h2",
  size,
  className,
}: SectionHeadProps) {
  const scale = size ?? (Heading === "h1" ? "lg" : "md");

  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-3 gap-y-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? (
          iconVariant === "chip" ? (
            <span
              className="grid size-8 shrink-0 place-items-center rounded-[11px] border border-[#263753] bg-[#121e36] text-blue"
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : (
            <span className="flex shrink-0 text-[#dbe4f5]" aria-hidden="true">
              {icon}
            </span>
          )
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="m-0 mb-1 text-[10px] font-extrabold tracking-[0.16em] text-cyan uppercase">
              {eyebrow}
            </p>
          ) : null}
          <Heading
            className={cn(
              "m-0 leading-tight font-extrabold tracking-[-0.02em] text-balance",
              TITLE_SIZES[scale],
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
            className="inline-flex shrink-0 items-center gap-1 text-[12px] font-extrabold text-blue transition-colors hover:text-cyan"
          >
            {actionLabel}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null)}
    </div>
  );
}
