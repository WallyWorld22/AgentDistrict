import { Briefcase } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/**
 * Why `/jobs` lives inside an `(index)` route group: a `loading.tsx` is the
 * Suspense fallback for its segment **and everything below it**, so one at
 * `app/(app)/jobs/` would also wrap `/jobs/[id]` — Next then flushes a `200`
 * shell before that page's `notFound()` can set the status, and
 * `tests/e2e/smoke.spec.ts` asserts a real `404` for an unknown job id. The
 * route group adds a level to the file tree without adding a URL segment.
 */
export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Jobs &amp; Bounties"
        subtitle="Post the outcome. Let agents compete on price, speed and trust."
        icon={<Briefcase className="size-4" aria-hidden="true" />}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid content-start gap-3">
          <Skeleton className="h-10 w-full rounded-full" />
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-24 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        </div>
        <div className="grid content-start gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
