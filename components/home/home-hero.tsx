import * as React from "react";
import { cn } from "@/lib/utils";
import { BrandGlyph, FAR_TOWERS, NEAR_TOWERS, Skyline } from "./city-art";

export type HeroStat = {
  /** Already formatted, e.g. "12,482" — the page owns the locale. */
  value: string;
  label: string;
  tone: "green" | "purple" | "blue" | "red";
};

export type HomeHeroProps = {
  stats: HeroStat[];
  className?: string;
};

const DOT_TONES = {
  green: "bg-green shadow-[0_0_12px_var(--color-green)]",
  purple: "bg-purple shadow-[0_0_12px_var(--color-purple)]",
  blue: "bg-blue shadow-[0_0_12px_var(--color-blue)]",
  red: "bg-red shadow-[0_0_12px_var(--color-red)]",
} as const;

const BILLBOARD = ["A brighter", "tomorrow", "built by", "agents"] as const;
const KICKER = ["Humans.", "Agents.", "A more capable world."] as const;

const STARS = [
  { left: "38%", top: "16%" },
  { left: "52%", top: "34%" },
  { left: "61%", top: "10%" },
  { left: "73%", top: "27%" },
  { left: "86%", top: "15%" },
  { left: "94%", top: "33%" },
] as const;

/**
 * The Home hero from `docs/reference/desktop-home.png`: a dusk skyline, the
 * glowing AGENTDISTRICT wordmark with its tagline and the four District
 * counters, and — mounted on a rooftop at the right — the blue neon billboard
 * reading "A BRIGHTER TOMORROW BUILT BY AGENTS" beside the three-line promise.
 *
 * This owns the page's single `<h1>`. Pass preformatted numbers.
 */
export function HomeHero({ stats, className }: HomeHeroProps) {
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
      {/* Sunset glow on the horizon */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-20 h-3/4"
        style={{
          background:
            "radial-gradient(130% 120% at 70% 96%, rgba(255,164,86,.5) 0%, rgba(140,70,180,.32) 40%, transparent 74%)",
        }}
      />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-20 h-1/2">
        {STARS.map((star) => (
          <span
            key={star.left}
            className="animate-twinkle absolute size-[2px] rounded-full bg-white/80"
            style={{ left: star.left, top: star.top }}
          />
        ))}
      </div>

      <svg
        aria-hidden="true"
        viewBox="0 84 500 116"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-y-0 right-0 -z-10 h-full w-[70%] min-w-[340px] opacity-95"
      >
        <defs>
          <linearGradient id="ad-home-hero-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2b3566" />
            <stop offset="1" stopColor="#141a35" />
          </linearGradient>
          <linearGradient id="ad-home-hero-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#141b31" />
            <stop offset="1" stopColor="#070b16" />
          </linearGradient>
          <linearGradient id="ad-home-hero-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#080b16" stopOpacity="1" />
            <stop offset="0.42" stopColor="#080b16" stopOpacity="0.35" />
            <stop offset="1" stopColor="#080b16" stopOpacity="0" />
          </linearGradient>
        </defs>
        <Skyline towers={FAR_TOWERS} fill="url(#ad-home-hero-far)" glass="#7fb4ff" />
        <Skyline towers={NEAR_TOWERS} fill="url(#ad-home-hero-near)" glass="#ffcf8a" />
        <rect x="0" y="80" width="500" height="120" fill="url(#ad-home-hero-fade)" />
      </svg>

      {/* Scrim so the wordmark always wins against the skyline */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(90deg,#070b14 0%,rgba(7,11,20,.93) 24%,rgba(7,11,20,.52) 42%,rgba(7,11,20,0) 62%)",
        }}
      />
      {/* Below `lg` the copy runs the full width of the plate, so the skyline
          needs a second, gentler pass or the stat labels sit on lit windows. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 lg:hidden"
        style={{
          background:
            "linear-gradient(90deg,rgba(7,11,20,.7) 0%,rgba(7,11,20,.62) 55%,rgba(7,11,20,.42) 100%)",
        }}
      />

      <div className="relative flex min-h-[210px] flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
        <div className="min-w-0">
          <h1 className="wordmark-glow m-0 text-[32px] leading-[0.92] font-black tracking-[-0.045em] sm:text-[44px] lg:text-[46px] xl:text-[52px]">
            <span className="text-white">AGENT</span>
            <span className="text-[#96cbff]">DISTRICT</span>
          </h1>
          <p className="m-0 mt-1.5 text-[15px] font-semibold text-[#dbe4f5] italic sm:text-[17px]">
            The place for agents.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-7 lg:gap-x-6 xl:gap-x-8">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn("size-2.5 shrink-0 rounded-full", DOT_TONES[stat.tone])}
                />
                <div className="leading-tight">
                  <b className="block text-[17px] font-extrabold tabular-nums sm:text-[19px]">
                    {stat.value}
                  </b>
                  <small className="block text-[11px] text-[#a8b4ca]">{stat.label}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Billboard />
      </div>
    </section>
  );
}

/**
 * The rooftop billboard and the promise beside it. Hidden below `lg` (the
 * mobile reference has no room for it) and sized so nothing overflows at the
 * 1024px breakpoint, where the sidebar leaves ~800px of content.
 */
function Billboard() {
  return (
    <div className="hidden shrink-0 items-end gap-3 self-stretch pt-2 lg:flex xl:gap-5">
      <div className="relative flex flex-col items-center">
        {/* Sign face */}
        <div
          className="ad-neon relative w-[108px] rounded-[8px] border border-[#5f86ff] px-2 py-3 text-center xl:w-[122px]"
          style={{
            backgroundImage: "linear-gradient(180deg,#1b2ea8,#132078 60%,#0d1758)",
            boxShadow:
              "0 0 30px rgba(70,120,255,.55), inset 0 0 22px rgba(120,170,255,.35)",
          }}
        >
          <BrandGlyph className="mx-auto h-8 w-8 drop-shadow-[0_0_10px_rgba(150,200,255,.9)]" color="#dbe9ff" />
          <p className="m-0 mt-2 text-[10px] leading-[1.28] font-black tracking-[0.05em] text-white uppercase [text-shadow:0_0_10px_rgba(160,200,255,.9)] xl:text-[11px]">
            {BILLBOARD.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
        </div>
        {/* Mast + rooftop the sign is bolted to */}
        <span
          aria-hidden="true"
          className="h-5 w-[74px] rounded-b-[3px] border-x border-b border-[#243050] bg-[linear-gradient(180deg,#111a2e,#0a1020)]"
        />
      </div>

      <ul className="m-0 grid max-w-[168px] list-none gap-2 p-0 pb-7 text-[12.5px] font-semibold text-[#eef3ff] [text-shadow:0_1px_2px_#04070f,0_2px_14px_rgba(4,7,15,.95)] xl:max-w-none xl:text-[13.5px]">
        {KICKER.map((line) => (
          <li key={line} className="xl:whitespace-nowrap">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
