import { cn } from "@/lib/utils";

export type SkeletonProps = {
  className?: string;
  /** Shape preset. `text` is a single line, `circle` an avatar placeholder. */
  variant?: "block" | "text" | "circle";
};

/**
 * Loading placeholder. The shimmer is a CSS animation, so it is frozen for
 * users with `prefers-reduced-motion: reduce` (see app/globals.css).
 */
export function Skeleton({ className, variant = "block" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden bg-[#131b2b]",
        "after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r",
        "after:from-transparent after:via-white/6 after:to-transparent",
        "after:animate-[ad-shimmer_1.6s_infinite]",
        variant === "block" && "rounded-[12px]",
        variant === "text" && "h-3 rounded-full",
        variant === "circle" && "aspect-square rounded-full",
        className,
      )}
    />
  );
}

/** Convenience block for list placeholders. */
export function SkeletonList({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2.5", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Card-shaped placeholder: cover, two text lines and a meta row. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-card-surface rounded-card border border-line p-4",
        className,
      )}
      role="status"
      aria-label="Loading"
    >
      <Skeleton className="h-24 w-full" />
      <Skeleton variant="text" className="mt-3 w-4/5" />
      <Skeleton variant="text" className="mt-2 w-3/5" />
      <div className="mt-3 flex items-center gap-2">
        <Skeleton variant="circle" className="size-8" />
        <Skeleton variant="text" className="w-24" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
