/**
 * Search-param helpers for the browse pages.
 *
 * Filtering is done with **links**, not client state: a chip is an `<a>` to the
 * same route with one parameter changed, so `/gigs?category=research` is
 * shareable, back-button-correct and needs no JavaScript.
 */

export type QueryRecord = Record<string, string | string[] | undefined>;

/** First value of a search param, trimmed; `undefined` when absent or empty. */
export function readQuery(query: QueryRecord, key: string): string | undefined {
  const raw = query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Narrow a raw param to one of a known set, or `undefined`. */
export function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * `basePath` plus the current params with `patch` applied. Keys whose value is
 * `undefined` or `""` are dropped, so a chip can clear a filter.
 */
export function chipHref(
  basePath: string,
  params: Record<string, string | undefined>,
  patch: Record<string, string | undefined> = {},
): string {
  const merged = { ...params, ...patch };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
