import { SEARCH_KINDS, type SearchHit, type SearchKind, type SearchResults } from "./types";

/** A zeroed `counts` map — every kind present, so the chips never flicker. */
export function emptySearchCounts(): Record<SearchKind, number> {
  return Object.fromEntries(SEARCH_KINDS.map((kind) => [kind, 0])) as Record<
    SearchKind,
    number
  >;
}

/** Route for a `search_district()` row, which carries only `kind` + `slug`. */
export function searchHrefFor(kind: SearchKind, slug: string): string {
  switch (kind) {
    case "agent":
      return `/agents/${slug}`;
    case "gig":
      return `/gigs/${slug}`;
    case "job":
      return `/jobs/${slug}`;
    case "guild":
      return `/guilds/${slug}`;
    case "channel":
      return `/tv/${slug}`;
    case "market_item":
      return `/market/${slug}`;
    case "store":
      return `/stores/${slug}`;
  }
}

/** Assemble the `counts` map and `total` from an ordered hit list. */
export function summariseHits(query: string, hits: SearchHit[]): SearchResults {
  const counts = emptySearchCounts();
  for (const hit of hits) counts[hit.kind] += 1;
  return { query, hits, counts, total: hits.length };
}

const WORD = /[a-z0-9@$.+-]+/g;

/**
 * Words `websearch_to_tsquery('english', …)` throws away before building the
 * query, so "roofing leads **in** Tampa" is three terms in Postgres and has to
 * be three terms here too. Keeping them made a preposition enough to zero a
 * result that otherwise matched everything the reader typed.
 */
const STOPWORDS = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "but", "by", "can", "for", "from",
  "get", "how", "in", "into", "is", "it", "me", "my", "of", "on", "or", "our", "out",
  "over", "so", "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "to", "under", "up", "us", "was", "we", "were", "what", "when", "where",
  "which", "who", "will", "with", "would", "you", "your",
]);

/**
 * The meaningful terms in a query: tokens of two characters or more, minus the
 * stopword list. If a query is *nothing but* stopwords ("in the"), the raw
 * tokens are kept so the reader still gets an answer rather than everything.
 */
export function searchTerms(query: string): string[] {
  const raw = (query.toLowerCase().match(WORD) ?? []).filter((term) => term.length > 1);
  const meaningful = raw.filter((term) => !STOPWORDS.has(term));
  return meaningful.length > 0 ? meaningful : raw;
}

/**
 * Does a term appear in a haystack, allowing for a plural?
 *
 * Postgres stems: `websearch_to_tsquery` turns "leads" into `lead`, which
 * matches an agent whose skill reads "Lead research". A substring test on the
 * raw token does not, so the two adapters answered differently for the same
 * query. Stripping a trailing `s`/`es` is a deliberately small approximation of
 * the snowball stemmer — enough for the plural nouns a marketplace search box
 * actually receives, with no dictionary to ship.
 */
function termMatches(haystack: string, term: string): boolean {
  if (haystack.includes(term)) return true;
  if (term.length > 3 && term.endsWith("es") && haystack.includes(term.slice(0, -2))) return true;
  if (term.length > 2 && term.endsWith("s") && haystack.includes(term.slice(0, -1))) return true;
  return false;
}

/**
 * Does a row match every meaningful term in the query?
 *
 * This is the browse-page filter — `listAgents`, `listGigs`, `listJobs` and
 * `listMarketItems` in the demo adapter all call it — and it exists so those
 * four agree with the Supabase adapter, which routes `q` through
 * `websearch_to_tsquery` (per-term AND, stopwords dropped, stemmed). They used
 * to test `haystack.includes(wholeQuery)`, so every multi-word query returned
 * nothing in the mode the app ships in.
 */
export function matchesTerms(haystack: string, query: string): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const hay = haystack.toLowerCase();
  return terms.every((term) => termMatches(hay, term));
}

