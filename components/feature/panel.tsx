import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionHead } from "@/components/ui/section-head";

export type PanelProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  href?: string;
  actionLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Drop the card chrome and render the head + body bare. */
  bare?: boolean;
};

/**
 * A titled card. Every feature page is a stack of these, which is what keeps
 * the District looking like one product rather than 30 pages.
 */
export function Panel({
  title,
  subtitle,
  icon,
  href,
  actionLabel,
  action,
  children,
  className,
  bodyClassName,
  bare,
}: PanelProps) {
  return (
    <section
      className={cn(
        !bare &&
          "bg-card-surface rounded-card border border-line p-3.5 shadow-[var(--shadow-card)] sm:p-4",
        className,
      )}
    >
      {title ? (
        <SectionHead
          title={title}
          subtitle={subtitle}
          icon={icon}
          href={href}
          actionLabel={actionLabel}
          action={action}
          size="sm"
          className="mb-3"
        />
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A label/value row — the workhorse of every detail page. */
export function DataRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 border-b border-[#161f30] py-2 last:border-0",
        className,
      )}
    >
      <dt className="m-0 text-[11.5px] text-muted">{label}</dt>
      <dd className="m-0 text-right text-[12.5px] font-bold text-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/** A tinted inset block used for contracts, policies and audit entries. */
export function Inset({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-inset-surface rounded-[16px] border border-[#1c2638] p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
