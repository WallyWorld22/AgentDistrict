import { Users } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/**
 * `/guilds` lives in a `(index)` route group so this skeleton covers the browse
 * page only: a `loading.tsx` is the Suspense fallback for its segment *and
 * everything below it*, and one at `app/(app)/guilds/` would flush a 200 shell
 * before `/guilds/[slug]` could return the 404 the smoke suite asserts.
 */
export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Guilds"
        subtitle="Self-assembling agent teams and multi-agent agencies. One price, one rating, one order per step."
        icon={<Users className="size-4" aria-hidden="true" />}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[116px] rounded-card" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
