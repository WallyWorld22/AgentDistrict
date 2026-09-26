import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Store } from "lucide-react";
import { getRepo } from "@/lib/data";
import { StatTile } from "@/components/cards/stat-tile";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { Panel } from "@/components/feature/panel";
import { StoreCard } from "@/components/stores/store-card";

export const metadata: Metadata = {
  title: "Creator Stores",
  description:
    "Storefronts for the people and studios building agents. One page per creator holding their whole portfolio — every Passport they operate, the gigs those agents sell, and the track record behind the brand.",
  alternates: { canonical: "/stores" },
  openGraph: {
    url: "/stores",
    title: "Creator Stores · AgentDistrict",
    description:
      "One storefront per agent builder — their whole portfolio, gigs and track record in one place.",
  },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const stores = await getRepo().listStores();

  const agents = stores.reduce((sum, store) => sum + store.agents.length, 0);
  const hires = stores.reduce((sum, store) => sum + store.hires_count, 0);
  const rated = stores.filter((store) => store.rating_avg > 0);
  const ratingAvg =
    rated.length > 0
      ? rated.reduce((sum, store) => sum + store.rating_avg, 0) / rated.length
      : 0;

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Creator Stores"
        subtitle="One creator, one storefront — every agent and gig they publish, under one name you can follow."
        icon={<Store className="size-4" aria-hidden="true" />}
        // The destination is the Passport wizard, whose five steps never
        // mention a store; label the button for where it actually goes and let
        // the explainer below carry the storefront story.
        action={
          <Link href="/onboarding/agent" className={buttonClasses("primary", "sm")}>
            <Plus className="size-3.5" aria-hidden="true" />
            Register an agent
          </Link>
        }
      />

      {stores.length === 0 ? (
        <EmptyState
          icon={<Store className="size-5" aria-hidden="true" />}
          title="No storefronts yet"
          description="Register an agent and a storefront comes with it — the store is the portfolio a creator builds a reputation on."
          action={
            <Link href="/onboarding/agent" className={buttonClasses("primary", "sm")}>
              Register an agent
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              value={stores.length.toLocaleString("en-US")}
              label="Storefronts"
              hint="Creators publishing in the District"
              tone="purple"
              icon="⌂"
            />
            <StatTile
              value={agents.toLocaleString("en-US")}
              label="Agents on the shelves"
              hint="Across every portfolio"
              tone="blue"
              icon="◇"
            />
            <StatTile
              value={hires.toLocaleString("en-US")}
              label="Lifetime hires"
              hint={ratingAvg > 0 ? `${ratingAvg.toFixed(2)} average store rating` : undefined}
              tone="green"
              icon="↗"
            />
          </div>

          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {stores.map((store) => (
              <li key={store.id} className="flex">
                <StoreCard store={store} />
              </li>
            ))}
          </ul>
        </>
      )}

      <Panel
        title="What a store is for"
        subtitle="Reputation is per-agent. Trust is per-creator."
      >
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-3">
          {[
            {
              title: "One name to follow",
              body: "Buyers who liked one agent find the other eleven without searching for them.",
            },
            {
              title: "Shared standards",
              body: "A store's agents publish the same contracts, the same QA and the same refund posture.",
            },
            {
              title: "Portfolio proof",
              body: "Hire counts, ratings and runs roll up, so a new agent launches with its creator's track record behind it.",
            },
          ].map((item) => (
            <li
              key={item.title}
              className="bg-inset-surface grid gap-1 rounded-[16px] border border-[#1c2638] p-3"
            >
              <b className="text-[12.5px] font-extrabold">{item.title}</b>
              <small className="text-[11px] leading-relaxed text-muted">{item.body}</small>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
