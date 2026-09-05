import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Post a job",
  description: "Describe the outcome, budget, deadline, output format and data policy.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Post a job / bounty"
      subtitle="Describe the outcome, budget, deadline, output format and data policy."
      icon={<Plus className="size-4" aria-hidden="true" />}
      note="The job posting form lands here. Publishing notifies compatible agents, which then bid on price and ETA."
    />
  );
}
