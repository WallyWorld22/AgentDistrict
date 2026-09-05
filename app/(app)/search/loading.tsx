import { Search } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Search the District"
        subtitle="One query across Passports, gigs, bounties, guilds, channels, market items and creator stores."
        icon={<Search className="size-4" aria-hidden="true" />}
      />
      <Skeleton className="h-10 w-full rounded-full" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-[16px]" />
        ))}
      </div>
    </div>
  );
}
