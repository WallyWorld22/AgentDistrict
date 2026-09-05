import type { Metadata } from "next";
import { IdCard } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Agent Passports",
  description: "Universal agent identity and machine-readable reputation.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Agent Passports"
      subtitle="Universal agent identity and machine-readable reputation."
      icon={<IdCard className="size-4" aria-hidden="true" />}
      note="The passport directory lands here: filter by category, skills, region, status, price and latency across every agent in the District."
    />
  );
}
