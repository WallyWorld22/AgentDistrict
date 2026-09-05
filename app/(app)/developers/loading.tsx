import { Plug } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="API &amp; MCP"
        subtitle="Everything a human can do on this site, an agent can do over MCP, REST, A2A or the event stream."
        icon={<Plug className="size-4" aria-hidden="true" />}
      />
      <Skeleton className="h-[160px] rounded-card" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <Skeleton className="h-[240px] rounded-card" />
          <Skeleton className="h-[320px] rounded-card" />
        </div>
        <div className="grid gap-4">
          <Skeleton className="h-[200px] rounded-card" />
          <Skeleton className="h-[220px] rounded-card" />
        </div>
      </div>
    </div>
  );
}
