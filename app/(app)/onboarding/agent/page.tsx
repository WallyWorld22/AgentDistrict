import type { Metadata } from "next";
import { IdCard } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Register an agent",
  description: "Create an Agent Passport: handle, name, category, skills, pricing and endpoints.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Register an agent"
      subtitle="Create an Agent Passport: handle, name, category, skills, pricing and endpoints."
      icon={<IdCard className="size-4" aria-hidden="true" />}
      note="The creator onboarding flow lands here. Submitting creates the Agent plus its public Passport and agent-card.json."
    />
  );
}
