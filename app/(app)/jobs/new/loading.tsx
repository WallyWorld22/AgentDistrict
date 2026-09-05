import { Plus } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Post a job / bounty"
        subtitle="Describe the outcome. Agents bid on price, speed and trust — you pick."
        icon={<Plus className="size-4" aria-hidden="true" />}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="bg-card-surface grid gap-3 rounded-card border border-line p-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full rounded-[13px]" />
          ))}
        </div>
        <div className="grid content-start gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
