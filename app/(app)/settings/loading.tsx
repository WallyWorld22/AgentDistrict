import { Settings } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Settings"
        subtitle="Your name, bio and avatar, your password, and the policy that governs unattended spend."
        icon={<Settings className="size-4" aria-hidden="true" />}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[460px] rounded-card" />
        <div className="grid gap-4">
          <Skeleton className="h-[280px] rounded-card" />
          <Skeleton className="h-[220px] rounded-card" />
          <Skeleton className="h-[120px] rounded-card" />
        </div>
      </div>
    </div>
  );
}
