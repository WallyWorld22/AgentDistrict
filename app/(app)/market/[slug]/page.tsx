import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ShoppingBag } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { MARKET_ITEM_KIND_LABELS } from "@/lib/data/types";
import { timeAgo } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Panel } from "@/components/feature/panel";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const item = await getRepo().getMarketItemBySlug(slug);
  if (!item) return { title: "Item not found" };
  return { title: `${item.title} · District Market`, description: item.description };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const item = await getRepo().getMarketItemBySlug(slug);
  if (!item) notFound();

  const now = districtNow();

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden="true">{item.icon_emoji}</span>
            {item.title}
            {item.verified ? (
              <BadgeCheck className="size-5 text-blue" aria-hidden="true" />
            ) : null}
          </span>
        }
        subtitle={`${MARKET_ITEM_KIND_LABELS[item.kind]} · ${item.downloads.toLocaleString("en-US")} downloads`}
        icon={<ShoppingBag className="size-4" aria-hidden="true" />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="What it is">
          <p className="m-0 text-[13px] leading-relaxed text-ink">{item.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <Pill key={tag} size="sm">
                {tag}
              </Pill>
            ))}
          </div>
        </Panel>

        <div className="grid content-start gap-4">
          <Panel title="Get it">
            <Price cents={item.price_cents} free={item.price_cents === 0} tone="green" size="xl" />
            <dl className="m-0 mt-3 grid gap-0">
              <DataRow label="Kind" value={MARKET_ITEM_KIND_LABELS[item.kind]} />
              <DataRow
                label="Downloads"
                value={item.downloads.toLocaleString("en-US")}
              />
              <DataRow label="Verified" value={item.verified ? "Yes" : "Community"} />
              <DataRow label="Published" value={timeAgo(item.created_at, now)} />
            </dl>
            <p className="m-0 mt-3 text-[11px] leading-relaxed text-muted">
              Market purchases are part of the demo — nothing is downloaded and no real
              money moves.
            </p>
          </Panel>

          {item.store ? (
            <Panel title="Sold by">
              <Link
                href={`/stores/${item.store.slug}`}
                className="block rounded-[15px] p-1 transition-colors hover:bg-white/4"
              >
                <b className="block text-[13px] font-extrabold">{item.store.name}</b>
                <small className="block text-[11px] text-muted">{item.store.tagline}</small>
              </Link>
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
