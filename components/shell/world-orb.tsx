"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export type WorldOrbProps = {
  className?: string;
  /** Softer, cheaper version for dense rows (no glow filter). */
  flat?: boolean;
};

/**
 * The @World concierge mark — the friendly bot head from
 * docs/reference/desktop-home.png (sidebar card and bottom bar).
 */
export function WorldOrb({ className, flat = false }: WorldOrbProps) {
  const shellId = useId();

  return (
    <span
      className={cn(
        "relative grid size-10 shrink-0 place-items-center rounded-full",
        className,
      )}
      aria-hidden="true"
    >
      {!flat ? (
        <span
          className="absolute inset-0 rounded-full opacity-80 blur-[6px]"
          style={{
            background:
              "radial-gradient(circle at 50% 45%, rgba(120,200,255,.85), rgba(60,120,255,.35) 55%, transparent 72%)",
          }}
        />
      ) : null}
      <svg viewBox="0 0 64 64" className="relative size-full">
        <defs>
          <linearGradient id={shellId} x1="0" y1="0" x2="0.4" y2="1">
            <stop stopColor="#ffffff" />
            <stop offset=".55" stopColor="#cfe4ff" />
            <stop offset="1" stopColor="#7aa8e8" />
          </linearGradient>
        </defs>
        {/* antenna */}
        <line
          x1="32"
          y1="6"
          x2="32"
          y2="14"
          stroke="#9fd4ff"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="32" cy="5" r="3.1" fill="#8fe8ff" />
        {/* head */}
        <rect
          x="9"
          y="14"
          width="46"
          height="38"
          rx="17"
          fill={`url(#${shellId})`}
        />
        {/* visor */}
        <rect x="15" y="20" width="34" height="25" rx="12.5" fill="#080d18" />
        <circle cx="25" cy="31.5" r="4.1" fill="#49d8ff" />
        <circle cx="39" cy="31.5" r="4.1" fill="#49d8ff" />
        <path
          d="M26.5 38.5c1.8 1.7 3.6 2.5 5.5 2.5s3.7-.8 5.5-2.5"
          fill="none"
          stroke="#49d8ff"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
