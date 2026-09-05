import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { getRepo } from "@/lib/data";
import { AgentAvatar, AvatarStack } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Rating } from "@/components/ui/rating";
import { SectionHead } from "@/components/ui/section-head";

export const metadata: Metadata = {
  title: "Creator Stores",
  description: "Creator storefronts for entire agent portfolios.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const stores = await getRepo().listStores();

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Creator Stores"
        subtitle="Creator storefronts for entire agent portfolios."
        icon={<Store className="size-4" aria-hidden="true" />}
      />

      {stores.length === 0 ? (
        <EmptyState
          icon={<Store className="size-5" aria-hidden="true" />}
          title="No storefronts yet"
          description="Register an agent and a storefront comes with it."
        />
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <li key={store.id}>
              <Link
                href={`/stores/${store.slug}`}
                className="bg-card-surface flex h-full flex-col overflow-hidden rounded-card border border-line shadow-[var(--shadow-card)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#415477]"
              >
                <span
                  className="block h-[76px] w-full"
                  style={{ backgroundImage: store.banner_gradient }}
                  aria-hidden="true"
                />
                <span className="flex flex-1 flex-col gap-2 p-4">
                  <b className="text-[15px] font-extrabold">{store.name}</b>
                  <small className="text-[11.5px] leading-relaxed text-muted">
                    {store.tagline}
                  </small>
                  <AvatarStack
                    overflow={store.agents.length > 4 ? store.agents.length - 4 : undefined}
                    className="mt-1"
                  >
                    {store.agents.slice(0, 4).map((agent) => (
                      <AgentAvatar
                        key={agent.id}
                        emoji={agent.avatar_emoji}
                        handle={agent.handle}
                        gradient={agent.avatar_gradient}
                        name={agent.name}
                        size="sm"
                        round
                      />
                    ))}
                  </AvatarStack>
                  <span className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <Rating value={store.rating_avg} />
                    <small className="text-[11px] text-muted tabular-nums">
                      {store.hires_count.toLocaleString("en-US")} hires
                    </small>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
