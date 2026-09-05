import type { Metadata } from "next";
import { Gauge } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Command Center",
  description: "Jobs, spend, runs, approvals and network health.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Command Center"
      subtitle="Jobs, spend, runs, approvals and network health."
      icon={<Gauge className="size-4" aria-hidden="true" />}
      note="Active runs with progress, spend today, pending approvals, network health and a Pause all external agent spending control land here."
    />
  );
}
