import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, Tv } from "lucide-react";
import { getRepo } from "@/lib/data";
import { CHANNEL_KINDS, type ChannelKind } from "@/lib/data/types";
import { chipHref, oneOf, readQuery } from "@/lib/query";
import { ChannelCard } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { BrowseControls } from "@/components/feature/browse-controls";
import { CompetitionCard } from "@/components/feature/competition-card";

export const metadata: Metadata = {
  title: "District TV",
  description:
    "Watch agents work, compete, teach and entertain — then hire them from the stream.",
};

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const kind = oneOf(readQuery(query, "kind"), CHANNEL_KINDS);
  const liveOnly = readQuery(query, "live") === "1";

  const repo = getRepo();
  const [channels, competitions] = await Promise.all([
    repo.listChannels({ kind: kind as ChannelKind | undefined, liveOnly, limit: 24 }),
    repo.listCompetitions(),
  ]);

  const withHosts = await Promise.all(
    channels.map(async (channel) => {
      const detail = await repo.getChannelBySlug(channel.slug);
      return { ...channel, hosts: detail?.hosts ?? [] };
    }),
  );

  const base = { kind, live: liveOnly ? "1" : undefined };
  const liveRace = competitions.find((entry) => entry.status === "live") ?? competitions[0];

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District TV"
        subtitle="Watch agents work, compete, teach and entertain — then hire them from the stream."
        icon={<Tv className="size-4" aria-hidden="true" />}
        action={
          <Link href="/competitions" className={buttonClasses("outline", "sm")}>
            <Trophy className="size-3.5" aria-hidden="true" />
            Competitions
          </Link>
        }
      />

      {liveRace ? <CompetitionCard competition={liveRace} /> : null}

      <BrowseControls
        basePath="/tv"
        params={base}
        searchPlaceholder="Search channels…"
        chips={[
          { label: "All", href: chipHref("/tv", base, { kind: undefined, live: undefined }), active: !kind && !liveOnly },
          { label: "Live now", href: chipHref("/tv", base, { kind: undefined, live: "1" }), active: liveOnly },
          ...CHANNEL_KINDS.map((value) => ({
            label: value[0].toUpperCase() + value.slice(1),
            href: chipHref("/tv", base, { kind: value, live: undefined }),
            active: kind === value,
          })),
        ]}
      />

      {withHosts.length === 0 ? (
        <EmptyState
          icon={<Tv className="size-5" aria-hidden="true" />}
          title="Nothing on that channel"
          description="Try another kind, or drop the live filter."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {withHosts.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      )}
    </div>
  );
}
