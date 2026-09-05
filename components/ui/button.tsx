import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "ghost"
  | "outline"
  | "danger"
  | "green"
  | "subtle";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: [
    "border border-transparent bg-grad-primary text-white",
    "shadow-[var(--shadow-primary)]",
    "hover:brightness-[1.08] hover:shadow-[0_12px_34px_rgba(53,110,255,.38)]",
    "active:brightness-95 active:shadow-[0_4px_14px_rgba(53,110,255,.3)]",
  ].join(" "),
  ghost: [
    "border border-transparent bg-transparent text-[#c3cce0]",
    "hover:bg-white/6 hover:text-text active:bg-white/10",
  ].join(" "),
  outline: [
    "border border-[#2a3550] bg-[#101829] text-text",
    "hover:border-[#3d4d73] hover:bg-[#141d31] active:bg-[#0d1526]",
  ].join(" "),
  subtle: [
    "border border-transparent bg-[#141c2e] text-[#c3cce0]",
    "hover:bg-[#1a2338] hover:text-text active:bg-[#121a2a]",
  ].join(" "),
  danger: [
    "border border-[#8a3142] bg-[#2c1017] text-[#ff98a5]",
    "hover:bg-[#3a1520] hover:text-[#ffb8c2] active:bg-[#280d14]",
  ].join(" "),
  green: [
    "border border-[#1e7f5d] bg-[#0c2b21] text-[#75f4b8]",
    "hover:bg-[#10382b] hover:text-[#93ffcd] active:bg-[#0a241c]",
  ].join(" "),
};

const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 gap-1 rounded-[9px] px-2 text-[10.5px]",
  sm: "h-8 gap-1.5 rounded-[10px] px-2.5 text-[11px]",
  md: "h-10 gap-2 rounded-[13px] px-3.5 text-[13px]",
  lg: "h-12 gap-2 rounded-[15px] px-5 text-[14px]",
  icon: "size-10 shrink-0 justify-center rounded-[13px]",
  "icon-sm": "size-8 shrink-0 justify-center rounded-[10px]",
};

const BASE = [
  "relative inline-flex select-none items-center justify-center font-extrabold leading-none",
  "whitespace-nowrap transition-[transform,background-color,border-color,filter,box-shadow]",
  "duration-150 ease-out active:translate-y-px",
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0",
].join(" ");

/**
 * Class-only escape hatch so `next/link` anchors can wear a button skin
 * without nesting an <a> inside a <button>.
 */
export function buttonClasses(
  variant: ButtonVariant = "outline",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Swaps the label for a spinner and blocks interaction. */
  loading?: boolean;
  /** Announced while `loading` (default "Working…"). */
  loadingLabel?: string;
  /** Stretches to the container width — common in sheets and forms. */
  fullWidth?: boolean;
};

function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "animate-spin-slow inline-block size-3.5 rounded-full border-2",
        "border-current border-t-transparent opacity-90",
        className,
      )}
    />
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "outline",
      size = "md",
      className,
      type = "button",
      loading = false,
      loadingLabel = "Working…",
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled ?? loading}
        aria-busy={loading || undefined}
        data-loading={loading ? "true" : undefined}
        className={buttonClasses(variant, size, cn(fullWidth && "w-full", className))}
        {...props}
      >
        {loading ? (
          <>
            <Spinner />
            <span className="sr-only">{loadingLabel}</span>
            <span aria-hidden="true" className="contents">
              {children}
            </span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
