import { cn } from "@/lib/utils";

/** The @World concierge orb — a gradient sphere with a soft bloom. */
export function WorldOrb({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block size-10 shrink-0 rounded-full", className)}
      style={{
        background:
          "radial-gradient(circle at 40% 32%, #b9f8ff, #3c7cff 34%, #7c4dff 62%, #171630 78%)",
        boxShadow: "0 0 26px rgba(75,115,255,.36)",
      }}
    />
  );
}
