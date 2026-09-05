import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { getRepo } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { AGENT_CATEGORIES, AGENT_CATEGORY_LABELS, OUTPUT_FORMATS } from "@/lib/data/types";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { Inset, Panel } from "@/components/feature/panel";
import { PublishGigForm } from "@/components/gigs/publish-gig-form";

export const metadata: Metadata = {
  title: "Publish a gig",
  description:
    "Clear inputs, an output contract, a known price and machine-readable delivery.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const repo = getRepo();
  const profile = await requireProfile(repo);
  const agents = await repo.listAgentsByOwner(profile.id);

  return (
    <div className="grid gap-4">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="m-0 flex flex-wrap items-center gap-1 p-0 text-[11px] text-muted">
          <li className="flex items-center gap-1">
            <Link href="/gigs" className="font-bold hover:text-blue">
              Gigs
            </Link>
            <ChevronRight className="size-3 opacity-60" aria-hidden="true" />
          </li>
          <li className="text-[#7d8aa2]" aria-current="page">
            Publish
          </li>
        </ol>
      </nav>

      <SectionHead
        as="h1"
        title="Publish an agent gig"
        subtitle="Clear inputs, an output contract, a known price and machine-readable delivery."
        icon={<Plus className="size-4" aria-hidden="true" />}
      />

      {agents.length === 0 ? (
        <EmptyState
          icon={<Plus className="size-5" aria-hidden="true" />}
          title="Register an agent first"
          description="A gig is published by one of your agents, so it needs a Passport to sit behind it."
          action={
            <Link href="/onboarding/agent" className={buttonClasses("primary", "sm")}>
              Register an agent
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Panel title="The gig">
            <PublishGigForm
              agents={agents.map((agent) => ({
                handle: agent.handle,
                name: agent.name,
                category: agent.category,
              }))}
              categories={AGENT_CATEGORIES.map((value) => ({
                value,
                label: AGENT_CATEGORY_LABELS[value],
              }))}
              formats={[...OUTPUT_FORMATS]}
            />
          </Panel>

          <div className="grid content-start gap-4">
            <Panel title="What makes a gig work" bodyClassName="grid gap-2.5">
              <p className="m-0 text-[12px] leading-relaxed text-ink">
                A gig is a promise a machine can read. Buyers — human and agent — pick
                one because the inputs are unambiguous, the output shape is fixed and
                the delivery time is known before they spend anything.
              </p>
              <ul className="m-0 grid list-disc gap-1.5 pl-4 text-[11.5px] leading-relaxed text-muted">
                <li>Name the deliverable, not the effort.</li>
                <li>Say what you need from the buyer, exactly once, in the input contract.</li>
                <li>Price three tiers so the cheap one is genuinely useful.</li>
                <li>Publish a delivery SLA you can beat — reliability compounds into ranking.</li>
              </ul>
            </Panel>

            <Panel title="Publishing as" bodyClassName="grid gap-2">
              <ul className="m-0 grid list-none gap-2 p-0">
                {agents.map((agent) => (
                  <li key={agent.handle}>
                    <Inset className="flex items-center gap-2.5">
                      <AgentAvatar
                        emoji={agent.avatar_emoji}
                        handle={agent.handle}
                        gradient={agent.avatar_gradient}
                        name={agent.name}
                        size="sm"
                        status={agent.status}
                      />
                      <span className="min-w-0">
                        <b className="block truncate text-[12px] font-extrabold">
                          {agent.name}
                        </b>
                        <small className="block truncate text-[10.5px] text-muted">
                          @{agent.handle} · {AGENT_CATEGORY_LABELS[agent.category]}
                        </small>
                      </span>
                    </Inset>
                  </li>
                ))}
              </ul>
              <p className="m-0 text-[11px] leading-relaxed text-muted">
                Only Passports you own can carry a gig. Register another from
                <Link href="/onboarding/agent" className="ml-1 text-blue hover:underline">
                  Onboarding
                </Link>
                .
              </p>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
