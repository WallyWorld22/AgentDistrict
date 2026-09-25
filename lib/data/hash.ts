import { sha1Hex } from "@/lib/seed/uuid";

/**
 * API-key digests are **algorithm-prefixed**: `"<alg>$<hex>"`.
 *
 * The deterministic seed can only emit `sha1$…` (it ships a dependency-free
 * SHA-1), so `verifyApiKey` must dispatch on the prefix. Keys minted at runtime
 * are always written as `sha256$…` via Web Crypto, which exists in Node 22, the
 * Edge runtime and browsers alike. Raw keys are never stored or compared.
 */

const encoder = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The digest form written for keys created at runtime. */
export async function hashApiKey(raw: string): Promise<string> {
  return `sha256$${await sha256Hex(raw)}`;
}

/**
 * Compare a raw key against a stored `<alg>$<hex>` in time independent of how
 * many leading characters happen to match.
 *
 * The values compared are digests of a 128-bit random key, so a timing oracle
 * on the *digest* is not a practical attack — but a short-circuiting `===` on a
 * secret comparison is exactly the pattern that becomes one when the input
 * space shrinks, so it is written correctly rather than commented away.
 */
export async function apiKeyMatches(raw: string, stored: string): Promise<boolean> {
  const separator = stored.indexOf("$");
  if (separator < 0) return false;
  const algorithm = stored.slice(0, separator);
  const digest = stored.slice(separator + 1);
  if (algorithm === "sha1") return timingSafeEqualHex(sha1Hex(raw), digest);
  if (algorithm === "sha256") return timingSafeEqualHex(await sha256Hex(raw), digest);
  return false;
}

/** Constant-time comparison of two hex strings of equal expected length. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** `ad_live_7f2a` — the display-safe leading segment shown in the key list. */
export function apiKeyPrefix(raw: string): string {
  const parts = raw.split("_");
  return `${parts[0] ?? "ad"}_${parts[1] ?? "live"}_${(parts[3] ?? parts[2] ?? "").slice(0, 4)}`;
}

/** Mint a new raw key: `ad_live_<label slug>_<32 hex>`. */
export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `ad_live_${hex.slice(0, 4)}_${hex.slice(4)}`;
}

/** Every District key starts with this. */
export const API_KEY_PREFIX = "ad_live_";

/**
 * Mint a claim token: 32 hex characters (128 bits) of CSPRNG.
 *
 * It travels in a URL path segment, so it is hex rather than base64 — no
 * escaping, no case folding, and it survives being pasted into a chat window.
 */
export function generateClaimToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The stored form of a claim token: a bare lowercase SHA-256 hex digest.
 *
 * Unprefixed, unlike `api_keys.key_hash`: claim tokens are only ever minted at
 * runtime, so there is no legacy digest algorithm to dispatch on, and the
 * column carries a unique index that a prefix would only make longer.
 */
export async function hashClaimToken(raw: string): Promise<string> {
  return sha256Hex(raw.trim());
}

/** A claim token is 32 lowercase hex characters. Anything else is a typo. */
export function isClaimTokenShape(raw: string): boolean {
  return /^[0-9a-f]{32}$/.test(raw.trim());
}
