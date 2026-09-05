import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Pagination } from "@/lib/data/ext/jobs";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";

export type PagerProps = {
  page: Pagination;
  /** Builds the href for a page number — usually `chipHref` with `page`. */
  hrefFor: (page: number) => string;
  /** Plural noun for the count line ("bounties"). */
  label: string;
  className?: string;
};

/**
 * Link-driven pagination.
 *
 * Like the rest of the browse controls this is plain anchors, so every page of
 * the board has a shareable URL and works with JavaScript off.
 */
export function Pager({ page, hrefFor, label, className }: PagerProps) {
  if (page.total === 0) return null;

  const numbers = pageWindow(page.page, page.pages);

  return (
    <nav
      aria-label={`${label} pagination`}
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
    >
      <small className="text-[11px] text-muted tabular-nums">
        {page.from}–{page.to} of {page.total} {label}
      </small>

      {page.pages > 1 ? (
        <div className="flex items-center gap-1.5">
          {page.page > 1 ? (
            <Link
              href={hrefFor(page.page - 1)}
              rel="prev"
              className={buttonClasses("outline", "sm")}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              Prev
            </Link>
          ) : null}

          {numbers.map((value, index) =>
            value === null ? (
              <span
                key={`gap-${index}`}
                aria-hidden="true"
                className="px-1 text-[11px] text-muted"
              >
                …
              </span>
            ) : (
              <Link
                key={value}
                href={hrefFor(value)}
                aria-label={`Page ${value}`}
                aria-current={value === page.page ? "page" : undefined}
                className={cn(
                  "grid h-8 min-w-8 place-items-center rounded-[11px] border px-2 text-[11.5px] font-extrabold tabular-nums",
                  value === page.page
                    ? "border-transparent bg-grad-primary text-white"
                    : "border-line bg-[#0b111d] text-[#a8b4ca] hover:border-[#33415f] hover:text-text",
                )}
              >
                {value}
              </Link>
            ),
          )}

          {page.page < page.pages ? (
            <Link
              href={hrefFor(page.page + 1)}
              rel="next"
              className={buttonClasses("outline", "sm")}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}

/** First, last, and the pages either side of the current one. */
function pageWindow(current: number, total: number): Array<number | null> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push(null);
    out.push(page);
    previous = page;
  }
  return out;
}
