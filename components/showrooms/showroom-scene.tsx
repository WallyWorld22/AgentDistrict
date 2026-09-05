import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/ui/pill";
import { LoungeStyles } from "@/components/lounge/lounge-styles";

export type ShowroomSceneKind = "parcel" | "grid" | "page" | "copy";

export type ShowroomSceneProps = {
  kind: ShowroomSceneKind;
  gradient: string;
  glyph: string;
  /** `true` while a run is in progress — the scan line runs either way. */
  running?: boolean;
  label?: string;
  className?: string;
};

/**
 * The screen an agent's work happens on.
 *
 * A stylised plate — an aerial parcel, a result grid, a page wireframe, a copy
 * draft — with the scan line sweeping across it (`animate-scan`, frozen for
 * `prefers-reduced-motion: reduce` by the global block). Everything is drawn
 * with flat SVG shapes, so the same scene can render many times on a page
 * without gradient-id collisions.
 */
export function ShowroomScene({
  kind,
  gradient,
  glyph,
  running = false,
  label = "LIVE DEMO",
  className,
}: ShowroomSceneProps) {
  return (
    <div
      data-testid="showroom-scene"
      className={cn(
        "relative grid min-h-[168px] place-items-center overflow-hidden rounded-[16px] border border-[#2a3a55]",
        className,
      )}
      style={{ backgroundImage: gradient }}
    >
      <LoungeStyles />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_-10%,rgba(255,255,255,.1),rgba(4,7,13,.68))]"
      />

      <span className="relative block w-full px-4 py-3" aria-hidden="true">
        {kind === "parcel" ? <ParcelPlate /> : null}
        {kind === "grid" ? <GridPlate /> : null}
        {kind === "page" ? <PagePlate /> : null}
        {kind === "copy" ? <CopyPlate /> : null}
      </span>

      <span
        aria-hidden="true"
        className="absolute top-3 left-3 text-[22px] drop-shadow-[0_8px_18px_rgba(0,0,0,.6)]"
      >
        {glyph}
      </span>

      <span
        aria-hidden="true"
        className="animate-scan absolute inset-x-0 h-px bg-[linear-gradient(90deg,transparent,#7ef0c4,transparent)] shadow-[0_0_14px_var(--color-green)]"
      />

      <Pill
        variant={running ? "live" : "green"}
        size="sm"
        className="absolute top-2 right-2"
      >
        {running ? "RUNNING" : label}
      </Pill>
    </div>
  );
}

/* --------------------------------------------------------------- the plates */

function ParcelPlate() {
  return (
    <svg viewBox="0 0 220 108" className="h-[104px] w-full" role="presentation">
      {/* lot */}
      <rect
        x="10"
        y="8"
        width="200"
        height="92"
        rx="4"
        fill="#0d2a1f"
        stroke="#3ba97c"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      {/* lawn texture */}
      {[22, 38, 54, 70, 86].map((y) => (
        <line key={y} x1="14" y1={y} x2="206" y2={y} stroke="#134532" strokeWidth="1" />
      ))}
      {/* driveway */}
      <path d="M150 100 L164 100 L170 52 L158 52 Z" fill="#1d2b3c" />
      {/* house footprint */}
      <path
        d="M46 74 L46 42 L92 26 L138 42 L138 74 Z"
        fill="#16324a"
        stroke="#7ef0c4"
        strokeWidth="1.4"
      />
      {/* roof planes */}
      <path d="M46 42 L92 26 L92 58 Z" fill="#1f4a6b" />
      <path d="M92 26 L138 42 L92 58 Z" fill="#173a55" />
      <line x1="92" y1="26" x2="92" y2="58" stroke="#7ef0c4" strokeWidth="1" />
      {/* measurement callout */}
      <line x1="46" y1="84" x2="138" y2="84" stroke="#ffd66b" strokeWidth="1" />
      <line x1="46" y1="80" x2="46" y2="88" stroke="#ffd66b" strokeWidth="1" />
      <line x1="138" y1="80" x2="138" y2="88" stroke="#ffd66b" strokeWidth="1" />
      <text x="78" y="95" fill="#ffd66b" fontSize="7" fontWeight="700">
        roof span
      </text>
      {/* trees */}
      <circle cx="26" cy="26" r="7" fill="#1a5b3f" />
      <circle cx="196" cy="86" r="8" fill="#1a5b3f" />
    </svg>
  );
}

function GridPlate() {
  const rows = [92, 74, 86, 61, 80, 68];
  return (
    <span className="grid gap-1.5">
      <span className="flex gap-1.5">
        {["name", "email", "phone", "score"].map((head) => (
          <span
            key={head}
            className="flex-1 rounded-[4px] bg-[#0b1f3a] px-1 py-0.5 text-[7px] font-extrabold tracking-[0.1em] text-[#8ceaff] uppercase"
          >
            {head}
          </span>
        ))}
      </span>
      {rows.map((width, index) => (
        <span key={index} className="flex items-center gap-1.5">
          <span className="h-2 flex-1 rounded-[3px] bg-[#12274a]" />
          <span className="h-2 flex-1 rounded-[3px] bg-[#12274a]" />
          <span className="h-2 flex-1 rounded-[3px] bg-[#12274a]" />
          <span
            className="h-2 rounded-[3px] bg-[#1c6f4e]"
            style={{ width: `${width / 4}%` }}
          />
        </span>
      ))}
    </span>
  );
}

function PagePlate() {
  return (
    <span className="grid gap-1.5 rounded-[8px] border border-white/12 bg-[#120b2a]/70 p-2">
      <span className="flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-[#ff5b6f]" />
        <span className="size-1.5 rounded-full bg-[#ffd66b]" />
        <span className="size-1.5 rounded-full bg-[#46e39a]" />
      </span>
      <span className="block h-6 rounded-[5px] bg-[linear-gradient(90deg,#6a3fd0,#2a1b5e)]" />
      <span className="flex gap-1.5">
        {[0, 1, 2].map((index) => (
          <span key={index} className="h-8 flex-1 rounded-[5px] bg-[#2a1b5e]" />
        ))}
      </span>
      <span className="block h-2 w-2/3 rounded-[3px] bg-[#3d2a78]" />
      <span className="block h-4 w-24 rounded-[5px] bg-[#8e5cff]" />
    </span>
  );
}

function CopyPlate() {
  const lines = [96, 78, 88, 62, 84, 46];
  return (
    <span className="grid gap-1.5">
      <span className="block h-3.5 w-3/4 rounded-[4px] bg-[#f0a6ff]" />
      <span className="block h-2 w-1/2 rounded-[3px] bg-[#8a4fa8]" />
      {lines.map((width, index) => (
        <span
          key={index}
          className="ad-reveal block h-1.5 rounded-[3px] bg-[#5a2f70]"
          style={{ width: `${width}%`, "--reveal-delay": `${index * 0.12}s` } as CSSProperties}
        />
      ))}
    </span>
  );
}
