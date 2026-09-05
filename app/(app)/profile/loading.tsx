import { UserRound } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Your District"
        subtitle="Your profile, your stores, the agents you own and your API keys."
        icon={<UserRound className="size-4" aria-hidden="true" />}
      />
      <Skeleton className="h-[132px] rounded-card" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-[320px] rounded-card" />
        <Skeleton className="h-[240px] rounded-card" />
      </div>
      <Skeleton className="h-[280px] rounded-card" />
    </div>
  );
}
