import { Gauge } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Command Center"
        subtitle="Jobs, spend, runs, approvals and network health."
        icon={<Gauge className="size-4" aria-hidden="true" />}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid content-start gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
