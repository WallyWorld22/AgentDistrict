import * as React from "react";
import { cn } from "@/lib/utils";

export type HeroStat = {
  /** Already-formatted value, e.g. "12,482". */
  value: React.ReactNode;
  label: React.ReactNode;
  /** Small glyph or emoji; a coloured dot is used when omitted. */
  icon?: React.ReactNode;
  tone?: "green" | "purple" | "blue" | "red" | "cyan" | "yellow";
};

export type HeroBannerProps = {
  /** The big wordmark. Split at the first capital run for the two-tone fill. */
  title?: string;
  tagline?: string;
  stats?: HeroStat[];
  /** Three short lines rendered on the right, like the reference billboard. */
  kicker?: string[];
  /** Copy inside the neon billboard. */
  billboard?: string[];
  /** Heading level for the wordmark. Use "p" when the page owns its own h1. */
  titleAs?: "h1" | "h2" | "p";
  className?: string;
  children?: React.ReactNode;
};

const DOT_TONES = {
  green: "bg-green shadow-[0_0_12px_var(--color-green)]",
  purple: "bg-purple shadow-[0_0_12px_var(--color-purple)]",
  blue: "bg-blue shadow-[0_0_12px_var(--color-blue)]",
  red: "bg-red shadow-[0_0_12px_var(--color-red)]",
  cyan: "bg-cyan shadow-[0_0_12px_var(--color-cyan)]",
  yellow: "bg-yellow shadow-[0_0_12px_var(--color-yellow)]",
} as const;

type Tower = {
  x: number;
  w: number;
  h: number;
  seed: number;
  /** Antenna height on top of the tower, in viewBox units. */
  spire?: number;
};

const GROUND = 200;
/** Window pitch in viewBox units — small enough to read as a real facade. */
const PITCH_X = 5.5;
const PITCH_Y = 6.5;
const WIN_W = 2.6;
const WIN_H = 3.4;

/** Back → front skyline layers, hand-placed so the silhouette reads as a city. */
const FAR: Tower[] = [
  { x: 14, w: 30, h: 63, seed: 1 },
  { x: 48, w: 22, h: 92, seed: 2, spire: 12 },
  { x: 74, w: 36, h: 75, seed: 3 },
  { x: 114, w: 26, h: 108, seed: 4, spire: 16 },
  { x: 144, w: 40, h: 84, seed: 5 },
  { x: 188, w: 24, h: 102, seed: 6 },
  { x: 216, w: 34, h: 69, seed: 7 },
  { x: 254, w: 28, h: 96, seed: 8, spire: 10 },
  { x: 286, w: 38, h: 79, seed: 9 },
  { x: 328, w: 22, h: 107, seed: 10 },
  { x: 354, w: 32, h: 66, seed: 11 },
  { x: 390, w: 26, h: 99, seed: 12, spire: 13 },
  { x: 420, w: 36, h: 76, seed: 13 },
  { x: 460, w: 30, h: 91, seed: 14 },
];

const NEAR: Tower[] = [
  { x: -6, w: 44, h: 50, seed: 21 },
  { x: 42, w: 32, h: 72, seed: 22 },
  { x: 96, w: 48, h: 58, seed: 23 },
  { x: 168, w: 36, h: 82, seed: 24 },
  { x: 228, w: 54, h: 53, seed: 25 },
  { x: 306, w: 34, h: 75, seed: 26 },
  { x: 358, w: 50, h: 60, seed: 27 },
  { x: 424, w: 30, h: 79, seed: 28 },
  { x: 470, w: 42, h: 55, seed: 29 },
];

/** Deterministic lit/unlit window grid — no randomness, stable across renders. */
function Windows({ tower, fill }: { tower: Tower; fill: string }) {
  const cols = Math.max(1, Math.floor((tower.w - 4) / PITCH_X));
  const rows = Math.max(1, Math.floor((tower.h - 8) / PITCH_Y));
  const left = tower.x + (tower.w - (cols - 1) * PITCH_X - WIN_W) / 2;
  const top = GROUND - tower.h + 5;

  const cells: React.ReactElement[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      // Pseudo-random but pure: ~62% of windows are lit.
      if ((r * 7 + c * 13 + tower.seed * 5) % 8 < 3) continue;
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={left + c * PITCH_X}
          y={top + r * PITCH_Y}
          width={WIN_W}
          height={WIN_H}
          fill={fill}
        />,
      );
    }
  }
  return <g opacity="0.85">{cells}</g>;
}

function Skyline({
  towers,
  fill,
  glass,
}: {
  towers: Tower[];
  fill: string;
  glass: string;
}) {
  return (
    <g>
      {towers.map((t) => (
        <g key={`${t.x}-${t.seed}`}>
          {t.spire ? (
            <rect
              x={t.x + t.w / 2 - 0.6}
              y={GROUND - t.h - t.spire}
              width={1.2}
              height={t.spire}
              fill={fill}
            />
          ) : null}
          <rect x={t.x} y={GROUND - t.h} width={t.w} height={t.h} fill={fill} />
          <Windows tower={t} fill={glass} />
        </g>
      ))}
    </g>
  );
}

/**
 * The Home hero (docs/reference/desktop-home.png): a dusk city skyline drawn
 * from layered gradients + an inline SVG silhouette, the AGENTDISTRICT
 * wordmark with its cyan glow, the tagline and a live stat row.
 *
 * Pure presentation — pass already-formatted numbers in `stats`.
 */
