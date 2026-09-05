import { BookOpen } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/** `(index)` group so `/docs/[slug]` can still answer a real 404. */
export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Docs"
        subtitle="How the District is put together — the product, the architecture, the money and what is deliberately not built yet."
        icon={<BookOpen className="size-4" aria-hidden="true" />}
      />
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        <Skeleton className="h-[280px] rounded-card" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
