import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "ghost" | "outline" | "danger" | "green";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-grad-primary text-white shadow-[var(--shadow-primary)] hover:brightness-110",
  ghost:
    "border border-transparent bg-transparent text-[#c3cce0] hover:bg-white/5 hover:text-text",
  outline:
    "border border-[#2a3550] bg-[#101829] text-text hover:border-[#3d4d73] hover:bg-[#141d31]",
  danger: "border border-[#8a3142] bg-[#2c1017] text-[#ff98a5] hover:bg-[#3a1520]",
  green: "border border-[#1e7f5d] bg-[#0c2b21] text-[#75f4b8] hover:bg-[#10382b]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-[10px] px-2.5 text-[11px]",
  md: "h-10 gap-2 rounded-[13px] px-3.5 text-[13px]",
  lg: "h-12 gap-2 rounded-[15px] px-5 text-[14px]",
  icon: "h-10 w-10 shrink-0 justify-center rounded-[13px]",
};

export function buttonClasses(
  variant: ButtonVariant = "outline",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    "inline-flex select-none items-center justify-center font-extrabold leading-none",
    "transition-[transform,background-color,border-color,filter] duration-150",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  );
}
