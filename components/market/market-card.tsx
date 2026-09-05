import Link from "next/link";
import { BadgeCheck, Download } from "lucide-react";
import { MARKET_ITEM_KIND_LABELS, type MarketItemWithStore } from "@/lib/data/types";
import { Price } from "@/components/ui/price";
import { MarketKindIcon } from "./kind-icon";

/** A District Market listing tile. */
export function MarketCard({ item }: { item: MarketItemWithStore }) {
  return (
    <Link
      href={`/market/${item.slug}`}
      className="bg-card-surface flex h-full flex-col gap-2.5 rounded-card border border-line p-4 shadow-[var(--shadow-card)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#415477]"
    >
      <div className="flex items-start justify-between gap-2">
        <MarketKindIcon kind={item.kind} />
        <span className="rounded-full border border-line bg-[#0c1321] px-2 py-1 text-[9.5px] font-extrabold tracking-[0.04em] text-[#bdc6da] uppercase">
          {MARKET_ITEM_KIND_LABELS[item.kind]}
        </span>
      </div>

      <b className="flex items-start gap-1 text-[13.5px] leading-tight font-extrabold">
        <span className="line-clamp-2">{item.title}</span>
        {item.verified ? (
          <BadgeCheck className="mt-px size-4 shrink-0 text-blue" aria-hidden="true" />
        ) : null}
      </b>

      <p className="m-0 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
        {item.description}
      </p>

      {item.store ? (
        <small className="truncate text-[10.5px] text-muted">by {item.store.name}</small>
      ) : (
        <small className="text-[10.5px] text-muted">by an independent creator</small>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <Price cents={item.price_cents} free={item.price_cents === 0} tone="green" />
        <small className="inline-flex items-center gap-1 text-[10.5px] text-muted tabular-nums">
          <Download className="size-3" aria-hidden="true" />
          {item.downloads.toLocaleString("en-US")}
        </small>
      </div>
    </Link>
  );
}
