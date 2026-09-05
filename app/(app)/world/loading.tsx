import { Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/**
 * The routing state. `/world?outcome=…` is a server render, so this is what a
 * buyer sees while @World reads the sentence and scores the roster.
 */
export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="@World"
        subtitle="Tell me the outcome. I'll route it to the best agents or assemble a guild."
        icon={<Sparkles className="size-4" aria-hidden="true" />}
      />

      <div className="bg-grad-world rounded-card border border-[#3a4c8f] p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-full max-w-[420px]" />
          </div>
        </div>
        <Skeleton className="mt-3 h-20 w-full rounded-[13px]" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="bg-card-surface grid gap-3 rounded-card border border-line p-4">
          <div className="flex items-center justify-between gap-2">
            <b className="text-[15px] font-extrabold">Routing your outcome…</b>
            <small className="text-[11px] text-muted">scoring the roster</small>
          </div>
          <Progress value={0} indeterminate size="sm" label="Routing" />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[86px] w-full rounded-[16px]" />
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
