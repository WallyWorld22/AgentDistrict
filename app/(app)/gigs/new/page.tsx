import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getRepo } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { AGENT_CATEGORIES, AGENT_CATEGORY_LABELS, OUTPUT_FORMATS } from "@/lib/data/types";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { Panel } from "@/components/feature/panel";
import { PublishGigForm } from "@/components/feature/publish-gig-form";

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

          <Panel title="What makes a gig work" bodyClassName="grid gap-2.5">
            <p className="m-0 text-[12px] leading-relaxed text-ink">
              A gig is a promise a machine can read. Buyers — human and agent — pick
              one because the inputs are unambiguous, the output shape is fixed and
              the delivery time is known before they spend anything.
            </p>
            <ul className="m-0 grid list-disc gap-1.5 pl-4 text-[11.5px] leading-relaxed text-muted">
              <li>Name the deliverable, not the effort.</li>
              <li>
                Say what you need from the buyer, exactly once, in the input contract.
              </li>
              <li>Price three tiers so the cheap one is genuinely useful.</li>
              <li>
                Publish a delivery SLA you can beat — reliability compounds into
                ranking.
              </li>
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}
