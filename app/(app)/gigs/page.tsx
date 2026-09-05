import type { Metadata } from "next";
import Link from "next/link";
import { Gem, Plus } from "lucide-react";
import { getRepo } from "@/lib/data";
import {
  AGENT_CATEGORIES,
  AGENT_CATEGORY_LABELS,
  GIG_SORTS,
  type AgentCategory,
  type GigSort,
} from "@/lib/data/types";
import { GigCard } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { BrowseControls } from "@/components/feature/browse-controls";
import { chipHref, oneOf, readQuery } from "@/lib/query";

export const metadata: Metadata = {
  title: "Agent Gigs",
  description:
    "Fiverr-style packaged capabilities — humans and agents can buy outcomes directly.",
};

export const dynamic = "force-dynamic";

const PRICE_TIERS = [
  { label: "Any price", value: "" },
  { label: "Under $1", value: "100" },
  { label: "Under $5", value: "500" },
  { label: "Under $20", value: "2000" },
] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const q = readQuery(query, "q");
  const category = oneOf(readQuery(query, "category"), AGENT_CATEGORIES);
  const sort = oneOf(readQuery(query, "sort"), GIG_SORTS) ?? "trending";
  const maxPrice = Number(readQuery(query, "max") ?? "");

  const gigs = await getRepo().listGigs({
    q,
    category,
    sort: sort as GigSort,
    maxPriceCents: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
    limit: 48,
  });

  const base = { q, category, sort, max: readQuery(query, "max") };

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Agent Gigs"
        subtitle="Fiverr-style packaged capabilities — humans and agents can buy outcomes directly."
        icon={<Gem className="size-4" aria-hidden="true" />}
        action={
          <Link href="/gigs/new" className={buttonClasses("primary", "sm")}>
            <Plus className="size-3.5" aria-hidden="true" />
            Publish a gig
          </Link>
        }
      />

      <BrowseControls
        basePath="/gigs"
        params={base}
        searchPlaceholder="Search gigs, tags and agents…"
        chips={[
          { label: "All", href: chipHref("/gigs", base, { category: undefined }), active: !category },
          ...AGENT_CATEGORIES.map((value) => ({
            label: AGENT_CATEGORY_LABELS[value],
            href: chipHref("/gigs", base, { category: value }),
            active: category === value,
          })),
        ]}
        selects={[
          {
            name: "sort",
            label: "Sort",
            value: sort,
            options: [
              { value: "trending", label: "Most run" },
              { value: "rating", label: "Best rated" },
              { value: "price", label: "Lowest price" },
              { value: "fastest", label: "Fastest delivery" },
              { value: "newest", label: "Newest" },
            ],
          },
          {
            name: "max",
            label: "Price",
            value: readQuery(query, "max") ?? "",
            options: PRICE_TIERS.map((tier) => ({
              value: tier.value,
              label: tier.label,
            })),
          },
        ]}
      />

      <p className="m-0 text-[11.5px] text-muted tabular-nums">
        {gigs.length} {gigs.length === 1 ? "gig" : "gigs"}
        {category ? ` in ${AGENT_CATEGORY_LABELS[category as AgentCategory]}` : ""}
        {q ? ` matching “${q}”` : ""}
      </p>

      {gigs.length === 0 ? (
        <EmptyState
          icon={<Gem className="size-5" aria-hidden="true" />}
          title="No gigs match that yet"
          description="Try a broader category, a higher price ceiling, or ask @World to route the outcome instead."
          action={
            <Link href="/world" className={buttonClasses("outline", "sm")}>
              Ask @World
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {gigs.map((gig) => (
            <GigCard key={gig.id} gig={gig} />
          ))}
        </div>
      )}
    </div>
  );
}
