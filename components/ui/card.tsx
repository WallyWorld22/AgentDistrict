import * as React from "react";
import { cn } from "@/lib/utils";

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Adds a hover lift + border highlight. Use for clickable cards. */
  interactive?: boolean;
  /** Turn off the default 15px padding when the card owns its own layout. */
  flush?: boolean;
};

export function Card({
  className,
  interactive = false,
  flush = false,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "bg-card-surface rounded-card border border-line shadow-[var(--shadow-card)]",
        !flush && "p-4",
        interactive &&
          "cursor-pointer transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#415477]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start gap-3", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-[15px] leading-tight font-extrabold", className)}
      {...props}
    />
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-[12px] text-muted", className)} {...props} />;
}

/** Horizontal rule matching the legacy `.divider`. */
export function Divider({ className }: { className?: string }) {
  return <div className={cn("my-3.5 h-px bg-[#1c2638]", className)} role="none" />;
}
