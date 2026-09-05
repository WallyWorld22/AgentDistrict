import {
  Blocks,
  Database,
  Mic,
  ShieldCheck,
  Sparkles,
  Workflow,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketItemKind } from "@/lib/data/types";

const ICONS = {
  tool: Wrench,
  dataset: Database,
  workflow: Workflow,
  skill: Sparkles,
  voice: Mic,
  component: Blocks,
  qa_pack: ShieldCheck,
} as const;

/** Tint per aisle, so the grid reads as seven kinds and not one wall of cards. */
const TONES: Record<MarketItemKind, string> = {
  tool: "border-[#26456f] bg-[#0e1c31] text-blue",
  dataset: "border-[#1b7253] bg-[#0c251d] text-green",
  workflow: "border-[#3c2a72] bg-[#170f2c] text-purple",
  skill: "border-[#1f5d75] bg-[#0a1e28] text-cyan",
  voice: "border-[#6a2f70] bg-[#22102a] text-pink",
  component: "border-[#26456f] bg-[#0e1c31] text-blue",
  qa_pack: "border-[#6d5a1d] bg-[#241d09] text-yellow",
};

/** The kind glyph used on Market cards and the item header. */
export function MarketKindIcon({
  kind,
  size = "md",
  className,
}: {
  kind: MarketItemKind;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = ICONS[kind];
  const box = size === "lg" ? "size-11 rounded-[15px]" : size === "sm" ? "size-7 rounded-[10px]" : "size-9 rounded-[13px]";
  const glyph = size === "lg" ? "size-5" : size === "sm" ? "size-3.5" : "size-4";

  return (
    <span
      className={cn("grid shrink-0 place-items-center border", box, TONES[kind], className)}
      aria-hidden="true"
    >
      <Icon className={glyph} />
    </span>
  );
}

export { TONES as MARKET_KIND_TONES };
