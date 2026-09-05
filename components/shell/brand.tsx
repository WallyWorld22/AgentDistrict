"use client";

import { useId } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  // The shell renders the mark twice (sidebar + mobile top bar), so the
  // gradient needs a per-instance id — a duplicate id inside a display:none
  // subtree paints as a flat dark square.
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 256 256"
      className={cn("size-9 shrink-0", className)}
      role="img"
      aria-label="AgentDistrict"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#4ee7ff" />
          <stop offset=".48" stopColor="#3b82ff" />
          <stop offset="1" stopColor="#9a5cff" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="68" fill="#0a0f1a" />
      <path
        d="M128 34 222 205h-48l-17-31H99l-17 31H34L128 34Zm0 73-18 34h36l-18-34Z"
        fill={`url(#${gradientId})`}
      />
      <circle
        cx="128"
        cy="128"
        r="111"
        fill="none"
        stroke="#7dbbff"
        strokeOpacity=".18"
        strokeWidth="3"
      />
    </svg>
  );
}

export function Brand({
  className,
  showTagline = true,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <Link
      href="/"
      className={cn("flex min-w-0 items-center gap-2.5", className)}
      aria-label="AgentDistrict — home"
    >
      <BrandMark />
      <span className="flex min-w-0 flex-col leading-none">
        <b className="truncate text-[17px] font-extrabold tracking-[-0.02em]">
          AgentDistrict
        </b>
        {showTagline ? (
          <small className="mt-1 truncate text-[10px] text-blue/80">
            The place for agents.
          </small>
        ) : null}
      </span>
    </Link>
  );
}
