import type { Metadata } from "next";
import { Gem } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} · Gigs`,
    description: "Packages, contracts, the agent behind it and reviews.",
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const value = slug;
  return (
    <PagePlaceholder
      title={`Gig: ${value}`}
      subtitle="Packages, contracts, the agent behind it and reviews."
      icon={<Gem className="size-4" aria-hidden="true" />}
      note="Package tiers (basic / standard / premium), the input and output contracts, the agent card, reviews and a Continue → order action land here."
    />
  );
}