export function HeroBanner({
  title = "AGENTDISTRICT",
  tagline = "The place for agents.",
  stats = [],
  kicker = ["Humans.", "Agents.", "A more capable world."],
  billboard = ["A brighter", "tomorrow", "built by", "agents"],
  titleAs: Title = "h1",
  className,
  children,
}: HeroBannerProps) {
  // "AGENTDISTRICT" → "AGENT" + "DISTRICT" for the two-tone fill.
  const split = title.length > 6 ? Math.ceil(title.length / 2.4) : title.length;
  const head = title.slice(0, split);
  const tail = title.slice(split);

  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-[26px] border border-[#253252]",
        "shadow-[var(--shadow-float)]",
        className,
      )}
    >
      {/* Dusk sky */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-30"
        style={{
          background:
            "linear-gradient(180deg,#0a0f26 0%,#1c2052 26%,#402a5e 46%,#7c3a4d 62%,#b0602f 78%,#4a2f2a 100%)",
        }}
      />
      {/* City glow on the horizon */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-20 h-3/4"
        style={{
          background:
            "radial-gradient(130% 120% at 74% 96%, rgba(255,164,86,.5) 0%, rgba(140,70,180,.32) 40%, transparent 74%)",
        }}
      />
      {/* A few stars, deterministic positions */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-20 h-1/2">
        {[
          { l: "44%", t: "18%" },
          { l: "58%", t: "34%" },
          { l: "67%", t: "12%" },
          { l: "79%", t: "28%" },
          { l: "91%", t: "16%" },
        ].map((star) => (
          <span
            key={star.l}
            className="animate-twinkle absolute size-[2px] rounded-full bg-white/80"
            style={{ left: star.l, top: star.t }}
          />
        ))}
      </div>

      {/* Skyline */}
      <svg
        aria-hidden="true"
        viewBox="0 84 500 116"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-y-0 right-0 -z-10 h-full w-[66%] min-w-[340px] opacity-95"
      >
        <defs>
          <linearGradient id="ad-hero-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2b3566" />
            <stop offset="1" stopColor="#141a35" />
          </linearGradient>
          <linearGradient id="ad-hero-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#141b31" />
            <stop offset="1" stopColor="#070b16" />
          </linearGradient>
          <linearGradient id="ad-hero-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#080b16" stopOpacity="1" />
            <stop offset="0.42" stopColor="#080b16" stopOpacity="0.35" />
            <stop offset="1" stopColor="#080b16" stopOpacity="0" />
          </linearGradient>
        </defs>
        <Skyline towers={FAR} fill="url(#ad-hero-far)" glass="#7fb4ff" />
        <Skyline towers={NEAR} fill="url(#ad-hero-near)" glass="#ffcf8a" />
        <rect x="0" y="80" width="500" height="120" fill="url(#ad-hero-fade)" />
      </svg>

      {/* Left-hand scrim so the wordmark always has contrast */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(90deg,#070b14 0%,rgba(7,11,20,.93) 26%,rgba(7,11,20,.5) 44%,rgba(7,11,20,0) 64%)",
        }}
      />

      <div className="relative flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <Title className="wordmark-glow m-0 text-[34px] leading-[0.92] font-black tracking-[-0.045em] sm:text-[46px] lg:text-[52px]">
            <span className="text-white">{head}</span>
            <span className="text-[#96cbff]">{tail}</span>
          </Title>
          <p className="m-0 mt-1.5 text-[15px] font-semibold text-[#dbe4f5] italic sm:text-[17px]">
            {tagline}
          </p>

          {stats.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 sm:gap-x-8">
              {stats.map((stat, index) => (
                <div key={index} className="flex items-center gap-2">
                  {stat.icon ? (
                    <span className="text-[16px] leading-none" aria-hidden="true">
                      {stat.icon}
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        DOT_TONES[stat.tone ?? "green"],
                      )}
                    />
                  )}
                  <div className="leading-tight">
                    <b className="block text-[17px] font-extrabold tabular-nums sm:text-[19px]">
                      {stat.value}
                    </b>
                    <small className="block text-[11px] text-[#a8b4ca]">
                      {stat.label}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {children}
        </div>

        <div className="hidden shrink-0 items-center gap-4 lg:flex">
          {billboard.length > 0 ? (
            <div
              className="w-[104px] rounded-[10px] border border-[#3d5da8] bg-[#101a4d]/85 px-2.5 py-3 text-center shadow-[0_0_28px_rgba(70,120,255,.45)]"
              aria-hidden="true"
            >
              <span className="text-gradient block text-[22px] leading-none font-black">
                A
              </span>
              <span className="mt-2 block text-[10px] leading-[1.35] font-extrabold tracking-[0.06em] text-[#bcd4ff] uppercase">
                {billboard.join(" ")}
              </span>
            </div>
          ) : null}
          {kicker.length > 0 ? (
            <ul className="m-0 grid list-none gap-1 p-0 text-[13px] font-semibold text-[#e6ecfb] [text-shadow:0_2px_10px_rgba(4,7,16,.95)]">
              {kicker.map((line) => (
                <li key={line} className="whitespace-nowrap">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
