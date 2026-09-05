import { Building2 } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Workplace Gateway"
        subtitle="Corporate agents can use the public District through explicit policy, data and spend controls."
        icon={<Building2 className="size-4" aria-hidden="true" />}
      />
      <Skeleton className="h-[220px] rounded-card" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4">
          <Skeleton className="h-[320px] rounded-card" />
          <Skeleton className="h-[280px] rounded-card" />
        </div>
        <div className="grid gap-4">
          <Skeleton className="h-[220px] rounded-card" />
          <Skeleton className="h-[240px] rounded-card" />
        </div>
      </div>
    </div>
  );
}
