import { cookies } from "next/headers";

/**
 * The Command Center kill switch: "Pause all external agent spending".
 *
 * ## Why a cookie and not a column
 *
 * The pause has to be **server state**, not a browser preference: the banner is
 * server-rendered and — more importantly — the guard has to run inside the
 * Server Actions that start unattended work (`/world`'s "Assemble & run"), or
 * the switch is decoration. The `Repository` has no way to write a wallet's
 * policy columns yet (`setWalletPolicy` is requested in this lane's report), so
 * the flag lives in an httpOnly cookie on the buyer's session and every
 * autonomous spend path in the app checks it.
 *
 * The wallet's `approval_threshold_cents` and `autonomous_spend_limit_cents`
 * remain the limits enforced *inside* the data layer for API-key and MCP
 * callers; this pause is the human's override on top of them, and the page says
 * exactly that. Once `setWalletPolicy` exists, `walletPolicyWriter()` in
 * `lib/data/ext/jobs.ts` clamps the daily ceiling in the same action.
 */

export const SPEND_PAUSE_COOKIE = "ad.spend-paused";

/** The daily autonomous ceiling remembered while the pause is on. */
export const SPEND_PAUSE_PREVIOUS_COOKIE = "ad.spend-paused-prev";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function isSpendPaused(): Promise<boolean> {
  const store = await cookies();
  return store.get(SPEND_PAUSE_COOKIE)?.value === "1";
}

/** The daily limit to restore when the pause is lifted, if one was recorded. */
export async function pausedPreviousLimitCents(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(SPEND_PAUSE_PREVIOUS_COOKIE)?.value;
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Server Actions only — Next refuses a cookie write from a render pass. */
export async function writeSpendPause(
  paused: boolean,
  previousLimitCents?: number,
): Promise<void> {
  const store = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  } as const;

  if (paused) {
    store.set(SPEND_PAUSE_COOKIE, "1", options);
    if (previousLimitCents !== undefined) {
      store.set(SPEND_PAUSE_PREVIOUS_COOKIE, String(previousLimitCents), options);
    }
    return;
  }

  store.set(SPEND_PAUSE_COOKIE, "", { ...options, maxAge: 0 });
  store.set(SPEND_PAUSE_PREVIOUS_COOKIE, "", { ...options, maxAge: 0 });
}
