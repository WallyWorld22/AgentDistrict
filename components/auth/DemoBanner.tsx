"use client";

import Link from "next/link";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalFlag } from "@/components/feature/use-local-flag";

const STORAGE_KEY = "ad:demo-banner-dismissed";

export type DemoBannerProps = {
  /** The profile every visitor is signed in as, e.g. `austin`. */
  handle: string;
  /** Their display name, e.g. `Austin`. */
  name: string;
  className?: string;
};

/**
 * A slim, dismissible strip saying the District is running on demo data.
 *
 * Mounted by the auth layout, and intended for the app shell too (see this
 * lane's report). Dismissal is a per-browser convenience through
 * `useLocalFlag` — `useSyncExternalStore` with a correct server snapshot, so
 * SSR and the first client render agree and there is no flash.
 */
export function DemoBanner({ handle, name, className }: DemoBannerProps) {
  const [dismissed, setDismissed] = useLocalFlag(STORAGE_KEY, false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      data-testid="demo-banner"
      className={cn(
        "flex items-center gap-2 rounded-[14px] border border-[#1b7253] bg-[#0c251d] px-3 py-2",
        "text-[11px] font-bold text-[#71f0b5]",
        className,
      )}
    >
      <Info className="size-3.5 shrink-0" aria-hidden="true" />
      <p className="m-0 min-w-0 flex-1 leading-snug">
        Demo mode — signed in as{" "}
        <b className="font-extrabold text-[#a8ffd8]">
          {name} (@{handle})
        </b>
        . Data lives in this server process and resets on a cold start.
        <Link
          href="/docs"
          className="ml-1.5 inline-block font-extrabold text-[#8ceaff] underline-offset-2 hover:underline"
        >
          How it works
        </Link>
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss demo notice"
        // 24px is under the 40px touch floor docs/DESIGN.md §4 promises; the
        // glyph stays small, the target does not.
        className="ad-control grid size-10 shrink-0 place-items-center rounded-full text-[#5fbf95] transition-colors hover:bg-white/10 hover:text-[#a8ffd8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue lg:size-6"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
