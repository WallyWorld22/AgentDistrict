import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Gem, ShoppingBag, Store, Users } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { storeTotals } from "@/lib/data/ext/economy";
import { MARKET_ITEM_KIND_LABELS } from "@/lib/data/types";
import { endSentence } from "@/lib/seo/schema";
import { formatCents, timeAgo } from "@/lib/utils";
import { AgentCard, GigCard } from "@/components/cards";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { DataRow, Panel } from "@/components/feature/panel";
import { FollowStoreButton } from "@/components/stores/follow-button";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const store = await getRepo().getStoreBySlug(slug);
  if (!store) return { title: "Store not found" };

  const description = `${endSentence(store.tagline)} A creator store on AgentDistrict: the agents, gigs and tools this team publishes, with their real reputation.`;
  return {
    title: `${store.name} · Creator Stores`,
    description,
    alternates: { canonical: `/stores/${store.slug}` },
    openGraph: { type: "website", url: `/stores/${store.slug}`, title: store.name, description },
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const repo = getRepo();
  const store = await repo.getStoreBySlug(slug);
  if (!store) notFound();

  const now = districtNow();
  const marketItems = (await repo.listMarketItems({ limit: 60 })).filter(
    (item) => item.seller_store_id === store.id,
  );

  const byId = new Map(store.agents.map((agent) => [agent.id, agent]));
  const gigs = store.gigs
    .map((gig) => {
      const agent = byId.get(gig.agent_id);
      return agent ? { ...gig, agent } : null;
    })
    .filter((gig): gig is NonNullable<typeof gig> => Boolean(gig))
    .sort((a, b) => b.runs_count - a.runs_count);

  const totals = storeTotals({ agents: store.agents, gigs });

  return (
    <div className="grid gap-4">
      <section
        className="relative overflow-hidden rounded-card border border-line shadow-[var(--shadow-float)]"
        style={{ backgroundImage: store.banner_gradient }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(100deg,rgba(7,11,20,.94),rgba(7,11,20,.68)_58%,rgba(7,11,20,.28))]"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            <p className="m-0 mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.16em] text-cyan uppercase">
              <Store className="size-3.5" aria-hidden="true" />
              Creator store
            </p>
            <h1 className="m-0 text-[24px] leading-tight font-extrabold tracking-[-0.02em] text-balance sm:text-[30px]">
              {store.name}
            </h1>
            <p className="m-0 mt-1.5 max-w-[62ch] text-[12.5px] leading-relaxed text-pretty text-[#dbe4f5]">
              {store.tagline}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <Rating value={store.rating_avg} size="lg" showStars />
              <small className="text-[11.5px] text-ink tabular-nums">
                {store.hires_count.toLocaleString("en-US")} hires
              </small>
              <small className="text-[11.5px] text-ink tabular-nums">
                {store.agents.length} {store.agents.length === 1 ? "agent" : "agents"}
              </small>
              <small className="text-[11.5px] text-ink tabular-nums">
                {gigs.length} {gigs.length === 1 ? "gig" : "gigs"}
              </small>
            </div>
          </div>
          <FollowStoreButton slug={store.slug} name={store.name} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-4">
          <Panel
            title="Agents"
            subtitle="Every Passport this creator publishes."
            icon={<Users className="size-4" aria-hidden="true" />}
            bodyClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {store.agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
            {store.agents.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">No agents in this portfolio yet.</p>
            ) : null}
          </Panel>

          <Panel
            title="Gigs"
            subtitle="Packaged outcomes, most-run first."
            icon={<Gem className="size-4" aria-hidden="true" />}
            bodyClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {gigs.map((gig) => (
              <GigCard key={gig.id} gig={gig} variant="compact" />
            ))}
            {gigs.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">Nothing published yet.</p>
            ) : null}
          </Panel>

          {marketItems.length > 0 ? (
            <Panel
              title="Also in the Market"
              subtitle="Tools and datasets this store sells outright."
              icon={<ShoppingBag className="size-4" aria-hidden="true" />}
              href="/market"
              actionLabel="Browse the Market"
            >
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                {marketItems.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/market/${item.slug}`}
                      className="bg-inset-surface flex items-center gap-3 rounded-[16px] border border-[#1c2638] p-2.5 transition-colors hover:border-[#33415f]"
                    >
                      <span className="text-[22px]" aria-hidden="true">
                        {item.icon_emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="flex items-center gap-1 truncate text-[12px] font-extrabold">
                          <span className="truncate">{item.title}</span>
                          {item.verified ? (
                            <BadgeCheck className="size-3.5 shrink-0 text-blue" aria-hidden="true" />
                          ) : null}
                        </b>
                        <small className="block text-[10.5px] text-muted">
                          {MARKET_ITEM_KIND_LABELS[item.kind]} ·{" "}
                          {item.downloads.toLocaleString("en-US")} downloads
                        </small>
                      </span>
                      <Price cents={item.price_cents} size="sm" tone="green" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Storefront" icon={<Store className="size-4" aria-hidden="true" />}>
            <dl className="m-0 grid gap-0">
              <DataRow label="Owner" value={store.owner?.display_name ?? "Unknown"} />
              <DataRow label="Agents" value={store.agents.length} />
              <DataRow label="Gigs" value={gigs.length} />
              <DataRow label="Gig runs" value={totals.runs.toLocaleString("en-US")} />
              <DataRow label="Jobs completed" value={totals.jobs.toLocaleString("en-US")} />
              <DataRow label="Reviews" value={totals.reviews.toLocaleString("en-US")} />
              <DataRow
                label="Prices from"
                value={
                  gigs.length === 0
                    ? "—"
                    : totals.fromCents === 0
                      ? "FREE"
                      : formatCents(totals.fromCents)
                }
              />
              <DataRow label="Rating" value={store.rating_avg.toFixed(2)} />
              <DataRow label="Trading since" value={timeAgo(store.created_at, now)} />
            </dl>
          </Panel>

          {store.owner ? (
            <Panel title="About the creator">
              <b className="block text-[13px] font-extrabold">{store.owner.display_name}</b>
              <small className="mt-0.5 block text-[11px] text-muted">
                @{store.owner.handle}
              </small>
              {store.owner.bio ? (
                <p className="m-0 mt-2 text-[11.5px] leading-relaxed text-ink">
                  {store.owner.bio}
                </p>
              ) : null}
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
