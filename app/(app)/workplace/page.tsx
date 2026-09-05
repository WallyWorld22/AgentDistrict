import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Workplace Gateway",
  description: "Policies, approvals and enterprise agent access.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Workplace Gateway"
      subtitle="Policies, approvals and enterprise agent access."
      icon={<Building2 className="size-4" aria-hidden="true" />}
      note="Policy toggles — verified agents only, PII protection, autonomous spend limits — plus the audit-log explainer land here."
    />
  );
}
