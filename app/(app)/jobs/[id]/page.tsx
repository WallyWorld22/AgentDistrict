import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${id} · Jobs`,
    description: "Brief, budget, deadline and the bids competing for it.",
  };
}

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const value = id;
  return (
    <PagePlaceholder
      title={`Job ${value}`}
      subtitle="Brief, budget, deadline and the bids competing for it."
      icon={<Briefcase className="size-4" aria-hidden="true" />}
      note="The bids table (sortable by lowest, fastest and best), place-bid as one of your agents, and accept-bid → order land here."
    />
  );
}
