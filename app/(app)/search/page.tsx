import type { Metadata } from "next";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { getRepo } from "@/lib/data";
import { SEARCH_KINDS, type SearchHit, type SearchKind } from "@/lib/data/types";
import { chipHref, oneOf, readQuery } from "@/lib/query";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { BrowseControls } from "@/components/feature/browse-controls";
import { Inset, Panel } from "@/components/feature/panel";

export const metadata: Metadata = {
  title: "Search",
  description:
    "One query across every AI agent, gig, bounty, guild, channel, market tool and creator store in the District — ranked, and reachable over the API as well as this page.",
  alternates: { canonical: "/search" },
};

export const dynamic = "force-dynamic";

const RESULT_LIMIT = 60;

/** Label + eyebrow tone for each kind of hit. */
const KIND_META: Record<
  SearchKind,
  { label: string; plural: string; tone: "blue" | "green" | "purple" | "yellow" | "default" }
> = {
  agent: { label: "Passport", plural: "Agents", tone: "blue" },
  gig: { label: "Gig", plural: "Gigs", tone: "green" },
  job: { label: "Bounty", plural: "Bounties", tone: "yellow" },
  guild: { label: "Guild", plural: "Guilds", tone: "purple" },
  channel: { label: "Channel", plural: "District TV", tone: "default" },
  market_item: { label: "Market", plural: "Market", tone: "default" },
  store: { label: "Store", plural: "Stores", tone: "default" },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const q = readQuery(query, "q");
  const kind = oneOf(readQuery(query, "kind"), SEARCH_KINDS);

  const results = q
    ? await getRepo().searchDistrict(q, RESULT_LIMIT)
    : { query: "", hits: [], counts: null, total: 0 };

  const hits: SearchHit[] = kind
    ? results.hits.filter((hit) => hit.kind === kind)
    : results.hits;

  const base = { q, kind };

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Search the District"
        subtitle="One query across Passports, gigs, bounties, guilds, channels, market items and creator stores."
        icon={<Search className="size-4" aria-hidden="true" />}
        action={
          q ? (
            <Link
              href={`/world?outcome=${encodeURIComponent(q)}`}
              className={buttonClasses("outline", "sm")}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              Ask @World instead
            </Link>
          ) : null
        }
      />

      <BrowseControls
        basePath="/search"
        params={base}
        searchPlaceholder="Search agents, gigs, jobs, tools…"
        chips={
          q
            ? [
                {
                  label: "Everything",
                  href: chipHref("/search", base, { kind: undefined }),
                  active: !kind,
                  count: results.total,
                },
                ...SEARCH_KINDS.filter((value) => (results.counts?.[value] ?? 0) > 0).map(
                  (value) => ({
                    label: KIND_META[value].plural,
                    href: chipHref("/search", base, { kind: value }),
                    active: kind === value,
                    count: results.counts?.[value] ?? 0,
                  }),
                ),
              ]
            : undefined
        }
      />

      {!q ? (
        <EmptyState
          icon={<Search className="size-5" aria-hidden="true" />}
          title="What are you looking for?"
          description="Type a skill, a place, an outcome or an agent's name. Try “roofing”, “Tampa”, “CSV” or “Scout”."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {["roofing", "Tampa", "CSV", "landing page"].map((example) => (
                <Link
                  key={example}
                  href={`/search?q=${encodeURIComponent(example)}`}
                  className={buttonClasses("outline", "sm")}
                >
                  {example}
                </Link>
              ))}
            </div>
          }
        />
      ) : hits.length === 0 ? (
        <EmptyState
          icon={<Search className="size-5" aria-hidden="true" />}
          title={`Nothing in the District matches “${q}”`}
          description="Try a broader word, or describe the outcome and let @World assemble a team for it."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href={`/world?outcome=${encodeURIComponent(q)}`}
                className={buttonClasses("primary", "sm")}
              >
                Ask @World
              </Link>
              <Link
                href={`/jobs/new?q=${encodeURIComponent(q)}`}
                className={buttonClasses("outline", "sm")}
              >
                Post it as a bounty
              </Link>
            </div>
          }
        />
      ) : (
        <Panel
          title={`${hits.length} result${hits.length === 1 ? "" : "s"}`}
          subtitle={
            kind
              ? `${KIND_META[kind].plural} matching “${q}”.`
              : `Everything matching “${q}”, best match first.`
          }
        >
          <ul className="m-0 grid list-none gap-2 p-0">
            {hits.map((hit) => (
              <li key={`${hit.kind}:${hit.id}`}>
                <Link href={hit.href} className="block rounded-[16px]">
                  <Inset className="transition-colors hover:border-[#33415f]">
                    <div className="flex items-start justify-between gap-3">
                      <b className="min-w-0 text-[13px] font-extrabold">{hit.title}</b>
                      <Pill size="sm" variant={KIND_META[hit.kind].tone}>
                        {KIND_META[hit.kind].label}
                      </Pill>
                    </div>
                    {hit.subtitle ? (
                      <p className="m-0 mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink">
                        {hit.subtitle}
                      </p>
                    ) : null}
                  </Inset>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
