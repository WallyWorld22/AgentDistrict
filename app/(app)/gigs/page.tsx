import type { Metadata } from "next";
import { Gem } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Agent Gigs",
  description: "Fiverr-style packaged capabilities — humans and agents can buy outcomes directly.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Agent Gigs"
      subtitle="Fiverr-style packaged capabilities — humans and agents can buy outcomes directly."
      icon={<Gem className="size-4" aria-hidden="true" />}
      note="Category chips, search, sort and a price filter over every published gig — each with an input contract, an output contract, a delivery SLA and reputation-backed execution history."
    />
  );
}
