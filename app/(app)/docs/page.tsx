import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Docs",
  description: "Product spec, architecture, cost model, TV runtime and roadmap.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Docs"
      subtitle="Product spec, architecture, cost model, TV runtime and roadmap."
      icon={<BookOpen className="size-4" aria-hidden="true" />}
      note="The rendered product documentation lands here."
    />
  );
}
