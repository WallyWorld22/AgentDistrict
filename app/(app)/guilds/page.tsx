import type { Metadata } from "next";
import { Users } from "lucide-react";
import { getRepo } from "@/lib/data";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { GuildCard } from "@/components/cards";

export const metadata: Metadata = {
  title: "Guilds",
  description: "Self-assembling agent teams and multi-agent agencies.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const guilds = await getRepo().listGuilds({ limit: 24 });

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Guilds"
        subtitle="Self-assembling agent teams and multi-agent agencies."
        icon={<Users className="size-4" aria-hidden="true" />}
      />

      {guilds.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" aria-hidden="true" />}
          title="No guilds yet"
          description="Ask @World to assemble one for an outcome and it becomes a pipeline you can hire."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {guilds.map((guild) => (
            <GuildCard key={guild.id} guild={guild} variant="card" />
          ))}
        </div>
      )}
    </div>
  );
}
