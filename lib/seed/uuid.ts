/**
 * Deterministic UUIDv5 (RFC 4122 §4.3) with a dependency-free SHA-1.
 *
 * Seed ids must be byte-for-byte identical on every machine and every run:
 * `supabase/seed.sql` is committed, so a non-deterministic id would produce a
 * spurious diff on every `npm run seed:sql`. `crypto.randomUUID()` and
 * `Math.random()` are therefore banned in `lib/seed/**`.
 *
 * We hash in pure TypeScript rather than reaching for `node:crypto` so the seed
 * can be imported from any runtime the app happens to render in (Node, Edge,
 * the browser, jsdom under Vitest) without a conditional import.
 */

/** Namespace UUID for AgentDistrict seed ids (itself a fixed constant). */
export const SEED_NAMESPACE = "6f1b9a3e-1c4d-4f7a-9a2b-0e5c8d6f4a11";

/* -------------------------------------------------------------------------- */
/* SHA-1                                                                       */
/* -------------------------------------------------------------------------- */

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/** SHA-1 over `bytes`, returning the 20-byte digest. */
export function sha1(bytes: Uint8Array): Uint8Array {
  const bitLength = bytes.length * 8;
  const blockCount = ((bytes.length + 8) >> 6) + 1;
  const padded = new Uint8Array(blockCount * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  for (let block = 0; block < blockCount; block += 1) {
    const base = block * 64;
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(base + i * 4, false);
    for (let i = 16; i < 80; i += 1) {
      w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i += 1) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + (f >>> 0) + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const out = new DataView(digest.buffer);
  out.setUint32(0, h0, false);
  out.setUint32(4, h1, false);
  out.setUint32(8, h2, false);
  out.setUint32(12, h3, false);
  out.setUint32(16, h4, false);
  return digest;
}

/* -------------------------------------------------------------------------- */
/* UUID                                                                        */
/* -------------------------------------------------------------------------- */

const HEX = "0123456789abcdef";

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += HEX[byte >> 4] + HEX[byte & 0x0f];
  return out;
}

/** Parse `xxxxxxxx-xxxx-…` into its 16 bytes. Throws on a malformed UUID. */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error(`uuidToBytes: not a UUID: ${uuid}`);
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function utf8(input: string): Uint8Array {
  // TextEncoder exists in Node 18+, Edge and every browser we target.
  return new TextEncoder().encode(input);
}

function formatUuid(bytes: Uint8Array): string {
  const hex = toHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * RFC 4122 v5 UUID: `sha1(namespace || name)` truncated to 16 bytes with the
 * version and variant bits stamped in.
 */
export function uuidv5(name: string, namespace: string = SEED_NAMESPACE): string {
  const ns = uuidToBytes(namespace);
  const nameBytes = utf8(name);
  const input = new Uint8Array(ns.length + nameBytes.length);
  input.set(ns, 0);
  input.set(nameBytes, ns.length);

  const digest = sha1(input).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50; // version 5
  digest[8] = (digest[8] & 0x3f) | 0x80; // RFC 4122 variant
  return formatUuid(digest);
}

/**
 * The seed's id factory. Ids are namespaced by entity so `id("agent", "scout")`
 * can never collide with `id("gig", "scout")`, and so a handle change moves an
 * id in exactly one place.
 *
 *   id("agent", "scout") → "…" (stable forever)
 */
export function id(entity: string, key: string): string {
  return uuidv5(`agentdistrict:${entity}:${key}`);
}
