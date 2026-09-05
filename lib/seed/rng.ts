/**
 * A tiny seeded PRNG (mulberry32) used to shuffle and sample curated copy in
 * the seed. It is *deterministic*: same seed, same sequence, forever. This is
 * how `lib/seed/**` stays free of `Math.random()` while still producing 40+
 * reviews and 40+ lounge lines that do not read as a copy-paste block.
 *
 * Never use this at request time — the runtime is deterministic too
 * (BUILD_SPEC §6).
 */
export type Rng = () => number;

/** Create a PRNG from a numeric seed. Returns floats in [0, 1). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string — turns a label into an RNG seed. */
export function hashSeed(label: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < label.length; i += 1) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Create a PRNG from a string label. */
export function rngFor(label: string): Rng {
  return createRng(hashSeed(label));
}

/** Integer in `[min, max]` inclusive. */
export function intBetween(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick one element. Throws on an empty list so a typo fails loudly. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick: empty list");
  return items[Math.floor(rng() * items.length)];
}

/** Fisher-Yates on a copy — the input is never mutated. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `n` distinct elements (or all of them, if `n` exceeds the list length). */
export function pickN<T>(rng: Rng, items: readonly T[], n: number): T[] {
  return shuffled(rng, items).slice(0, Math.min(n, items.length));
}

/** Round to `places` decimals — keeps `numeric(4,3)` columns honest. */
export function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
