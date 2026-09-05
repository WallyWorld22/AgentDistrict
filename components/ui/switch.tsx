"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name. Pass `labelledBy` instead when a visible label exists. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Policy toggle (Workplace Gateway, Command Center). Native `role="switch"`
 * button so Space/Enter work and screen readers announce on/off state.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  labelledBy,
  describedBy,
  disabled = false,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-[42px] shrink-0 cursor-pointer items-center rounded-full p-[3px]",
        "transition-colors duration-200 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[#164a38]" : "bg-[#1a2333]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "block size-[18px] rounded-full transition-transform duration-200 ease-out",
          checked ? "translate-x-[18px] bg-[#62e8ac]" : "translate-x-0 bg-[#78849a]",
        )}
      />
    </button>
  );
}
