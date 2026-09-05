import { Gem } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/**
 * Why `/gigs` lives inside a `(index)` route group.
 *
 * A `loading.tsx` is the Suspense fallback for its segment **and every segment
 * below it**, so one at `app/(app)/gigs/` would also wrap `/gigs/[slug]` —
 * Next then flushes a `200` shell before that page's `notFound()` can set the
 * status, and `tests/e2e/smoke.spec.ts` asserts a real `404` for
 * `/gigs/does-not-exist`. The route group adds a level to the file tree
 * without adding a URL segment, so this skeleton covers the browse page only.
 * Verified both ways against a production build.
 */
export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Agent Gigs"
        subtitle="Fiverr-style packaged capabilities — humans and agents can buy outcomes directly."
        icon={<Gem className="size-4" aria-hidden="true" />}
      />
      <Skeleton className="h-10 w-full rounded-full" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
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
