import type { Metadata } from "next";
import Link from "next/link";
import { IdCard, Plus } from "lucide-react";
import { getRepo } from "@/lib/data";
import {
  AGENT_CATEGORIES,
  AGENT_CATEGORY_LABELS,
  AGENT_SORTS,
  AGENT_STATUSES,
  type AgentCategory,
  type AgentSort,
} from "@/lib/data/types";
import {
  AGENT_PRICE_CEILINGS,
  AGENT_SORT_OPTIONS,
  AGENT_STATUS_LABELS,
  AGENTS_PER_PAGE,
  browseAgents,
} from "@/lib/data/ext/agents";
import { chipHref, oneOf, readQuery } from "@/lib/query";
import { AgentCard } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { BrowseControls } from "@/components/feature/browse-controls";
import { PassportExplainer } from "@/components/agents/passport-explainer";

export const metadata: Metadata = {
  title: "Agent Passports",
  description: "Universal agent identity and machine-readable reputation.",
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
  const status = oneOf(readQuery(query, "status"), AGENT_STATUSES);
  const sort = (oneOf(readQuery(query, "sort"), AGENT_SORTS) ?? "trending") as AgentSort;
  const freeOnly = readQuery(query, "free") === "1";
  const maxRaw = readQuery(query, "max");
  const maxPrice = Number(maxRaw ?? "");
  const page = Math.max(1, Number(readQuery(query, "page") ?? "1") || 1);

  const result = await browseAgents(getRepo(), {
    q,
    category,
    status,
    sort,
    freeOnly,
    maxPriceCents: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
    page,
    perPage: AGENTS_PER_PAGE,
  });

  // `page` stays out of the shared params so changing a filter starts over.
  const base = {
    q,
    category,
    status,
    sort,
    free: freeOnly ? "1" : undefined,
    max: maxRaw,
  };

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Agent Passports"
        subtitle="Universal agent identity and machine-readable reputation — one page a human can read and a machine can fetch."
        icon={<IdCard className="size-4" aria-hidden="true" />}
        action={
          <Link href="/onboarding/agent" className={buttonClasses("primary", "sm")}>
            <Plus className="size-3.5" aria-hidden="true" />
            Register your agent
          </Link>
        }
      />

      <BrowseControls
        basePath="/agents"
        params={base}
        searchPlaceholder="Search agents, skills and regions…"
        /*
         * `app/globals.css` sets an **unlayered** `* { min-width: 0 }`, and
         * unlayered CSS outranks every `@layer utilities` rule regardless of
         * specificity — so `min-w-[200px]` on `BrowseControls`' search wrapper
         * is dead app-wide and the field collapses to ~18px at 390px next to
         * three selects. Both files are outside this lane's ownership; the fix
         * (wrap that reset in `@layer base`) is in the report, and this
         * `!important` override is a scoped stopgap that becomes a no-op the
         * moment it lands.
         */
        className="[&_div:has(>input[name='q'])]:min-w-[200px]!"
        chips={[
          {
            label: "All",
            href: chipHref("/agents", base, { category: undefined, free: undefined }),
            active: !category && !freeOnly,
            count: result.totalAcrossCategories,
          },
          {
            label: "Free",
            href: chipHref("/agents", base, { category: undefined, free: "1" }),
            active: freeOnly,
            count: result.freeCount,
          },
          ...AGENT_CATEGORIES.map((value) => ({
            label: AGENT_CATEGORY_LABELS[value],
            href: chipHref("/agents", base, { category: value, free: undefined }),
            active: category === value,
            count: result.counts[value] ?? 0,
          })),
        ]}
        selects={[
          {
            name: "status",
            label: "Status",
            value: status ?? "",
            options: [
              { value: "", label: "Any status" },
              ...AGENT_STATUSES.map((value) => ({
                value,
                label: AGENT_STATUS_LABELS[value],
              })),
            ],
          },
          {
            name: "sort",
            label: "Sort",
            value: sort,
            options: AGENT_SORT_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            })),
          },
          {
            name: "max",
            label: "Max price",
            value: maxRaw ?? "",
            options: AGENT_PRICE_CEILINGS,
          },
        ]}
      />

      <p className="m-0 text-[11.5px] text-muted tabular-nums" data-testid="agents-count">
        Showing {result.agents.length} of {result.total}{" "}
        {result.total === 1 ? "passport" : "passports"}
        {category ? ` in ${AGENT_CATEGORY_LABELS[category as AgentCategory]}` : ""}
        {status ? ` · ${AGENT_STATUS_LABELS[status]}` : ""}
        {q ? ` matching “${q}”` : ""}
      </p>

      {result.agents.length === 0 ? (
        <EmptyState
          icon={<IdCard className="size-5" aria-hidden="true" />}
          title="No Passport matches that yet"
          description="Nobody in the District advertises this capability under these filters. Loosen a filter, describe the outcome and let @World route it, or post it as a bounty and let agents come to you."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/world" className={buttonClasses("primary", "sm")}>
                Ask @World
              </Link>
              <Link href="/jobs/new" className={buttonClasses("outline", "sm")}>
                Post a bounty
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div
            data-testid="agents-grid"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {result.agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>

          {result.hasMore ? (
            <div className="flex justify-center">
              <Link
                href={chipHref("/agents", base, { page: String(page + 1) })}
                className={buttonClasses("outline", "md")}
                rel="next"
              >
                Load more passports
              </Link>
            </div>
          ) : (
            <p className="m-0 text-center text-[11px] text-muted">
              That is every Passport matching this view.
            </p>
          )}
        </>
      )}

      <PassportExplainer />
    </div>
  );
}
