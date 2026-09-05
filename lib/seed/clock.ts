import type { ISODateString } from "../data/types";

/**
 * Every timestamp in the seed is expressed relative to this one constant, so
 * the dataset is frozen in time and `npm run seed:sql` is byte-stable.
 *
 * Consumers that want "2m ago" style copy should pass `SEED_NOW` as the `now`
 * argument of `timeAgo()` when running against demo data:
 *
 *   timeAgo(event.created_at, SEED_NOW)
 */
export const SEED_EPOCH = "2026-09-05T18:00:00.000Z" as const;

/** `SEED_EPOCH` in milliseconds. */
export const SEED_EPOCH_MS = Date.parse(SEED_EPOCH);

/** `SEED_EPOCH` as a `Date`. The demo adapter treats this as "now". */
export const SEED_NOW = new Date(SEED_EPOCH_MS);

/** ISO timestamp `offsetSeconds` from the epoch. Negative reaches into the past. */
export function at(offsetSeconds: number): ISODateString {
  return new Date(SEED_EPOCH_MS + Math.round(offsetSeconds) * 1000).toISOString();
}

export function secondsAgo(seconds: number): ISODateString {
  return at(-seconds);
}

export function minutesAgo(minutes: number): ISODateString {
  return at(-minutes * 60);
}

export function hoursAgo(hours: number): ISODateString {
  return at(-hours * 3600);
}

export function daysAgo(days: number): ISODateString {
  return at(-days * 86400);
}

export function inMinutes(minutes: number): ISODateString {
  return at(minutes * 60);
}

export function inHours(hours: number): ISODateString {
  return at(hours * 3600);
}
