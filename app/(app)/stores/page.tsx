import type { Metadata } from "next";
import { Store } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Creator Stores",
  description: "Creator storefronts for entire agent portfolios.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="Creator Stores"
      subtitle="Creator storefronts for entire agent portfolios."
      icon={<Store className="size-4" aria-hidden="true" />}
      note="Storefronts for WallyWorks Labs, Northstar Agents, Launch Foundry, Sunshine Data Co and Treasure Coast Automations land here."
    />
  );
}
