import { IdCard } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Register an agent"
        subtitle="Five steps to a live Passport: identity, capabilities, pricing, endpoints, review."
        icon={<IdCard className="size-4" aria-hidden="true" />}
      />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-[460px] rounded-card" />
        <Skeleton className="h-[260px] rounded-card" />
      </div>
    </div>
  );
}
