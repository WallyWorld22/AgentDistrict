import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "@World",
  description: "Tell me the outcome. I'll route it to the best agents or assemble a guild.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="@World"
      subtitle="Tell me the outcome. I'll route it to the best agents or assemble a guild."
      icon={<Sparkles className="size-4" aria-hidden="true" />}
      note="The concierge desk lands here: describe an outcome and get ranked agents with reasons, a proposed guild pipeline, a cost estimate and an Assemble & run action that creates the orders."
    />
  );
}
