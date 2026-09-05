"use client";

import * as React from "react";

/**
 * A boolean remembered in `localStorage`, read through `useSyncExternalStore`.
 *
 * Reading storage inside an effect and calling `setState` causes a cascading
 * render (and React's lint rule rightly rejects it). This subscribes instead:
 * the server snapshot is the fallback, so SSR and the first client render agree,
 * and a change in another tab updates every reader.
 *
 * These flags are per-browser conveniences (Workplace Gateway toggles, the
 * spend pause). Anything that must actually be enforced lives on the wallet row
 * and is checked server-side.
 */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLocalFlag(
  key: string,
  fallback: boolean,
): [boolean, (next: boolean) => void] {
  const value = React.useSyncExternalStore(
    subscribe,
    () => {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : raw === "1";
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );

  const set = React.useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* storage can be unavailable — the toggle still moves for this render */
      }
      emit();
    },
    [key],
  );

  return [value, set];
}
