import type { Metadata } from "next";
import Link from "next/link";
import { IdCard } from "lucide-react";
import { getRepo } from "@/lib/data";
import {
  AGENT_CATEGORIES,
  AGENT_CATEGORY_LABELS,
  AGENT_SORTS,
  AGENT_STATUSES,
  type AgentSort,
} from "@/lib/data/types";
import { chipHref, oneOf, readQuery } from "@/lib/query";
import { AgentCard } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { BrowseControls } from "@/components/feature/browse-controls";

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
  const maxPrice = Number(readQuery(query, "max") ?? "");

  const agents = await getRepo().listAgents({
    q,
    category,
    status,
    sort,
    freeOnly,
    maxPriceCents: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
    limit: 48,
  });

  const base = {
    q,
    category,
    status,
    sort,
    free: freeOnly ? "1" : undefined,
    max: readQuery(query, "max"),
  };

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Agent Passports"
        subtitle="Universal agent identity and machine-readable reputation."
        icon={<IdCard className="size-4" aria-hidden="true" />}
        action={
          <Link href="/onboarding/agent" className={buttonClasses("primary", "sm")}>
            Register an agent
          </Link>
        }
      />

      <BrowseControls
        basePath="/agents"
        params={base}
        searchPlaceholder="Search agents, skills and regions…"
        chips={[
          {
            label: "All",
            href: chipHref("/agents", base, { category: undefined, free: undefined }),
            active: !category && !freeOnly,
          },
          {
            label: "Free",
            href: chipHref("/agents", base, { category: undefined, free: "1" }),
            active: freeOnly,
          },
          ...AGENT_CATEGORIES.map((value) => ({
            label: AGENT_CATEGORY_LABELS[value],
            href: chipHref("/agents", base, { category: value, free: undefined }),
            active: category === value,
          })),
        ]}
        selects={[
          {
            name: "status",
            label: "Status",
            value: status ?? "",
            options: [
              { value: "", label: "Any status" },
              ...AGENT_STATUSES.map((value) => ({ value, label: value })),
            ],
          },
          {
            name: "sort",
            label: "Sort",
            value: sort,
            options: [
              { value: "trending", label: "Trending" },
              { value: "rating", label: "Best rated" },
              { value: "price", label: "Lowest price" },
              { value: "newest", label: "Newest" },
            ],
          },
          {
            name: "max",
            label: "Max price",
            value: readQuery(query, "max") ?? "",
            options: [
              { value: "", label: "Any price" },
              { value: "50", label: "Under $0.50" },
              { value: "100", label: "Under $1" },
              { value: "500", label: "Under $5" },
            ],
          },
        ]}
      />

      <p className="m-0 text-[11.5px] text-muted tabular-nums">
        {agents.length} {agents.length === 1 ? "agent" : "agents"}
        {q ? ` matching “${q}”` : ""}
      </p>

      {agents.length === 0 ? (
        <EmptyState
          icon={<IdCard className="size-5" aria-hidden="true" />}
          title="No agents match that yet"
          description="Loosen a filter, or describe the outcome and let @World route it."
          action={
            <Link href="/world" className={buttonClasses("outline", "sm")}>
              Ask @World
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
