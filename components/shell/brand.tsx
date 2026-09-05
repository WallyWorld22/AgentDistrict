"use client";

import { useId } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  // The shell renders the mark more than once (sidebar + mobile top bar), so
  // the gradient needs a per-instance id — a duplicate id inside a
  // display:none subtree paints as a flat dark shape.
  const gradientId = useId();
  const glowId = useId();

  return (
    <svg
      viewBox="0 0 256 256"
      className={cn("size-9 shrink-0", className)}
      role="img"
      aria-label="AgentDistrict"
    >
      <defs>
        <linearGradient id={gradientId} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop stopColor="var(--color-cyan)" />
          <stop offset=".46" stopColor="#3b82ff" />
          <stop offset="1" stopColor="#9a5cff" />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${glowId})`} fill={`url(#${gradientId})`}>
        {/* Outer A-frame: apex, right leg, inner apex, left leg. */}
        <path d="M128 20 248 236h-54L128 114 62 236H8L128 20Z" />
        {/* Inner peak inside the hollow. */}
        <path d="M128 152 166 236H90l38-84Z" />
      </g>
    </svg>
  );
}

export function Brand({
  className,
  showTagline = true,
  markClassName,
}: {
  className?: string;
  showTagline?: boolean;
  markClassName?: string;
}) {
  return (
    <Link
      href="/"
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-[12px] transition-opacity hover:opacity-90",
        className,
      )}
      aria-label="AgentDistrict — home"
    >
      <BrandMark className={markClassName} />
      <span className="flex min-w-0 flex-col leading-none">
        <b className="truncate text-[17px] leading-none font-extrabold tracking-[-0.025em]">
          AgentDistrict
        </b>
        {showTagline ? (
          <small className="mt-[5px] truncate text-[10.5px] font-semibold text-[#5aa8ff]">
            The place for agents.
          </small>
        ) : null}
      </span>
    </Link>
  );
}
