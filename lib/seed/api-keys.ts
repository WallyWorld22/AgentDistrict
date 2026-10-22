import type { ApiKey } from "../data/types";
import { daysAgo, hoursAgo } from "./clock";
import { profileId } from "./profiles";
import { id, sha1Hex } from "./uuid";

/**
 * Machine access keys.
 *
 * **Everything in this file is public.** The repository is public, so a raw
 * key written here is published the moment it is committed, and deleting it
 * later does not unpublish it: it stays in git history. Treat any raw value
 * that ever appeared in this file as burned.
 *
 *  1. **The demo key is public by design.** `DEMO_API_KEY` is printed on
 *     `/developers` so an agent can call `/api/v1/*` against a demo install
 *     without signing up, and because it is public it is **read-only**. A
 *     public key carrying `jobs:write` / `bids:write` / `orders:write` would let
 *     anyone spend the demo wallet, spam the bounty board and bid in an agent's
 *     name.
 *  2. **The write-scoped key is never committed.** `DEMO_WRITE_API_KEY` exists
 *     so the reverse-auction flow can be exercised end to end. Its raw value
 *     comes from the `SEED_WRITE_API_KEY` environment variable; when that is
 *     unset (a zero-env demo, `npm run test`) it is minted from a CSPRNG once
 *     per process, so it works inside that process and nowhere else.
 *     Playwright mints one per run and hands it to both the server and the
 *     specs (`playwright.config.ts`). The SQL seed carries this key's row only
 *     when `SEED_WRITE_API_KEY` was set while `npm run seed:sql` ran, and a
 *     `seed.sql` generated that way holds a digest of a private key, so it
 *     must not be committed.
 *  3. **Never add another raw key here.** A key that has to work against a
 *     real database is created at runtime (`createApiKey`) or supplied through
 *     the environment, never written into the seed.
 *  4. **Digests are algorithm-prefixed.** `key_hash` is `"<alg>$<hex>"`. The
 *     seed can only produce `sha1$…` (it is dependency-free and runs in every
 *     runtime); `lib/data` should write `sha256$…` for keys created at runtime
 *     and dispatch on the prefix when verifying. Never compare raw keys.
 */

/**
 * Raw value of the seeded **read-only** demo key. Public on purpose:
 * documented in `supabase/README.md` and printed on `/developers`.
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

/** The environment variable that supplies `DEMO_WRITE_API_KEY`'s raw value. */
export const DEMO_WRITE_API_KEY_ENV = "SEED_WRITE_API_KEY" as const;

/**
 * `ad_live_<name>_<secret>`, where the secret is at least 24 lowercase letters
 * or digits. `ad_live_bldr_` plus 32 hex characters is what this module mints.
 */
const WRITE_KEY_SHAPE = /^ad_live_[a-z0-9]+_[a-z0-9]{24,}$/;

/** The configured raw write key, or `null` when `SEED_WRITE_API_KEY` is unset. */
function configuredWriteApiKey(): string | null {
  const value =
    typeof process === "undefined" ? undefined : process.env.SEED_WRITE_API_KEY?.trim();
  if (!value) return null;
  if (!WRITE_KEY_SHAPE.test(value)) {
    // Never echo the value: it is a secret even when it is malformed.
    throw new Error(
      `${DEMO_WRITE_API_KEY_ENV} must look like ad_live_<name>_<24+ lowercase letters or digits>, ` +
        "e.g. ad_live_bldr_ followed by 32 hex characters.",
    );
  }
  return value;
}

/** A fresh `ad_live_bldr_<32 hex>` from the platform CSPRNG. */
function mintWriteApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `ad_live_bldr_${hex}`;
}

const CONFIGURED_WRITE_API_KEY = configuredWriteApiKey();

/**
 * A write-scoped key for the demo owner. **Not** published on `/developers`,
 * and never committed: it is `SEED_WRITE_API_KEY` when that is set, otherwise
 * a per-process random value (see rule 2 above).
 */
export const DEMO_WRITE_API_KEY: string = CONFIGURED_WRITE_API_KEY ?? mintWriteApiKey();

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

const DEMO_KEY_SPEC: ApiKeySpec = {
  key: "austin-demo",
  profile: "austin",
  label: "Demo key (public, read-only)",
  raw: DEMO_API_KEY,
  scopes: [...DEMO_API_KEY_SCOPES],
  lastUsedHoursAgo: 2,
  daysOld: 34,
};

function writeKeySpec(raw: string): ApiKeySpec {
  return {
    key: "austin-builder",
    profile: "austin",
    label: "Builder key (private)",
    raw,
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
  };
}

function toApiKey(spec: ApiKeySpec): ApiKey {
  return {
    id: id("api-key", spec.key),
    profile_id: profileId(spec.profile),
    label: spec.label,
    key_hash: hashSeedApiKey(spec.raw),
    key_prefix: keyPrefix(spec.raw),
    scopes: spec.scopes,
    last_used_at: spec.lastUsedHoursAgo === null ? null : hoursAgo(spec.lastUsedHoursAgo),
    created_at: daysAgo(spec.daysOld),
    /**
     * Every seeded key belongs to a *human*, so none of them acts as an agent.
     * `agent_id` is set only by `registerAgent` (migration 0009), which is how a
     * self-registered agent gets a credential that carries its own identity.
     */
    agent_id: null,
  };
}

/**
 * The write key's row, whatever its source. The in-memory demo adapter always
 * hydrates it (`demoSeed` in `./index`), so `DEMO_WRITE_API_KEY` verifies in
 * demo mode even when the env var is unset.
 */
export const demoWriteApiKey: ApiKey = toApiKey(writeKeySpec(DEMO_WRITE_API_KEY));

/**
 * The rows `seed.apiKeys`, and therefore `supabase/seed.sql`, carry: the public
 * demo key always, the write key only when `SEED_WRITE_API_KEY` is set. A
 * per-process random key never reaches the SQL seed, which keeps
 * `npm run seed:sql` byte-stable.
 */
export const apiKeys: ApiKey[] = [
  toApiKey(DEMO_KEY_SPEC),
  ...(CONFIGURED_WRITE_API_KEY === null ? [] : [demoWriteApiKey]),
];
