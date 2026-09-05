import * as React from "react";
import type { AgentCategory } from "@/lib/data/types";
import { cn } from "@/lib/utils";

/**
 * Cover art for a gig thumbnail, drawn per category so the Featured Gigs row
 * reads like a marketplace with real listing photos rather than three copies
 * of the same gradient (`docs/reference/desktop-home.png`).
 *
 * Everything is CSS + inline SVG: no image assets, no network requests, and
 * nothing random — the same gig always draws the same picture.
 */

type Scene = {
  /** Backdrop for the plate. */
  background: string;
  /** Foreground motif. */
  art: (id: string) => React.ReactNode;
};

const FIELD = (
  <>
    <rect x="0" y="58" width="160" height="42" fill="#1c3c22" />
    <path d="M0 58 Q40 50 80 58 T160 56 L160 100 L0 100 Z" fill="#25502c" />
  </>
);

const SCENES: Partial<Record<AgentCategory, Scene>> = {
  research: {
    background: "linear-gradient(165deg,#123049,#1f5f7a 55%,#0a1c2b)",
    art: (id) => (
      <>
        {FIELD}
        <g stroke="#8fe3ff" strokeOpacity="0.45" strokeWidth="0.7">
          <path d="M0 30 H160 M0 44 H160 M40 0 V100 M120 0 V100" />
        </g>
        {[
          [34, 30],
          [66, 20],
          [104, 36],
          [126, 24],
          [82, 50],
        ].map(([x, y]) => (
          <g key={`${id}-${x}`} transform={`translate(${x} ${y})`}>
            <path
              d="M0 0 C -6 -8 -6 -14 0 -14 C 6 -14 6 -8 0 0 Z"
              fill="#4ee7ff"
              opacity="0.9"
            />
            <circle cx="0" cy="-9" r="2.2" fill="#0a1c2b" />
          </g>
        ))}
        <circle
          cx="96"
          cy="30"
          r="18"
          fill="none"
          stroke="#e8f6ff"
          strokeWidth="2.5"
          opacity="0.75"
        />
        <path
          d="M109 43 L122 56"
          stroke="#e8f6ff"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.75"
        />
      </>
    ),
  },
  development: {
    background: "linear-gradient(165deg,#241455,#5a3ad0 52%,#120a2c)",
    art: () => (
      <>
        <rect
          x="18"
          y="22"
          width="124"
          height="58"
          rx="7"
          fill="#0d1230"
          stroke="#6b58d8"
          strokeWidth="1.4"
        />
        <rect x="18" y="22" width="124" height="11" rx="7" fill="#221a55" />
        <circle cx="27" cy="27.5" r="2" fill="#ff6b81" />
        <circle cx="35" cy="27.5" r="2" fill="#ffd66b" />
        <circle cx="43" cy="27.5" r="2" fill="#46e39a" />
        {[
          [0, 62, "#8fd0ff"],
          [1, 42, "#c9a6ff"],
          [2, 74, "#6ee7c8"],
          [3, 34, "#8fd0ff"],
          [4, 56, "#ffd66b"],
        ].map(([row, width, fill]) => (
          <rect
            key={String(row)}
            x="27"
            y={40 + Number(row) * 8}
            width={Number(width)}
            height="4"
            rx="2"
            fill={String(fill)}
            opacity="0.85"
          />
        ))}
      </>
    ),
  },
  marketing: {
    background: "linear-gradient(165deg,#4a1440,#e0568f 52%,#2a0a24)",
    art: () => (
      <>
        <g opacity="0.9">
          {[
            [30, 34],
            [52, 48],
            [74, 26],
            [96, 58],
            [118, 40],
          ].map(([x, h]) => (
            <rect
              key={x}
              x={x}
              y={84 - h}
              width="14"
              height={h}
              rx="3"
              fill="#ffe1f1"
              opacity="0.85"
            />
          ))}
        </g>
        <path
          d="M28 56 L52 44 L76 62 L100 28 L126 40"
          fill="none"
          stroke="#ffd66b"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="100" cy="28" r="4.5" fill="#ffd66b" />
      </>
    ),
  },
  data: {
    background: "linear-gradient(165deg,#0f3a42,#2fa89a 52%,#07222a)",
    art: () => (
      <>
        <g stroke="#bff6ea" strokeOpacity="0.5" strokeWidth="1">
          <path d="M30 70 L58 44 L84 58 L112 30 L134 46" fill="none" />
        </g>
        {[
          [30, 70],
          [58, 44],
          [84, 58],
          [112, 30],
          [134, 46],
        ].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="5" fill="#e8fffa" opacity="0.9" />
        ))}
        <g opacity="0.35" fill="#e8fffa">
          {Array.from({ length: 5 }, (_, row) =>
            Array.from({ length: 8 }, (_, col) => (
              <rect
                key={`${row}-${col}`}
                x={22 + col * 15}
                y={80 + row * 4}
                width="10"
                height="2"
                rx="1"
              />
            )),
          )}
        </g>
      </>
    ),
  },
  home_services: {
    background: "linear-gradient(165deg,#123b2c,#1d6b4a 52%,#08211a)",
    art: () => (
      <>
        {FIELD}
        <path d="M46 56 L80 30 L114 56 L114 84 L46 84 Z" fill="#26303f" />
        <path d="M40 58 L80 26 L120 58 L114 58 L80 34 L46 58 Z" fill="#3d4a5e" />
        <g stroke="#4ee7ff" strokeWidth="1.4" fill="none" opacity="0.9">
          <path d="M46 56 L80 30 L114 56" />
          <path d="M80 30 L80 84" />
        </g>
        <rect x="70" y="64" width="20" height="20" rx="2" fill="#0f1a26" />
      </>
    ),
  },
  creative: {
    background: "linear-gradient(165deg,#3d1450,#b25ad0 52%,#1d0a28)",
    art: () => (
      <>
        <circle cx="80" cy="48" r="26" fill="#ffe6ff" opacity="0.14" />
        <path
          d="M40 74 Q60 30 80 60 T120 40"
          fill="none"
          stroke="#ffd6ff"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {[
          [56, 34, "#4ee7ff"],
          [96, 66, "#ffd66b"],
          [110, 30, "#ff9ce8"],
        ].map(([x, y, fill]) => (
          <circle key={String(x)} cx={Number(x)} cy={Number(y)} r="5" fill={String(fill)} />
        ))}
      </>
    ),
  },
};

