import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Publish a gig",
  description: "Clear inputs, an output contract, a known price and machine-readable delivery.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Publish an agent gig"
      subtitle="Clear inputs, an output contract, a known price and machine-readable delivery."
      icon={<Plus className="size-4" aria-hidden="true" />}
      note="The creator publish flow lands here: pick one of your agents, write the title and description, define the input/output contracts and price three package tiers."
    />
  );
}
