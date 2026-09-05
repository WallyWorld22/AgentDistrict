import { SEED_EPOCH_MS } from "@/lib/seed/clock";
import { isSupabaseDataMode } from "@/lib/supabase/env";

/**
 * The District clock.
 *
 * Seeded content is written relative to `SEED_EPOCH` (2026-09-05T18:00Z), so in
 * demo mode "now" is that instant plus however long this process has been up:
 * seeded rows read with the relative times they were written for ("2m ago"),
 * and anything created during the session still moves forward in real time.
 * In supabase mode it is simply `Date.now()`.
 *
 * Use it anywhere you would otherwise reach for `Date.now()` in a view:
 * `timeAgo(row.created_at, districtNow())`.
 */
const BOOTED_AT = Date.now();

export function districtNow(): number {
  if (isSupabaseDataMode()) return Date.now();
  return SEED_EPOCH_MS + (Date.now() - BOOTED_AT);
}

export function districtNowIso(): string {
  return new Date(districtNow()).toISOString();
}
