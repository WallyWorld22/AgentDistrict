import * as React from "react";
import { cn } from "@/lib/utils";

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Adds a hover lift + border highlight. Use for clickable cards. */
  interactive?: boolean;
  /** Turn off the default 15px padding when the card owns its own layout. */
  flush?: boolean;
  /** Padding scale. `md` (default) is the 15px legacy card padding. */
  padding?: "sm" | "md" | "lg";
  /** `raised` adds the float shadow (hero-adjacent cards, sheets). */
  elevation?: "flat" | "card" | "raised";
};

const PADDING = { sm: "p-3", md: "p-4", lg: "p-5" } as const;
const ELEVATION = {
  flat: "",
  card: "shadow-[var(--shadow-card)]",
  raised: "shadow-[var(--shadow-float)]",
} as const;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    className,
    interactive = false,
    flush = false,
    padding = "md",
    elevation = "card",
    ...props
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "bg-card-surface rounded-card border border-line",
        ELEVATION[elevation],
        !flush && PADDING[padding],
        interactive &&
          cn(
            "transition-[transform,border-color,box-shadow] duration-200 ease-out",
            "hover:-translate-y-0.5 hover:border-[#415477] hover:shadow-[0_18px_44px_rgba(0,0,0,.28)]",
            "focus-within:border-[#415477] active:translate-y-0",
          ),
        className,
      )}
      {...props}
    />
  );
});

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardHeader({ className, ...props }, ref) {
  return (
    <div ref={ref} className={cn("flex items-start gap-3", className)} {...props} />
  );
});

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" }
>(function CardTitle({ className, as: Heading = "h3", ...props }, ref) {
  return (
    <Heading
      ref={ref}
      className={cn(
        "m-0 text-[15px] leading-tight font-extrabold tracking-[-0.01em]",
        className,
      )}
      {...props}
    />
  );
});

export const CardBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardBody({ className, ...props }, ref) {
  return (
    <div ref={ref} className={cn("text-[12px] text-muted", className)} {...props} />
  );
});

/** Horizontal rule matching the legacy `.divider`. */
export function Divider({ className }: { className?: string }) {
  return <div className={cn("my-3.5 h-px bg-[#1c2638]", className)} role="none" />;
}