/**
 * How many of the query's terms a row matches. `terms.length` means "all".
 * Used for the best-effort fallback below.
 */
export function countTermMatches(haystack: string, terms: string[]): number {
  const hay = haystack.toLowerCase();
  let matched = 0;
  for (const term of terms) if (termMatches(hay, term)) matched += 1;
  return matched;
}

/**
 * Filter browse rows by a free-text query, with the same all-terms-then-best-
 * effort rule `rankSearchHits` uses.
 *
 * Rows matching every term win outright. If none do, the rows matching the most
 * terms answer instead of an empty page — "roofing leads in Tampa" (the query
 * printed in the @World bar on every page) should surface RoofIntel, not
 * nothing. Input order is preserved; the caller still applies its own sort.
 */
export function filterByTerms<T>(
  rows: T[],
  query: string,
  haystackOf: (row: T) => string,
): T[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return rows;

  const scored = rows.map((row) => ({ row, matched: countTermMatches(haystackOf(row), terms) }));
  const strict = scored.filter((entry) => entry.matched === terms.length);
  if (strict.length > 0) return strict.map((entry) => entry.row);

  let best = 0;
  for (const entry of scored) if (entry.matched > best) best = entry.matched;
  if (best === 0) return [];
  return scored.filter((entry) => entry.matched === best).map((entry) => entry.row);
}

/**
 * Rank candidates for the demo adapter.
 *
 * Postgres does this with `websearch_to_tsquery` + `ts_rank_cd`; here it is a
 * deterministic token score with the same *shape*: an exact title match
 * outranks a title prefix, which outranks a body mention. No `Math.random()`,
 * no `Date.now()` — the same query always produces the same order.
 *
 * Rows matching every term always lead. When nothing matches all of them the
 * best partial matches answer instead of the empty state: a natural-language
 * query ("roofing leads in Tampa") should not be told the District has nothing,
 * when six things match the word the reader cared about. Genuinely unmatched
 * queries still fall through to @World / post-a-bounty.
 */
export function rankSearchHits(
  query: string,
  candidates: Array<SearchHit & { haystack: string }>,
  limit: number,
): SearchResults {
  const terms = searchTerms(query);
  if (terms.length === 0) return { query, hits: [], counts: emptySearchCounts(), total: 0 };

  const phrase = query.toLowerCase().trim();
  const strict: SearchHit[] = [];
  const partial: Array<{ hit: SearchHit; matched: number }> = [];

  for (const candidate of candidates) {
    const haystack = candidate.haystack.toLowerCase();
    const title = candidate.title.toLowerCase();
    let score = 0;
    let matched = 0;

    for (const term of terms) {
      if (title === term) score += 10;
      else if (title.startsWith(term)) score += 6;
      else if (title.includes(term)) score += 4;
      else if (termMatches(haystack, term)) score += 1.5;
      else continue;
      matched += 1;
    }
    if (matched === 0) continue;

    // A whole-phrase hit beats the same words scattered across the row.
    if (haystack.includes(phrase)) score += 3;
    const hit: SearchHit = { ...candidate, rank: Number((score / terms.length).toFixed(4)) };
    if (matched === terms.length) strict.push(hit);
    else partial.push({ hit, matched });
  }

  const byRank = (a: SearchHit, b: SearchHit) => b.rank - a.rank || a.title.localeCompare(b.title);
  let ordered: SearchHit[];
  if (strict.length > 0) {
    ordered = strict.sort(byRank);
  } else {
    // Best-effort: the rows matching the most terms, then by rank.
    const best = partial.reduce((most, entry) => Math.max(most, entry.matched), 0);
    ordered = partial
      .filter((entry) => entry.matched === best)
      .map((entry) => entry.hit)
      .sort(byRank);
  }

  const hits = ordered.slice(0, Math.max(1, Math.min(limit, 100)));
  return summariseHits(query, hits);
}
