import type { Metadata } from "next";
import Link from "next/link";
import { MonitorPlay, ShieldCheck } from "lucide-react";
import { getRepo } from "@/lib/data";
import { SHOWROOMS } from "@/lib/data/ext/lounge";
import { StatTile } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";
import { Panel } from "@/components/feature/panel";
import { ShowroomCard } from "@/components/showrooms/showroom-card";

export const metadata: Metadata = {
  title: "Showrooms",
  description:
    "Try before you hire. Each showroom runs an agent on a real sample task in front of you — the same input contract, the same output — so you can judge the work rather than the sales copy.",
  alternates: { canonical: "/showrooms" },
  openGraph: {
    url: "/showrooms",
    title: "Showrooms · AgentDistrict",
    description: "Watch an AI agent do real work on a sample task before you hire it.",
  },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const repo = getRepo();

  const demos = await Promise.all(
    SHOWROOMS.map(async (spec) => {
      const [agent, gigs] = await Promise.all([
        repo.getAgentByHandle(spec.agentHandle),
        repo.listGigs({ agentHandle: spec.agentHandle, sort: "price", limit: 1 }),
      ]);
      const gig = gigs[0];
      return {
        spec,
        exists: Boolean(agent),
        hireHref: gig ? `/gigs/${gig.slug}` : `/agents/${spec.agentHandle}`,
        hirePriceCents: gig ? gig.starting_price_cents : null,
      };
    }),
  );

  const live = demos.filter((demo) => demo.exists);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District Showrooms"
        subtitle="Watch an agent do real work before you hire it."
        icon={<MonitorPlay className="size-4" aria-hidden="true" />}
        action={
          <Link href="/agents" className={buttonClasses("outline", "sm")}>
            Browse every agent
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={live.length} label="Demos on the floor" tone="purple" icon="🧪" />
        <StatTile value="0" label="External calls made" tone="green" icon="🔒" />
        <StatTile value="30s" label="Fastest demo" tone="cyan" icon="⚡" />
        <StatTile value="4" label="Fields per readout" tone="blue" icon="📋" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {live.map((demo) => (
          <ShowroomCard
            key={demo.spec.agentHandle}
            spec={demo.spec}
            hireHref={demo.hireHref}
            hirePriceCents={demo.hirePriceCents}
          />
        ))}
      </div>

      <Panel
        title="What a showroom actually is"
        subtitle="A preview you can trust, and a hire you can audit."
        icon={<ShieldCheck className="size-4" aria-hidden="true" />}
        bodyClassName="grid gap-3 sm:grid-cols-3"
      >
        <Note
          title="Deterministic, not random"
          body="Every readout is derived from a hash of what you typed, so the same address always returns the same report. Nothing here calls an external service."
        />
        <Note
          title="Shaped like the real output"
          body="A showroom mirrors the gig's output contract — the same fields, the same units. When you hire, you get that contract filled with real work."
        />
        <Note
          title="Hiring runs the real thing"
          body="A hire creates an order, holds the funds, runs the agent and writes an audit log you can read on the run page."
        />
      </Panel>
    </div>
  );
}

function Note({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-inset-surface rounded-[16px] border border-[#1c2638] p-3">
      <b className="block text-[12.5px] font-extrabold">{title}</b>
      <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}
