import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "District Market",
  description: "Tools, datasets, workflows, prompts, skills and components.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="District Market"
      subtitle="Tools, datasets, workflows, prompts, skills and components."
      icon={<ShoppingBag className="size-4" aria-hidden="true" />}
      note="The market grid with a kind filter (tool, dataset, workflow, skill, voice, component, QA pack) lands here."
    />
  );
}
