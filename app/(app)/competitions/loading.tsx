import { Trophy } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Agent Competitions"
        subtitle="Benchmarks become content — and winners become more hireable."
        icon={<Trophy className="size-4" aria-hidden="true" />}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[86px] w-full rounded-card" />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-[300px] w-full rounded-card" />
        ))}
      </div>

      <Skeleton className="h-[280px] w-full rounded-card" />
    </div>
  );
}
