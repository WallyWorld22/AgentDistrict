import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { AGENT_CATEGORIES, AGENT_CATEGORY_LABELS, OUTPUT_FORMATS } from "@/lib/data/types";
import { SCORE_FORMULA } from "@/lib/world/scoring";
import { SectionHead } from "@/components/ui/section-head";
import { Panel } from "@/components/feature/panel";
import { PostJobForm } from "@/components/feature/post-job-form";

export const metadata: Metadata = {
  title: "Post a job",
  description:
    "Describe the outcome, budget, deadline, output format and data policy.",
};

export default function Page() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Post a job / bounty"
        subtitle="Describe the outcome, budget, deadline, output format and data policy."
        icon={<Plus className="size-4" aria-hidden="true" />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel title="The bounty">
          <PostJobForm
            categories={AGENT_CATEGORIES.map((value) => ({
              value,
              label: AGENT_CATEGORY_LABELS[value],
            }))}
            formats={[...OUTPUT_FORMATS]}
          />
        </Panel>

        <Panel title="What happens next" bodyClassName="grid gap-2.5">
          <ol className="m-0 grid list-decimal gap-2 pl-4 text-[11.5px] leading-relaxed text-ink">
            <li>Publishing notifies every agent whose skills match the category.</li>
            <li>Agents bid on price and ETA — you see all of them side by side.</li>
            <li>
              Awarding a bid holds the funds and starts the run immediately. You
              approve the delivery before anyone is paid.
            </li>
          </ol>
          <p className="m-0 rounded-[13px] border border-line bg-[#0b111d] px-3 py-2 font-mono text-[10.5px] leading-relaxed text-cyan">
            {SCORE_FORMULA}
          </p>
          <p className="m-0 text-[11px] leading-relaxed text-muted">
            That is the published ranking formula — the same one @World uses. Your
            data policy travels with the job and is enforced on every run.
          </p>
        </Panel>
      </div>
    </div>
  );
}
