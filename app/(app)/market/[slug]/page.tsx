import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Check, Download, ShoppingBag } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { MARKET_ITEM_KIND_LABELS } from "@/lib/data/types";
import {
  MARKET_KIND_BLURBS,
  marketIncludes,
  sortMarketItems,
} from "@/lib/data/ext/economy";
import { clampWords, endSentence } from "@/lib/seo/schema";
import { timeAgo } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { AddToToolkitButton } from "@/components/market/add-to-toolkit";
import { MarketCard } from "@/components/market/market-card";
import { MarketKindIcon } from "@/components/market/kind-icon";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const item = await getRepo().getMarketItemBySlug(slug);
  if (!item) return { title: "Item not found" };

  const description = `${endSentence(clampWords(item.description, 150))} ${MARKET_ITEM_KIND_LABELS[item.kind]} in the District Market on AgentDistrict.`;
  return {
    title: `${item.title} · District Market`,
    description,
    alternates: { canonical: `/market/${item.slug}` },
    openGraph: { type: "website", url: `/market/${item.slug}`, title: item.title, description },
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const repo = getRepo();
  const item = await repo.getMarketItemBySlug(slug);
  if (!item) notFound();

  const now = districtNow();
  const included = marketIncludes(item);
  const related = sortMarketItems(
    (await repo.listMarketItems({ kind: item.kind, limit: 8 })).filter(
      (entry) => entry.id !== item.id,
    ),
    "popular",
  ).slice(0, 3);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={item.title}
        subtitle={`${MARKET_ITEM_KIND_LABELS[item.kind]} · ${item.downloads.toLocaleString("en-US")} downloads · ${MARKET_KIND_BLURBS[item.kind]}`}
        icon={<ShoppingBag className="size-4" aria-hidden="true" />}
        action={
          item.verified ? (
            <Pill variant="blue">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              Verified
            </Pill>
          ) : (
            <Pill>Community</Pill>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <Panel bodyClassName="flex flex-wrap items-start gap-4">
            <MarketKindIcon kind={item.kind} size="lg" />
            <div className="min-w-0 flex-1 basis-[260px]">
              <p className="m-0 text-[13px] leading-relaxed text-ink">{item.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <Pill key={tag} size="sm">
                    {tag}
                  </Pill>
                ))}
              </div>
            </div>
          </Panel>

          <Panel
            title="What's included"
            subtitle="Everything that arrives when you add this to a run."
          >
            <ul className="m-0 grid list-none gap-2 p-0">
              {included.map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <Check className="mt-px size-4 shrink-0 text-green" aria-hidden="true" />
                  <span className="text-[12px] leading-relaxed text-ink">{line}</span>
                </li>
              ))}
            </ul>
          </Panel>

          {related.length > 0 ? (
            <Panel
              title={`More ${MARKET_ITEM_KIND_LABELS[item.kind].toLowerCase()}s`}
              subtitle="Same aisle, most downloaded first."
              href={`/market?kind=${item.kind}`}
              actionLabel="See the aisle"
              bodyClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              {related.map((entry) => (
                <MarketCard key={entry.id} item={entry} />
              ))}
            </Panel>
          ) : null}
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Get it">
            <Price
              cents={item.price_cents}
              free={item.price_cents === 0}
              tone="green"
              size="xl"
            />
            <AddToToolkitButton
              slug={item.slug}
              title={item.title}
              priceCents={item.price_cents}
            />
            <dl className="m-0 mt-3 grid gap-0">
              <DataRow label="Kind" value={MARKET_ITEM_KIND_LABELS[item.kind]} />
              <DataRow
                label="Downloads"
                value={
                  <span className="inline-flex items-center gap-1">
                    <Download className="size-3" aria-hidden="true" />
                    {item.downloads.toLocaleString("en-US")}
                  </span>
                }
              />
              <DataRow label="Verified" value={item.verified ? "District-reviewed" : "Community"} />
              <DataRow label="Published" value={timeAgo(item.created_at, now)} />
            </dl>
            <Inset className="mt-3">
              <p className="m-0 text-[10.5px] leading-relaxed text-muted">
                Demo install: adding an item bookmarks it in this browser. Nothing is
                charged, nothing is downloaded and no external service is called.
              </p>
            </Inset>
          </Panel>

          {item.store ? (
            <Panel title="Sold by">
              <b className="block text-[13px] font-extrabold">{item.store.name}</b>
              <small className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                {item.store.tagline}
              </small>
              <dl className="m-0 mt-2 grid gap-0">
                <DataRow
                  label="Store hires"
                  value={item.store.hires_count.toLocaleString("en-US")}
                />
                <DataRow label="Store rating" value={item.store.rating_avg.toFixed(2)} />
              </dl>
              <Link
                href={`/stores/${item.store.slug}`}
                className={buttonClasses("outline", "sm", "mt-3 w-full")}
              >
                Visit storefront
              </Link>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
