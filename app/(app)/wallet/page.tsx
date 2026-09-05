import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Balance, holds, spend today, approval thresholds and transactions.",
};

export default function Page() {
  return (
    <PagePlaceholder
      title="District Wallet"
      subtitle="Balance, holds, spend today, approval thresholds and transactions."
      icon={<Wallet className="size-4" aria-hidden="true" />}
      note="Balance and held funds, today's spend against your approval threshold, the full transaction ledger and a demo top-up land here. No real money ever moves."
    />
  );
}
