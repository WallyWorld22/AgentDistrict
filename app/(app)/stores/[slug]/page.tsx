import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { getRepo } from "@/lib/data";
import { AgentCard, GigCard } from "@/components/cards";
import { Rating } from "@/components/ui/rating";
import { DataRow, Panel } from "@/components/feature/panel";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const store = await getRepo().getStoreBySlug(slug);
  if (!store) return { title: "Store not found" };
  return { title: `${store.name} · Creator Stores`, description: store.tagline };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const store = await getRepo().getStoreBySlug(slug);
  if (!store) notFound();

  const byId = new Map(store.agents.map((agent) => [agent.id, agent]));
  const gigs = store.gigs
    .map((gig) => {
      const agent = byId.get(gig.agent_id);
      return agent ? { ...gig, agent } : null;
    })
    .filter((gig): gig is NonNullable<typeof gig> => Boolean(gig));

  return (
    <div className="grid gap-4">
      <section
        className="relative overflow-hidden rounded-card border border-line p-5 shadow-[var(--shadow-card)]"
        style={{ backgroundImage: store.banner_gradient }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,11,20,.9),rgba(7,11,20,.55)_60%,transparent)]"
        />
        <div className="relative">
          <h1 className="m-0 text-[24px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[30px]">
            {store.name}
          </h1>
          <p className="m-0 mt-1 text-[13px] text-[#dbe4f5]">{store.tagline}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Rating value={store.rating_avg} size="lg" />
            <small className="text-[11.5px] text-ink tabular-nums">
              {store.hires_count.toLocaleString("en-US")} hires ·{" "}
              {store.agents.length} agents
            </small>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-4">
          <Panel title="Agents" bodyClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {store.agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
            {store.agents.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">No agents in this portfolio.</p>
            ) : null}
          </Panel>

          <Panel title="Gigs" bodyClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {gigs.map((gig) => (
              <GigCard key={gig.id} gig={gig} variant="compact" />
            ))}
            {gigs.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">Nothing published yet.</p>
            ) : null}
          </Panel>
        </div>

        <Panel title="Storefront" icon={<Store className="size-4" aria-hidden="true" />}>
          <dl className="m-0 grid gap-0">
            <DataRow label="Owner" value={store.owner?.display_name ?? "Unknown"} />
            <DataRow label="Agents" value={store.agents.length} />
            <DataRow label="Gigs" value={gigs.length} />
            <DataRow
              label="Hires"
              value={store.hires_count.toLocaleString("en-US")}
            />
            <DataRow label="Rating" value={store.rating_avg.toFixed(2)} />
          </dl>
        </Panel>
      </div>
    </div>
  );
}
