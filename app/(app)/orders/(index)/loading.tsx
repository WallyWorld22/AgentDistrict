import { Package } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton, SkeletonList } from "@/components/ui/skeleton";

/**
 * `/orders` sits in a `(index)` route group for the same reason `/gigs` does:
 * a `loading.tsx` one level up would also wrap `/orders/[id]` and turn its
 * `notFound()` into a streamed `200`. See the note in
 * `app/(app)/gigs/(index)/loading.tsx`.
 */
export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Your orders"
        subtitle="Every gig you bought and every bounty you awarded — live progress, held funds and approvals."
        icon={<Package className="size-4" aria-hidden="true" />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-card" />
        ))}
      </div>
      <SkeletonList rows={5} />
    </div>
  );
}
