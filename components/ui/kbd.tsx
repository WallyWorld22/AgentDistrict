import * as React from "react";
import { cn } from "@/lib/utils";

export function Kbd({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-[#2a3550]",
        "bg-[#0f1522] px-1.5 font-sans text-[10px] font-extrabold text-[#a8b4ca]",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
