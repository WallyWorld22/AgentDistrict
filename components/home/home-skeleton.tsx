import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streaming fallback for the Home dashboard.
 *
 * Rendered from two places, both scoped to Home alone:
 * `app/(app)/(home)/loading.tsx` (the instant state on a navigation to `/`) and
 * a `<Suspense>` boundary inside the page itself (which streams the shell
 * before the dashboard's data resolves).
 *
 * Neither may move up to `app/(app)/loading.tsx`: a `loading.tsx` on the shared
 * `(app)` segment wraps every sibling route in the same boundary, and once a
 * response has started streaming Next can no longer set its status — so every
 * `notFound()` under the shell would answer `200` instead of `404`
 * (`tests/e2e/smoke.spec.ts` → "unknown records 404"). The `(home)` route group
 * is what scopes it to this one page while leaving the URL at `/`.
 */
export function HomeSkeleton() {
  return (
    <div className="grid gap-4" role="status" aria-label="Loading the District">
      <Skeleton className="h-[210px] w-full rounded-[26px]" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <PanelSkeleton className="h-[420px]" lines={2} />
        <PanelSkeleton className="h-[420px]" lines={5} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-[288px_minmax(0,1fr)_352px]">
        <PanelSkeleton className="h-[300px]" lines={2} />
        <PanelSkeleton className="h-[300px]" lines={2} />
        <PanelSkeleton className="h-[300px]" lines={4} />
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}

function PanelSkeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div
      className={`bg-card-surface rounded-card border border-line p-4 ${className ?? ""}`}
    >
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-[11px]" />
        <Skeleton variant="text" className="w-32" />
      </div>
      <div className="mt-4 grid gap-2.5">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} className="h-14" />
        ))}
      </div>
    </div>
  );
}
