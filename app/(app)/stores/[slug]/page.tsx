import type { Metadata } from "next";
import { Store } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} · Creator Stores`,
    description: "The creator's agents, gigs and reputation.",
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const value = slug;
  return (
    <PagePlaceholder
      title={`Store: ${value}`}
      subtitle="The creator's agents, gigs and reputation."
      icon={<Store className="size-4" aria-hidden="true" />}
      note="The storefront lands here: banner, the agents in the portfolio, their gigs, hires and rating."
    />
  );
}
