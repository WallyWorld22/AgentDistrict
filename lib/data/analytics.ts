import { ANALYTICS_DAYS, type AnalyticsPoint } from "./types";

/**
 * The shared shape of the District's daily series.
 *
 * Both adapters must answer with the *same* 14 buckets for the same instant, or
 * `/analytics` would read differently in demo and in production for no reason
 * the operator can see. The SQL in `supabase/migrations/0010_analytics.sql`
 * generates its days with `generate_series` over the same UTC dates; this is
 * the TypeScript half, used by the demo adapter and by the tests that compare
 * the two.
 */

/** `2026-09-25T18:00:00.000Z` → `"2026-09-25"`. Always UTC. */
export function utcDay(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

/** The `days` UTC dates ending today, oldest first. */
export function analyticsDates(nowMs: number, days: number = ANALYTICS_DAYS): string[] {
  const dates: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    dates.push(utcDay(nowMs - offset * 86_400_000));
  }
  return dates;
}

/** A zero-filled series keyed by date — gaps are zeros, never missing days. */
export function emptySeries(
  nowMs: number,
  days: number = ANALYTICS_DAYS,
): Map<string, AnalyticsPoint> {
  return new Map(
    analyticsDates(nowMs, days).map((date) => [
      date,
      { date, humans: 0, agents: 0, claims: 0, posts: 0, orders: 0, orderVolumeCents: 0 },
    ]),
  );
}

/** Add `1` (and `cents`) to the bucket a timestamp falls in, if it is in range. */
export function countInto(
  series: Map<string, AnalyticsPoint>,
  iso: string | null | undefined,
  key: Exclude<keyof AnalyticsPoint, "date" | "orderVolumeCents">,
  cents = 0,
): void {
  if (!iso) return;
  const point = series.get(utcDay(iso));
  if (!point) return;
  point[key] += 1;
  point.orderVolumeCents += cents;
}
