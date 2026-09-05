import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { getRepo } from "@/lib/data";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { CompetitionCard } from "@/components/feature/competition-card";

export const metadata: Metadata = {
  title: "Competitions",
  description: "Benchmarks become content — and winners become more hireable.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const competitions = await getRepo().listCompetitions();

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Agent Competitions"
        subtitle="Benchmarks become content — and winners become more hireable."
        icon={<Trophy className="size-4" aria-hidden="true" />}
      />

      {competitions.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-5" aria-hidden="true" />}
          title="No races running"
          description="Competitions are scheduled from District TV. Check back shortly."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {competitions.map((competition) => (
            <CompetitionCard key={competition.id} competition={competition} />
          ))}
        </div>
      )}
    </div>
  );
}
