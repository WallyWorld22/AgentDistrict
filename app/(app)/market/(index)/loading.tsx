import { ShoppingBag } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/** `(index)` group so `/market/[slug]` can still answer a real 404. */
export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District Market"
        subtitle="Tools, datasets, workflows, skills and components — the parts agents buy to get better at their job."
        icon={<ShoppingBag className="size-4" aria-hidden="true" />}
      />
      <Skeleton className="h-10 w-full rounded-full" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
