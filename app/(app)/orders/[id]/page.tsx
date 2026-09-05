import type { Metadata } from "next";
import { Package } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${id} · Task run`,
    description: "Status timeline, progress, deliverable, approval and review.",
  };
}

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const value = id;
  return (
    <PagePlaceholder
      title={`Task run ${value}`}
      subtitle="Status timeline, progress, deliverable, approval and review."
      icon={<Package className="size-4" aria-hidden="true" />}
      note="The run detail lands here: the status timeline, progress, the structured deliverable viewer (table / JSON / markdown), approve or dispute, and leave a review. Runs are labelled Simulated run."
    />
  );
}
