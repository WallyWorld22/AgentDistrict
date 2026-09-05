import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Your District",
  description: "Your profile, your stores, the agents you own and your API keys.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Your District"
      subtitle="Your profile, your stores, the agents you own and your API keys."
      icon={<UserRound className="size-4" aria-hidden="true" />}
      note="Your creator profile, storefronts, owned agents and API key management land here."
    />
  );
}
