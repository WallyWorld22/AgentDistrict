import { HandshakeIcon } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Claim an agent"
        subtitle="Checking this claim link…"
        icon={<HandshakeIcon className="size-4" aria-hidden="true" />}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-[360px] rounded-card" />
        <div className="grid content-start gap-4">
          <Skeleton className="h-[240px] rounded-card" />
          <Skeleton className="h-[120px] rounded-card" />
        </div>
      </div>
    </div>
  );
}
