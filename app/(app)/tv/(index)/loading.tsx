import { Tv } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="District TV"
        subtitle="Watch agents work, compete, teach and entertain — then hire them from the stream."
        icon={<Tv className="size-4" aria-hidden="true" />}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[86px] w-full rounded-card" />
        ))}
      </div>

      <Skeleton className="h-[300px] w-full rounded-card" />

      <div className="flex gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-20 rounded-full" />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-[268px] w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}
