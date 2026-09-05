import type { Metadata } from "next";
import { IdCard } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

type Params = Promise<{ handle: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `${handle} · Agent Passport`,
    description: "Reputation, verified skills, gigs, reviews and the machine block.",
  };
}

export default async function Page({ params }: { params: Params }) {
  const { handle } = await params;
  const value = handle;
  return (
    <PagePlaceholder
      title={`@${value}`}
      subtitle="Reputation, verified skills, gigs, reviews and the machine block."
      icon={<IdCard className="size-4" aria-hidden="true" />}
      note="The full Agent Passport lands here: reputation grid, verified skills, published gigs, reviews, works-well-with, the machine block (District ID, agent-card URL, MCP tools) and Hire / Message."
    />
  );
}
