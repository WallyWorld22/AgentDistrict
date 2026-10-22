import * as React from "react";
import Link from "next/link";
import type { Agent } from "@/lib/data/types";
import { cn, formatCents } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SHOWROOMS } from "@/lib/data/ext/lounge";

export type ShowroomDemoProps = {
  /** The live agent row, when it is in the District. */
  agent?: Agent | null;
  className?: string;
};

/**
 * The Agent Showroom card from `docs/reference/desktop-home.png`: a sample
 * readout of RoofIntel's property analysis — the aerial plate with the roof
 * outline and a sweeping scan line, the four sample fields, and "Try It Now"
 * into `/showrooms`, where the demo actually runs.
 *
 * The scan is a CSS animation (`animate-scan`), so it is frozen under
 * `prefers-reduced-motion: reduce` by the global rule in `app/globals.css`.
 */
/**
 * One catalog entry, shared with `/showrooms` so the two pages can never
 * describe the same demo differently.
 */
const DEMO = SHOWROOMS.find((entry) => entry.agentHandle === "roofintel") ?? SHOWROOMS[0];

/** The four Address / Roof Area / … rows, paired from the catalog entry. */
const READOUT = DEMO.fields.map((label, index) => ({
  label,
  value: DEMO.sample[index] ?? "—",
}));

/**
 * The price the card advertises, in cents: RoofIntel's Passport starting price
 * (`price: 47` in `lib/seed/agents.ts`), not a gig package — its cheapest
 * package is 470.
 */
const DEMO_PRICE_CENTS = 47;

export function ShowroomDemo({ agent, className }: ShowroomDemoProps) {
  const demo = DEMO;
  const name = agent?.name ?? demo.agentName;
  const emoji = agent?.avatar_emoji ?? demo.glyph;

  return (
    <div
      className={cn(
        "bg-inset-surface grid gap-3 rounded-[18px] border border-[#1c2638] p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <AgentAvatar
          emoji={emoji}
          handle={demo.agentHandle}
          gradient={agent?.avatar_gradient ?? undefined}
          name={name}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <Link
            href={`/agents/${demo.agentHandle}`}
            className="block truncate text-[13.5px] font-extrabold hover:text-blue"
          >
            {name}
          </Link>
          <small className="block truncate text-[11px] text-muted">
            {agent?.tagline ?? demo.title}
          </small>
        </div>
        <Pill
          variant="green"
          size="sm"
          className="shrink-0 shadow-[0_0_18px_rgba(70,227,154,.35)]"
        >
          ◉ DEMO
        </Pill>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,130px)_minmax(0,1fr)]">
        <AerialPlate />

        <div className="flex min-w-0 flex-col gap-2">
          <dl className="bg-card-surface m-0 grid rounded-[13px] border border-[#1c2638] px-2.5 py-1">
            {READOUT.map((row) => (
              <div
                key={row.label}
                className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-[#161f30] py-1.5 last:border-0"
              >
                <dt className="m-0 shrink-0 text-[10.5px] text-muted">{row.label}</dt>
                <dd
                  className={cn(
                    "m-0 ml-auto text-right text-[11px] font-bold text-ink tabular-nums",
                    row.label === "Storm Risk" && "text-yellow",
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <Link
            href="/showrooms"
            className={buttonClasses("primary", "sm", "mt-auto w-full")}
          >
            Try It Now
          </Link>
        </div>
      </div>

      <small className="text-[10.5px] text-muted">
        {demo.pipeline} · {demo.durationLabel} · {formatCents(DEMO_PRICE_CENTS)} · Simulated
        run
      </small>
    </div>
  );
}

/** Aerial parcel plate: roof polygons traced in cyan under a sweeping scan. */
function AerialPlate() {
  return (
    <div
      className="relative min-h-[132px] overflow-hidden rounded-[14px] border border-[#2a3a55]"
      aria-hidden="true"
      style={{ backgroundImage: "linear-gradient(160deg,#25502f,#377043 55%,#16321f)" }}
    >
      <svg
        viewBox="0 0 160 140"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        {/* Lot + driveway */}
        <rect x="0" y="0" width="160" height="140" fill="#2c5836" />
        <path d="M0 4 L160 4 L160 30 L0 34 Z" fill="#24492c" />
        <path d="M0 96 L160 74 L160 96 L0 118 Z" fill="#5a6259" />
        <path d="M0 104 L160 82 L160 84 L0 106 Z" fill="#7b8478" opacity="0.55" />
        <path d="M92 74 L112 74 L106 48 L98 48 Z" fill="#6b7369" />
        {/* Roof planes */}
        <g>
          <path d="M40 62 L74 36 L108 62 L74 84 Z" fill="#5d6c85" />
          <path d="M40 62 L74 84 L74 96 L40 74 Z" fill="#3d485c" />
          <path d="M108 62 L74 84 L74 96 L108 74 Z" fill="#4a5568" />
          <path d="M26 46 L48 32 L66 44 L44 58 Z" fill="#65718a" />
        </g>
        {/* Traced outline */}
        <g
          fill="none"
          stroke="#4ee7ff"
          strokeWidth="1.5"
          strokeLinejoin="round"
          opacity="0.95"
        >
          <path d="M40 62 L74 36 L108 62 L74 84 Z" />
          <path d="M74 36 L74 84" />
          <path d="M26 46 L48 32 L66 44 L44 58 Z" />
        </g>
        {/* Trees */}
        {[
          [16, 24],
          [136, 40],
          [22, 108],
          [130, 116],
          [58, 116],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="9" fill="#1c3f23" />
            <circle cx={x - 3} cy={y - 3} r="6" fill="#3b7a41" />
          </g>
        ))}
      </svg>

      <span className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,transparent_40%,rgba(4,10,8,.55))]" />
      <span className="animate-scan absolute inset-x-0 h-px bg-[linear-gradient(90deg,transparent,#7ef0c4,transparent)] shadow-[0_0_14px_var(--color-green)]" />
      <span className="absolute bottom-1.5 left-2 rounded-[6px] bg-[#050c09]/80 px-1.5 py-0.5 text-[9px] font-extrabold tracking-[0.08em] text-[#8ff5bb] uppercase">
        Scanning parcel
      </span>
    </div>
  );
}
