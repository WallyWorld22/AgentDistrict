import type { ApiKey } from "../data/types";
import { daysAgo, hoursAgo } from "./clock";
import { profileId } from "./profiles";
import { id, sha1Hex } from "./uuid";

/**
 * Machine access keys.
 *
 * Three things a downstream executor must know:
 *
 *  1. **The demo key's raw value is public on purpose.** It is printed on
 *     `/developers` so an agent can call `/api/v1/*` against a demo install
 *     without signing up — and because it is public it is **read-only**.
 *     Publishing a key that carried `jobs:write` / `bids:write` /
 *     `orders:write` against a real profile meant anyone could spend the
 *     wallet, spam the bounty board and place bids in an agent's name.
 *  2. **The write-scoped key is not public.** `DEMO_WRITE_API_KEY` exists so
 *     the reverse-auction flow can be exercised end to end, and it is only ever
 *     shown to the signed-in owner on `/profile`. Never print it on
 *     `/developers`.
 *  3. **Digests are algorithm-prefixed.** `key_hash` is `"<alg>$<hex>"`. The
 *     seed can only produce `sha1$…` (it is dependency-free and runs in every
 *     runtime); `lib/data` should write `sha256$…` for keys created at runtime
 *     and dispatch on the prefix when verifying. Never compare raw keys.
 */

/**
 * Raw value of the seeded **read-only** demo key. Safe to publish; documented
 * in `supabase/README.md` and printed on `/developers`.
 */
export const DEMO_API_KEY = "ad_live_demo_2f8c41a7b09e4d63" as const;

/** Read-only scopes carried by `DEMO_API_KEY`. */
export const DEMO_API_KEY_SCOPES = [
  "agents:read",
  "gigs:read",
  "jobs:read",
  "orders:read",
  "stats:read",
  "events:read",
] as const;

/**
 * A write-scoped key for the demo owner. **Not** published on `/developers` —
 * only surfaced to the signed-in owner, the same way a real key would be.
 */
export const DEMO_WRITE_API_KEY = "ad_live_bldr_9d41c07eb35a86f2" as const;

/** `"sha1$<hex>"` — the digest form the seed writes. */
export function hashSeedApiKey(raw: string): string {
  return `sha1$${sha1Hex(raw)}`;
}

/** `ad_live_2f8c` — the display-safe prefix shown in the API key list. */
function keyPrefix(raw: string): string {
  const parts = raw.split("_");
  return `${parts[0]}_${parts[1]}_${(parts[3] ?? parts[2] ?? "").slice(0, 4)}`;
}

type ApiKeySpec = {
  key: string;
  profile: string;
  label: string;
  raw: string;
  scopes: string[];
  lastUsedHoursAgo: number | null;
  daysOld: number;
};

const SPECS: ApiKeySpec[] = [
  {
    key: "austin-demo",
    profile: "austin",
    label: "Demo key (public, read-only)",
    raw: DEMO_API_KEY,
    scopes: [...DEMO_API_KEY_SCOPES],
    lastUsedHoursAgo: 2,
    daysOld: 34,
  },
  {
    key: "austin-builder",
    profile: "austin",
    label: "Builder key (private)",
    raw: DEMO_WRITE_API_KEY,
    scopes: [
      "agents:read",
      "gigs:read",
      "jobs:read",
      "jobs:write",
      "bids:write",
      "orders:write",
      "stats:read",
      "events:read",
    ],
    lastUsedHoursAgo: 5,
    daysOld: 30,
  },
  {
    key: "austin-workplace-gateway",
    profile: "austin",
    label: "WallyWorks Workplace Gateway",
    raw: "ad_live_wally_71b3e0d94ca85f26",
    scopes: ["agents:read", "gigs:read", "orders:write"],
    lastUsedHoursAgo: 19,
    daysOld: 96,
  },
  {
    key: "agentmax-northstar-ci",
    profile: "agentmax",
    label: "Northstar CI",
    raw: "ad_live_north_5ac2d8f10e73b649",
    scopes: ["agents:read", "gigs:read", "jobs:read"],
    lastUsedHoursAgo: null,
    daysOld: 61,
  },
];

export const apiKeys: ApiKey[] = SPECS.map((spec) => ({
  id: id("api-key", spec.key),
  profile_id: profileId(spec.profile),
  label: spec.label,
  key_hash: hashSeedApiKey(spec.raw),
  key_prefix: keyPrefix(spec.raw),
  scopes: spec.scopes,
  last_used_at: spec.lastUsedHoursAgo === null ? null : hoursAgo(spec.lastUsedHoursAgo),
  created_at: daysAgo(spec.daysOld),
}));
