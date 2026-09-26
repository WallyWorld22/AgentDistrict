/**
 * IndexNow — tell Bing, Yandex, Seznam and Naver about a URL the moment it
 * exists, instead of waiting for the next crawl of `sitemap.xml`.
 *
 * The protocol is deliberately trivial: publish a key file at
 * `/<key>.txt` whose body is the key, then POST the key plus a list of URLs.
 * **The key is public by design** — the key file is how a search engine proves
 * the submitter controls the host, so there is nothing to keep secret and
 * nothing here is a credential.
 *
 * Three rules govern every call:
 *
 * 1. **It never blocks a mutation.** `pingIndexNow` is fire-and-forget: it
 *    returns a promise, but the callers deliberately do not await it, and every
 *    failure path is swallowed.
 * 2. **It never runs outside Vercel.** Gated on `process.env.VERCEL`, so the
 *    demo (BUILD_SPEC §1: zero env vars) and the test suites make no outbound
 *    request at all — the same rule `@vercel/analytics` and the webhook runtime
 *    already follow in this repo.
 * 3. **It never submits a non-canonical origin.** A preview deployment
 *    registering preview URLs against the production key would be rejected as a
 *    host mismatch, so the submission only happens when `siteUrl()` is an
 *    explicitly configured `https://` origin.
 */

import { siteUrl } from "@/lib/site";

/**
 * The IndexNow key for agentdistrict.io.
 *
 * Public on purpose (see above), and it must match the filename and body of
 * `public/<key>.txt` exactly — `tests/unit/seo.test.ts` asserts that it does.
 */
export const INDEXNOW_KEY = "6f2d9c4b8a1e47d3b05c7e19f83a246d";

const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Submitting more than this in one call is outside the protocol's limits. */
const MAX_URLS = 10_000;

/**
 * Should this process talk to IndexNow at all?
 *
 * Exported so the behaviour is testable without monkey-patching `fetch`.
 */
export function indexNowTarget(): { origin: string; host: string } | null {
  if (!process.env.VERCEL) return null;

  let origin: URL;
  try {
    origin = new URL(siteUrl());
  } catch {
    return null;
  }
  // A preview host cannot prove ownership of the production key file.
  if (origin.protocol !== "https:") return null;
  if (!process.env.NEXT_PUBLIC_SITE_URL) return null;

  return { origin: origin.origin, host: origin.host };
}

/**
 * Announce one or more freshly published URLs. Fire and forget.
 *
 * `urls` may be absolute or site-relative; anything pointing at another origin
 * is dropped rather than sent, because IndexNow rejects a whole submission that
 * mixes hosts.
 */
export async function pingIndexNow(urls: string[]): Promise<void> {
  try {
    const target = indexNowTarget();
    if (!target) return;

    const urlList = normalizeUrls(urls, target.origin);
    if (urlList.length === 0) return;

    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: target.host,
        key: INDEXNOW_KEY,
        keyLocation: `${target.origin}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
      // Never let a slow search engine hold a server action open.
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Deliberately silent. A search engine being unreachable is not a reason
    // for a passport or a gig to fail to publish.
  }
}

/** Absolute, same-origin, de-duplicated. Exported for the unit test. */
export function normalizeUrls(urls: string[], origin: string): string[] {
  const seen = new Set<string>();
  for (const candidate of urls) {
    /*
     * Only an absolute URL or a site-root path. Without this, `new URL(x,
     * base)` happily reads *any* string as a relative reference — "not a url
     * at all" resolves to `<origin>/not%20a%20url%20at%20all` and would be
     * submitted. IndexNow counts submitted URLs that 404 against the host, so
     * a malformed argument is better dropped than announced.
     */
    if (!candidate.startsWith("/") && !/^https?:\/\//i.test(candidate)) continue;

    let resolved: URL;
    try {
      resolved = new URL(candidate, `${origin}/`);
    } catch {
      continue;
    }
    if (resolved.origin !== origin) continue;
    seen.add(resolved.toString());
    if (seen.size >= MAX_URLS) break;
  }
  return [...seen];
}
