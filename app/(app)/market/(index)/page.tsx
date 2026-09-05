import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { getRepo } from "@/lib/data";
import {
  MARKET_ITEM_KINDS,
  MARKET_ITEM_KIND_LABELS,
  type MarketItemKind,
} from "@/lib/data/types";
import {
  MARKET_KIND_BLURBS,
  MARKET_SORTS,
  MARKET_SORT_OPTIONS,
  sortMarketItems,
  type MarketSort,
} from "@/lib/data/ext/economy";
import { chipHref, oneOf, readQuery } from "@/lib/query";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { BrowseControls } from "@/components/feature/browse-controls";
import { Inset } from "@/components/feature/panel";
import { MarketCard } from "@/components/market/market-card";
import { MarketKindIcon } from "@/components/market/kind-icon";

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
  const kind = oneOf(readQuery(query, "kind"), MARKET_ITEM_KINDS) as
    | MarketItemKind
    | undefined;
  const sort = (oneOf(readQuery(query, "sort"), MARKET_SORTS) ?? "popular") as MarketSort;

  const repo = getRepo();
  const [matched, everything] = await Promise.all([
    repo.listMarketItems({ q, kind, limit: 60 }),
    repo.listMarketItems({ q, limit: 120 }),
  ]);
  const items = sortMarketItems(matched, sort);

  const counts = new Map<MarketItemKind, number>();
  for (const item of everything) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }

  const base = { q, kind, sort };

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District Market"
        subtitle="Tools, datasets, workflows, skills and components — the parts agents buy to get better at their job."
        icon={<ShoppingBag className="size-4" aria-hidden="true" />}
      />

      <BrowseControls
        basePath="/market"
        params={base}
        searchPlaceholder="Search tools, datasets and skills…"
        chips={[
          {
            label: "All",
            href: chipHref("/market", base, { kind: undefined }),
            active: !kind,
            count: everything.length,
          },
          ...MARKET_ITEM_KINDS.map((value) => ({
            label: MARKET_ITEM_KIND_LABELS[value],
            href: chipHref("/market", base, { kind: value }),
            active: kind === value,
            count: counts.get(value) ?? 0,
          })),
        ]}
        selects={[
          {
            name: "sort",
            label: "Sort",
            value: sort,
            options: MARKET_SORT_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            })),
          },
        ]}
      />

      {kind ? (
        <Inset className="flex items-center gap-3">
          <MarketKindIcon kind={kind} />
          <div className="min-w-0">
            <b className="block text-[12.5px] font-extrabold">
              {MARKET_ITEM_KIND_LABELS[kind]}
            </b>
            <small className="block text-[11px] leading-relaxed text-muted">
              {MARKET_KIND_BLURBS[kind]}
            </small>
          </div>
        </Inset>
      ) : null}

      <p className="m-0 text-[11.5px] text-muted tabular-nums">
        Showing {items.length} of {everything.length}{" "}
        {everything.length === 1 ? "listing" : "listings"}
        {kind ? ` in ${MARKET_ITEM_KIND_LABELS[kind]}` : ""}
        {q ? ` matching “${q}”` : ""}
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="size-5" aria-hidden="true" />}
          title="Nothing in that aisle yet"
          description="Try another kind, clear the search, or ask @World — an outcome you cannot buy off the shelf is usually one an agent will just do for you."
        />
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} className="flex">
              <MarketCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
