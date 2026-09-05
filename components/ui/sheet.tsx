"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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
  /** Max width of the panel. */
  size?: "sm" | "md" | "lg";
  /** Sticky action row pinned under the scrollable body. */
  footer?: React.ReactNode;
  /** Set false to require an explicit action (no backdrop / Escape close). */
  dismissible?: boolean;
  className?: string;
};

const SIZES = {
  sm: "max-w-[420px]",
  md: "max-w-[650px]",
  lg: "max-w-[860px]",
} as const;

/** Stable arguments for the hydration flag below — must not be recreated. */
const NEVER_CHANGES = () => () => {};
const TRUE = () => true;
const FALSE = () => false;

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet / dialog, portalled to `document.body`.
 *
 * The portal is not cosmetic: `z-index` only orders siblings inside the same
 * stacking context, and the top bar is a `sticky z-30` element. Rendered in
 * place, a sheet opened from the top bar was trapped underneath the mobile
 * bottom nav (`z-50`) and its buttons could not be clicked at all.
 *
 * Accessibility: `role="dialog"` + `aria-modal`, labelled by the title,
 * described by the description, focus moved into the panel on open, Tab
 * cycles inside it, Escape closes, body scroll is locked, and focus returns
 * to the trigger on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  side = "bottom",
  size = "md",
  footer,
  dismissible = true,
  className,
}: SheetProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  // The portal target only exists in the browser. `useSyncExternalStore` gives
  // `false` for the server snapshot and `true` once hydrated, so this is a
  // hydration-safe "am I on the client" flag with no effect-driven re-render.
  const mounted = React.useSyncExternalStore(NEVER_CHANGES, TRUE, FALSE);

  // Keep the latest onClose without re-running the effect on every render.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissible) {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? panel).focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, dismissible]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      data-side={side}
      className={cn(
        "animate-fade-in fixed inset-0 z-100 flex bg-[#03050a]/80 p-3 backdrop-blur-[2px]",
        side === "bottom" ? "items-end justify-center" : "items-center justify-center",
      )}
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        aria-label={title ? undefined : "Dialog"}
        tabIndex={-1}
        className={cn(
          "animate-sheet-in flex max-h-[88dvh] w-full flex-col",
          "rounded-[28px] border border-[#2c3b58] bg-[#0a101b] shadow-[0_30px_100px_#000] outline-none",
          SIZES[size],
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
            {dismissible ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={cn(
                  // 40px: comfortably above the WCAG 2.2 target-size floor on
                  // touch, where this is the primary way out of the sheet.
                  "grid size-10 shrink-0 place-items-center rounded-[11px] border border-[#26334c]",
                  "bg-[#111827] text-[#a8b4ca] transition-colors hover:border-[#3d4d73] hover:text-text",
                )}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

        {footer ? (
          <div className="border-t border-[#1d273a] p-3.5">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
