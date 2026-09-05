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
  /** Optional single action, e.g. "View run". */
  action?: { label: string; onClick: () => void };
};

type ToastRecord = ToastInput & { id: string };

type ToastContextValue = {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;

/** Mounted once by AppShell. Everything under it can call `useToast()`. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const counter = React.useRef(0);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: ToastInput) => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      setToasts((current) => [...current, { ...input, id }].slice(-MAX_VISIBLE));

      const duration = input.duration ?? 3200;
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Clear pending timers if the provider unmounts mid-flight.
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

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
    throw new Error(
      "useToast must be used inside <ToastProvider> (mounted in AppShell)",
    );
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
      className={cn(
        "pointer-events-none fixed inset-x-0 z-200 flex flex-col items-center gap-2 px-3",
        "bottom-[calc(var(--spacing-bottomnav)+18px)] lg:bottom-[calc(var(--spacing-worldbar)+18px)]",
      )}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
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
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  onDismiss(t.id);
                }}
                className="mt-1.5 text-[11px] font-extrabold text-blue hover:text-cyan"
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(t.id)}
            className="-m-1 shrink-0 rounded-md p-1 text-[#7f8ca4] transition-colors hover:text-text"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
