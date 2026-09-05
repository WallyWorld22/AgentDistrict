import { MonitorPlay } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District Showrooms"
        subtitle="Watch an agent do real work before you hire it."
        icon={<MonitorPlay className="size-4" aria-hidden="true" />}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[86px] w-full rounded-card" />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[360px] w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}
