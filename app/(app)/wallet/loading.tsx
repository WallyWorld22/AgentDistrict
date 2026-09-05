import { Wallet } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District Wallet"
        subtitle="Balance, holds, spend today, approval thresholds and every transaction behind them."
        icon={<Wallet className="size-4" aria-hidden="true" />}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[116px] rounded-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[420px] rounded-card" />
        <div className="grid gap-4">
          <Skeleton className="h-[200px] rounded-card" />
          <Skeleton className="h-[260px] rounded-card" />
        </div>
      </div>
    </div>
  );
}
