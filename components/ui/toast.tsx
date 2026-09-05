"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "default" | "success" | "error" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. `0` keeps it until dismissed. */
  duration?: number;
};

type ToastRecord = ToastInput & { id: string };

type ToastContextValue = {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** Mounted once by AppShell. Everything under it can call `useToast()`. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const counter = React.useRef(0);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: ToastInput) => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      setToasts((current) => [...current.slice(-3), { ...input, id }]);

      const duration = input.duration ?? 3200;
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider> (mounted in AppShell)");
  }
  return ctx;
}

const TONE_ICON: Record<ToastTone, React.ReactNode> = {
  default: <Info className="size-4 text-blue" aria-hidden="true" />,
  info: <Info className="size-4 text-blue" aria-hidden="true" />,
  success: <CheckCircle2 className="size-4 text-green" aria-hidden="true" />,
  error: <AlertTriangle className="size-4 text-red" aria-hidden="true" />,
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--spacing-bottomnav)+18px)] z-200 flex flex-col items-center gap-2 px-3 lg:bottom-[calc(var(--spacing-worldbar)+18px)]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "animate-sheet-in pointer-events-auto flex w-full max-w-[420px] items-start gap-2.5",
            "rounded-[14px] border border-[#30415f] bg-[#101827] px-3.5 py-3 shadow-[0_16px_50px_#0008]",
          )}
        >
          <span className="mt-px shrink-0">{TONE_ICON[t.tone ?? "default"]}</span>
          <div className="min-w-0 flex-1">
            <b className="block text-[12px] font-extrabold">{t.title}</b>
            {t.description ? (
              <p className="m-0 mt-0.5 text-[11px] text-muted">{t.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(t.id)}
            className="-m-1 shrink-0 rounded-md p-1 text-[#7f8ca4] hover:text-text"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
