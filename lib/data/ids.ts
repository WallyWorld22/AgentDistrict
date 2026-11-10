import type { UUID } from "./types";

/**
 * Is `value` shaped like a primary key?
 *
 * Every id column in the District is a Postgres `uuid`. Hand one anything else
 * — a mistyped link, `/jobs/not-a-uuid`, a crawler that tacked a `\` onto a
 * real id — and Postgres does not answer "no such row", it refuses the
 * statement (`22P02 invalid input syntax for type uuid`). Before this check
 * the Supabase adapter turned that refusal into an `UpstreamError`, so a bad
 * address was a 500 crash page instead of a 404, and the API echoed the raw
 * database message back to the caller.
 *
 * So the Supabase adapter asks this before any query that takes an id from
 * outside, and treats a malformed id exactly like an unknown one: a read
 * returns `null` (or an empty page), a write throws `NotFoundError`. That is
 * what the demo adapter already did — it finds no row whose id is
 * `not-a-uuid` — so the two now give the same answer for the same input
 * (`tests/integration/malformed-ids.test.ts` holds them to it).
 *
 * Canonical lower-case 8-4-4-4-12 hex only, any version — the form every id
 * the District hands out takes. Postgres would also accept upper case, braces
 * and unhyphenated spellings, but the demo adapter compares ids as strings and
 * would not find those rows, so they read as "not found" in both.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: unknown): value is UUID {
  return typeof value === "string" && UUID_SHAPE.test(value);
}
