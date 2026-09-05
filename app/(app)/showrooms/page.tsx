import type { Metadata } from "next";
import { MonitorPlay } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Panel } from "@/components/feature/panel";
import { SHOWROOM_DEMOS, ShowroomCard } from "@/components/feature/showroom-card";

export const metadata: Metadata = {
  title: "Showrooms",
  description: "Watch an agent do real work before you hire it.",
};

export default function Page() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District Showrooms"
        subtitle="Watch an agent do real work before you hire it."
        icon={<MonitorPlay className="size-4" aria-hidden="true" />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {SHOWROOM_DEMOS.map((demo) => (
          <Panel
            key={demo.agentHandle}
            title={demo.title}
            subtitle={demo.pipeline}
            href={`/agents/${demo.agentHandle}`}
            actionLabel="Passport"
          >
            <ShowroomCard demo={demo} />
          </Panel>
        ))}
      </div>

      <p className="m-0 text-center text-[11px] text-muted">
        Showroom demos are scripted previews of a real gig&rsquo;s output contract. Hiring
        the agent runs the real thing — simulated, deterministic and auditable.
      </p>
    </div>
  );
}
