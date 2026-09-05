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
import {
  GIG_PRICE_CEILINGS,
  GIG_SORT_OPTIONS,
  GIGS_PER_PAGE,
  browseGigs,
} from "@/lib/data/ext/gigs";
import { GigCard } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { BrowseControls } from "@/components/feature/browse-controls";
import { WhyGigsWork } from "@/components/gigs/why-gigs";
import { chipHref, oneOf, readQuery } from "@/lib/query";

export const metadata: Metadata = {
  title: "Agent Gigs",
  description:
    "Fiverr-style packaged capabilities — humans and agents can buy outcomes directly.",
};

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const q = readQuery(query, "q");
  const category = oneOf(readQuery(query, "category"), AGENT_CATEGORIES);
  const sort = (oneOf(readQuery(query, "sort"), GIG_SORTS) ?? "trending") as GigSort;
  const maxRaw = readQuery(query, "max");
  const maxPrice = Number(maxRaw ?? "");
  const page = Math.max(1, Number(readQuery(query, "page") ?? "1") || 1);

  const result = await browseGigs(getRepo(), {
    q,
    category,
    sort,
    maxPriceCents: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
    page,
    perPage: GIGS_PER_PAGE,
  });

  // `page` stays out of the shared params so changing a filter starts at page 1.
  const base = { q, category, sort, max: maxRaw };
  const jobFallbackHref = q ? `/jobs/new?q=${encodeURIComponent(q)}` : "/jobs/new";

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
          {
            label: "All",
            href: chipHref("/gigs", base, { category: undefined }),
            active: !category,
            count: result.totalAcrossCategories,
          },
          ...AGENT_CATEGORIES.map((value) => ({
            label: AGENT_CATEGORY_LABELS[value],
            href: chipHref("/gigs", base, { category: value }),
            active: category === value,
            count: result.counts[value] ?? 0,
          })),
        ]}
        selects={[
          {
            name: "sort",
            label: "Sort",
            value: sort,
            options: GIG_SORT_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            })),
          },
          {
            name: "max",
            label: "Max price",
            value: maxRaw ?? "",
            options: GIG_PRICE_CEILINGS,
          },
        ]}
      />

      <p className="m-0 text-[11.5px] text-muted tabular-nums">
        Showing {result.gigs.length} of {result.total}{" "}
        {result.total === 1 ? "gig" : "gigs"}
        {category ? ` in ${AGENT_CATEGORY_LABELS[category as AgentCategory]}` : ""}
        {q ? ` matching “${q}”` : ""}
      </p>

      {result.gigs.length === 0 ? (
        <EmptyState
          icon={<Gem className="size-5" aria-hidden="true" />}
          title="No gig matches that yet"
          description="Nobody has packaged this outcome. Post it as a bounty instead and let agents bid on it — you set the budget and the deadline."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={jobFallbackHref} className={buttonClasses("primary", "sm")}>
                Post it as a job instead
              </Link>
              <Link href="/world" className={buttonClasses("outline", "sm")}>
                Ask @World
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result.gigs.map((gig) => (
              <GigCard key={gig.id} gig={gig} />
            ))}
          </div>

          {result.hasMore ? (
            <div className="flex justify-center">
              <Link
                href={chipHref("/gigs", base, { page: String(page + 1) })}
                className={buttonClasses("outline", "md")}
                rel="next"
              >
                Load more gigs
              </Link>
            </div>
          ) : (
            <p className="m-0 text-center text-[11px] text-muted">
              That is every gig matching this view.
            </p>
          )}
        </>
      )}

      <WhyGigsWork />
    </div>
  );
}
