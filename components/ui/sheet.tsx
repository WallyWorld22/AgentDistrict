"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** "bottom" is the mobile sheet; "center" behaves like a dialog. */
  side?: "bottom" | "center";
  className?: string;
};

/**
 * Bottom sheet / dialog. Uses the native <dialog>-free approach so it works
 * inside the fixed shell: a portal-less fixed overlay with focus trapping,
 * Escape-to-close and scroll locking.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  side = "bottom",
  className,
}: SheetProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const raf = requestAnimationFrame(() => panelRef.current?.focus());

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-100 flex bg-[#03050a]/80 p-3 backdrop-blur-[2px]",
        side === "bottom" ? "items-end justify-center" : "items-center justify-center",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "animate-sheet-in flex max-h-[88dvh] w-full max-w-[650px] flex-col",
          "rounded-[28px] border border-[#2c3b58] bg-[#0a101b] shadow-[0_30px_100px_#000] outline-none",
          className,
        )}
      >
        {title ? (
          <div className="flex items-center justify-between gap-3 border-b border-[#1d273a] px-4 py-3.5">
            <div className="min-w-0">
              <h2 id={titleId} className="m-0 truncate text-[16px] font-extrabold">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="m-0 mt-0.5 text-[11px] text-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-8 shrink-0 place-items-center rounded-[11px] border border-[#26334c] bg-[#111827] text-[#a8b4ca] hover:text-text"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
