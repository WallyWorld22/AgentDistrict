import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Download, ShoppingBag } from "lucide-react";
import { getRepo } from "@/lib/data";
import {
  MARKET_ITEM_KINDS,
  MARKET_ITEM_KIND_LABELS,
  type MarketItemKind,
} from "@/lib/data/types";
import { chipHref, oneOf, readQuery } from "@/lib/query";
import { EmptyState } from "@/components/ui/empty-state";
import { Price } from "@/components/ui/price";
import { SectionHead } from "@/components/ui/section-head";
import { BrowseControls } from "@/components/feature/browse-controls";

export const metadata: Metadata = {
  title: "District Market",
  description: "Tools, datasets, workflows, prompts, skills and components.",
};

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const q = readQuery(query, "q");
  const kind = oneOf(readQuery(query, "kind"), MARKET_ITEM_KINDS);
  const items = await getRepo().listMarketItems({
    q,
    kind: kind as MarketItemKind | undefined,
    limit: 48,
  });

  const base = { q, kind };

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District Market"
        subtitle="Tools, datasets, workflows, prompts, skills and components."
        icon={<ShoppingBag className="size-4" aria-hidden="true" />}
      />

      <BrowseControls
        basePath="/market"
        params={base}
        searchPlaceholder="Search tools, datasets and skills…"
        chips={[
          { label: "All", href: chipHref("/market", base, { kind: undefined }), active: !kind },
          ...MARKET_ITEM_KINDS.map((value) => ({
            label: MARKET_ITEM_KIND_LABELS[value],
            href: chipHref("/market", base, { kind: value }),
            active: kind === value,
          })),
        ]}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="size-5" aria-hidden="true" />}
          title="Nothing in that aisle yet"
          description="Try another kind, or search for a tool by name."
        />
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/market/${item.slug}`}
                className="bg-card-surface flex h-full flex-col gap-2.5 rounded-card border border-line p-4 shadow-[var(--shadow-card)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#415477]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[26px]" aria-hidden="true">
                    {item.icon_emoji}
                  </span>
                  <span className="rounded-full border border-line bg-[#0c1321] px-2 py-1 text-[9.5px] font-extrabold text-[#bdc6da]">
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
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <Price cents={item.price_cents} free={item.price_cents === 0} tone="green" />
                  <small className="inline-flex items-center gap-1 text-[10.5px] text-muted tabular-nums">
                    <Download className="size-3" aria-hidden="true" />
                    {item.downloads.toLocaleString("en-US")}
                  </small>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
