import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type FormatCentsOptions = {
  /** Drop a trailing `.00` (e.g. `$20` instead of `$20.00`). */
  compact?: boolean;
  /** Appended verbatim, e.g. `"/run"` → `$0.08/run`. */
  suffix?: string;
  /** Prefixed verbatim, e.g. `"from "` → `from $1.24`. */
  prefix?: string;
};

/**
 * Money lives in integer cents everywhere in AgentDistrict. Never format with
 * floating point arithmetic outside of this helper.
 *
 * formatCents(79)                        → "$0.79"
 * formatCents(124, { prefix: "from " })  → "from $1.24"
 * formatCents(8, { suffix: "/run" })     → "$0.08/run"
 * formatCents(2000, { compact: true })   → "$20"
 */
export function formatCents(
  cents: number,
  { compact = false, suffix = "", prefix = "" }: FormatCentsOptions = {},
): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;

  const dollars = whole.toLocaleString("en-US");
  const body =
    compact && fraction === 0
      ? dollars
      : `${dollars}.${fraction.toString().padStart(2, "0")}`;

  return `${negative ? "-" : ""}${prefix}$${body}${suffix}`;
}

/**
 * Human duration for SLAs and latency.
 *
 * formatDuration(42)    → "42 sec"
 * formatDuration(480)   → "8 min"
 * formatDuration(4320)  → "1h 12m"
 * formatDuration(90000) → "1d 1h"
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  if (total < 60) return `${total} sec`;
  if (total < 3600) return `${Math.round(total / 60)} min`;
  if (total < 86400) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.round((total % 3600) / 60);
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  const days = Math.floor(total / 86400);
  const hours = Math.round((total % 86400) / 3600);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

/**
 * Compact relative time in the legacy demo's voice ("2m ago", "1h ago").
 * `now` is injectable so seeded content and tests stay deterministic.
 */
export function timeAgo(
  value: Date | string | number,
  now: Date | number = Date.now(),
): string {
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const reference = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(then)) return "";

  const deltaSeconds = Math.round((reference - then) / 1000);
  if (deltaSeconds < 0) {
    const ahead = Math.abs(deltaSeconds);
    if (ahead < 60) return "in a moment";
    if (ahead < 3600) return `in ${Math.round(ahead / 60)}m`;
    if (ahead < 86400) return `in ${Math.round(ahead / 3600)}h`;
    return `in ${Math.round(ahead / 86400)}d`;
  }

  if (deltaSeconds < 10) return "now";
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  if (deltaSeconds < 2592000) return `${Math.floor(deltaSeconds / 86400)}d ago`;
  if (deltaSeconds < 31536000) return `${Math.floor(deltaSeconds / 2592000)}mo ago`;
  return `${Math.floor(deltaSeconds / 31536000)}y ago`;
}

/** URL-safe slug: lowercase, ASCII, hyphen separated, no leading/trailing dash. */
export function slugify(input: string): string {
  return String(input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Accepts only a same-site path for post-auth redirects: absolute-path form
 * ("/wallet", "/inbox?x=1"), never protocol-relative ("//evil.com") or an
 * absolute URL. Anything else collapses to null so callers fall back to "/".
 */
export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}
