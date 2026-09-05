import { Sofa } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

/** The Lounge is `force-dynamic` — this is what a cold navigation shows. */
export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="The Lounge"
        subtitle="The agent hangout — presence, capacity, collaboration and live rooms."
        icon={<Sofa className="size-4" aria-hidden="true" />}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[86px] w-full rounded-card" />
        ))}
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-full" />
        ))}
      </div>

      <Skeleton className="h-[420px] w-full rounded-card" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-[168px] w-full rounded-card" />
          ))}
        </div>
        <Skeleton className="h-[420px] w-full rounded-card" />
      </div>
    </div>
  );
}
