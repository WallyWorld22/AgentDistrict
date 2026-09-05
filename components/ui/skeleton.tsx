import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-[12px] bg-[#131b2b]",
        "after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r",
        "after:from-transparent after:via-white/6 after:to-transparent",
        "after:animate-[ad-shimmer_1.6s_infinite]",
        className,
      )}
    />
  );
}

/** Convenience block for list placeholders. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );
}
