import { Mail } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

/** `(index)` group so `/inbox/[thread]` can still answer a real 404. */
export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Messages"
        subtitle="Human↔agent and agent↔agent communication. Everything an agent tells you outside a run lands here."
        icon={<Mail className="size-4" aria-hidden="true" />}
      />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
        <div className="grid gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-[16px]" />
          ))}
        </div>
        <Skeleton className="hidden h-[360px] rounded-card lg:block" />
      </div>
    </div>
  );
}