const DEFAULT_SCENE: Scene = {
  background: "linear-gradient(165deg,#1d2a63,#4a5cd0 52%,#111739)",
  art: () => (
    <>
      <circle cx="80" cy="50" r="30" fill="none" stroke="#9fb8ff" strokeWidth="1.6" opacity="0.5" />
      <circle cx="80" cy="50" r="18" fill="none" stroke="#9fb8ff" strokeWidth="1.6" opacity="0.7" />
      <circle cx="80" cy="50" r="6" fill="#cfe0ff" />
    </>
  ),
};

export type GigThumbProps = {
  category: AgentCategory;
  /** The agent's emoji identity, shown as a small badge on the plate. */
  emoji: string;
  /** Unique per instance so the SVG keys never collide. */
  id: string;
  className?: string;
};

export function GigThumb({ category, emoji, id, className }: GigThumbProps) {
  const scene = SCENES[category] ?? DEFAULT_SCENE;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block overflow-hidden rounded-[13px] border border-[#26344e]",
        className,
      )}
      style={{ backgroundImage: scene.background }}
    >
      <svg
        viewBox="0 0 160 100"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        {scene.art(id)}
      </svg>
      <span className="absolute inset-0 bg-gradient-to-t from-[#080d17]/72 via-transparent to-transparent" />
      <span className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-[9px] border border-[#31566e] bg-[#0b1120]/85 text-[14px] leading-none">
        {emoji}
      </span>
    </span>
  );
}
