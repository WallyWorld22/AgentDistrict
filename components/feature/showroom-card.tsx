import Link from "next/link";
import { cn, formatCents } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

export type ShowroomDemo = {
  agentHandle: string;
  agentName: string;
  title: string;
  /** The pipeline sentence under the scene, e.g. "Parcel → Analysis → Report". */
  pipeline: string;
  durationLabel: string;
  priceCents: number;
  /** Label/value pairs shown in the readout panel. */
  readout: Array<{ label: string; value: string }>;
  gradient: string;
  glyph: string;
};

/**
 * The RoofIntel property-analysis demo from `docs/reference/desktop-home.png`:
 * a scanned aerial plate with a live readout beside it.
 *
 * The scan line is a CSS animation, so `prefers-reduced-motion: reduce` (handled
 * globally in `app/globals.css`) stops it.
 */
export const ROOFINTEL_DEMO: ShowroomDemo = {
  agentHandle: "roofintel",
  agentName: "RoofIntel",
  title: "Property Analysis Agent",
  pipeline: "Parcel → Analysis → Report",
  durationLabel: "30 seconds",
  priceCents: 47,
  readout: [
    { label: "Address", value: "1234 Palm Dr, Orlando, FL" },
    { label: "Roof Area", value: "2,148 sq ft" },
    { label: "Est. Replacement", value: "$12,400 – $14,800" },
    { label: "Storm Risk", value: "Moderate" },
  ],
  gradient: "linear-gradient(150deg,#123b2c,#1d6b4a 55%,#08211a)",
  glyph: "🏠",
};

export const SHOWROOM_DEMOS: ShowroomDemo[] = [
  ROOFINTEL_DEMO,
  {
    agentHandle: "webbuilder",
    agentName: "WebBuilder",
    title: "Landing Page Builder",
    pipeline: "Brief → Sections → Deploy preview",
    durationLabel: "4 minutes",
    priceCents: 450,
    readout: [
      { label: "Sections", value: "Hero, proof, offer, FAQ, CTA" },
      { label: "Lighthouse", value: "98 / 100 / 100 / 100" },
      { label: "Assets", value: "12 optimised, 214 KB total" },
      { label: "Output", value: "Static bundle + preview URL" },
    ],
    gradient: "linear-gradient(150deg,#2a1b5e,#6a3fd0 55%,#160e33)",
    glyph: "🧩",
  },
  {
    agentHandle: "qa-fox",
    agentName: "QA Fox",
    title: "Regression Pass",
    pipeline: "Crawl → Assert → Report",
    durationLabel: "90 seconds",
    priceCents: 120,
    readout: [
      { label: "Checks", value: "184 assertions" },
      { label: "Broken links", value: "3 found" },
      { label: "Contrast", value: "2 failures on /pricing" },
      { label: "Output", value: "Markdown report + CSV" },
    ],
    gradient: "linear-gradient(150deg,#5a2a10,#d1802e 55%,#2a1608)",
    glyph: "🦊",
  },
];

export function ShowroomCard({
  demo = ROOFINTEL_DEMO,
  className,
}: {
  demo?: ShowroomDemo;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-inset-surface grid gap-3 rounded-[18px] border border-[#1c2638] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
        className,
      )}
    >
      <div
        className="relative grid min-h-[128px] place-items-center overflow-hidden rounded-[14px] border border-[#2a3a55]"
        style={{ backgroundImage: demo.gradient }}
      >
        <span className="text-[46px] drop-shadow-[0_10px_22px_rgba(0,0,0,.55)]" aria-hidden="true">
          {demo.glyph}
        </span>
        <span
          aria-hidden="true"
          className="animate-scan absolute inset-x-0 h-px bg-[linear-gradient(90deg,transparent,#7ef0c4,transparent)] shadow-[0_0_14px_var(--color-green)]"
        />
        <Pill variant="green" size="sm" className="absolute top-2 right-2">
          LIVE DEMO
        </Pill>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div>
          <b className="block text-[13.5px] font-extrabold">{demo.agentName}</b>
          <small className="block text-[11px] text-muted">{demo.title}</small>
        </div>
        <dl className="m-0 grid gap-1">
          {demo.readout.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-2">
              <dt className="m-0 text-[10.5px] text-muted">{row.label}</dt>
              <dd className="m-0 truncate text-right text-[11px] font-bold text-ink">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <small className="text-[10px] text-muted">
            {demo.pipeline} · {demo.durationLabel} · {formatCents(demo.priceCents)}
          </small>
        </div>
        <Link
          href={`/agents/${demo.agentHandle}`}
          className={buttonClasses("primary", "sm", "w-full")}
        >
          Try It Now
        </Link>
      </div>
    </div>
  );
}
