import type { TransactionKind, Wallet, WalletTransaction } from "../data/types";
import { at, daysAgo, hoursAgo, secondsAgo } from "./clock";
import { AUSTIN_HELD_CENTS, orderKeyId } from "./orders";
import { profileId, profiles } from "./profiles";
import { id } from "./uuid";

/**
 * Wallets and the money ledger.
 *
 * Austin's numbers come straight from BUILD_SPEC §2: balance $24.80, spend
 * today $3.84, approval threshold $5.00. `held_cents` is the sum of his four
 * in-flight orders (1,237¢), which makes **available = balance − held = $12.43**
 * — the Credits pill in `docs/reference/desktop-home.png`.
 *
 * `amount_cents` is signed by cash-flow direction for the profile: money out is
 * negative, money in is positive. The ledger is a *display log*: `balance_cents`
 * and `held_cents` on the wallet row are the source of truth, and each order
 * contributes exactly one money-out row — `hold` while it is in flight, or
 * `release` once it has been approved — so nothing is ever counted twice.
 */

const AUSTIN_BALANCE = 2480;
const AUSTIN_SPEND_TODAY = 384;
const AUSTIN_APPROVAL_THRESHOLD = 500;
const AUSTIN_AUTONOMOUS_LIMIT = 2000;

/** balance − held = 1243¢ = $12.43. Asserted in `tests/unit/seed.test.ts`. */
export const AUSTIN_AVAILABLE_CENTS = AUSTIN_BALANCE - AUSTIN_HELD_CENTS;

type WalletSpec = {
  handle: string;
  balance: number;
  held: number;
  spendToday: number;
  threshold: number;
  autonomousLimit: number;
};

const SPECS: WalletSpec[] = [
  {
    handle: "austin",
    balance: AUSTIN_BALANCE,
    held: AUSTIN_HELD_CENTS,
    spendToday: AUSTIN_SPEND_TODAY,
    threshold: AUSTIN_APPROVAL_THRESHOLD,
    // The per-order approval threshold ($5.00) and the *daily* autonomous
    // ceiling are different policies; seeding them identically left austin
    // with $1.16 of unattended headroom and made the Workplace Gateway page
    // read as broken. $20.00/day, of which $3.84 is spent.
    autonomousLimit: AUSTIN_AUTONOMOUS_LIMIT,
  },
  { handle: "buildwithjess", balance: 8140, held: 3600, spendToday: 1220, threshold: 2000, autonomousLimit: 5000 },
  { handle: "agentmax", balance: 15600, held: 0, spendToday: 640, threshold: 2500, autonomousLimit: 10000 },
  { handle: "lana-ai", balance: 4320, held: 0, spendToday: 288, threshold: 1000, autonomousLimit: 2500 },
  { handle: "devdan", balance: 1180, held: 0, spendToday: 0, threshold: 500, autonomousLimit: 1000 },
  { handle: "maria-work", balance: 22400, held: 0, spendToday: 4200, threshold: 5000, autonomousLimit: 15000 },
  { handle: "scale-j", balance: 6640, held: 0, spendToday: 1400, threshold: 2000, autonomousLimit: 5000 },
  { handle: "roofco-ray", balance: 31200, held: 4800, spendToday: 4800, threshold: 5000, autonomousLimit: 20000 },
  { handle: "tampa-tess", balance: 9880, held: 0, spendToday: 0, threshold: 2500, autonomousLimit: 7500 },
  { handle: "orlando-omar", balance: 12040, held: 0, spendToday: 0, threshold: 3000, autonomousLimit: 8000 },
  { handle: "coastal-carla", balance: 7460, held: 0, spendToday: 320, threshold: 2000, autonomousLimit: 5000 },
  { handle: "nina-ops", balance: 5320, held: 0, spendToday: 0, threshold: 1500, autonomousLimit: 4000 },
];

export const wallets: Wallet[] = profiles.map((profile) => {
  const spec = SPECS.find((candidate) => candidate.handle === profile.handle);
  if (!spec) throw new Error(`seed: no wallet for @${profile.handle}`);
  return {
    profile_id: profile.id,
    balance_cents: spec.balance,
    held_cents: spec.held,
    spend_today_cents: spec.spendToday,
    // The day `spend_today_cents` counts. It has to be the seed epoch's own
    // day, not `updated_at`, or the first unrelated wallet write on a later day
    // would carry the seeded figure into that day's autonomous ceiling.
    spend_today_date: secondsAgo(45).slice(0, 10),
    approval_threshold_cents: spec.threshold,
    autonomous_spend_limit_cents: spec.autonomousLimit,
    autonomous_paused: false,
    updated_at: secondsAgo(45),
  };
});

type TxSpec = {
  key: string;
  handle: string;
  kind: TransactionKind;
  amount: number;
  memo: string;
  orderKey?: string;
  createdAt: string;
};

const TXS: TxSpec[] = [
  /* ------------------------------------------------------------ austin (16) */
  {
    key: "austin-topup-1",
    handle: "austin",
    kind: "topup",
    amount: 2500,
    memo: "Added credits — card ending 4242",
    createdAt: daysAgo(11),
  },
  {
    key: "austin-payout-scout-1",
    handle: "austin",
    kind: "payout",
    amount: 71,
    memo: "Payout — Scout · Starter list (agent revenue)",
    createdAt: daysAgo(10),
  },
  {
    key: "austin-fee-scout-1",
    handle: "austin",
    kind: "fee",
    amount: -8,
    memo: "District fee (10%) — Scout · Starter list",
    createdAt: daysAgo(10),
  },
  {
    key: "austin-payout-roofintel-1",
    handle: "austin",
    kind: "payout",
    amount: 423,
    memo: "Payout — RoofIntel · 200 properties (agent revenue)",
    createdAt: daysAgo(9),
  },
  {
    key: "austin-fee-roofintel-1",
    handle: "austin",
    kind: "fee",
    amount: -47,
    memo: "District fee (10%) — RoofIntel · 200 properties",
    createdAt: daysAgo(9),
  },
  {
    key: "austin-release-scout",
    handle: "austin",
    kind: "release",
    amount: -189,
    memo: "Released to Scout — Qualified list (250 businesses)",
    orderKey: "austin-scout-qualified",
    createdAt: at(-8 * 86400 + 3600),
  },
  {
    key: "austin-topup-2",
    handle: "austin",
    kind: "topup",
    amount: 1500,
    memo: "Added credits — card ending 4242",
    createdAt: daysAgo(6),
  },
  {
    key: "austin-release-copycat",
    handle: "austin",
    kind: "release",
    amount: -320,
    memo: "Released to CopyCat — One month content package",
    orderKey: "austin-copycat-social",
    createdAt: at(-5 * 86400 + 2100),
  },
  {
    key: "austin-release-parcelpro",
    handle: "austin",
    kind: "release",
    amount: -110,
    memo: "Released to ParcelPro — Property + comps",
    orderKey: "austin-parcelpro-property",
    createdAt: at(-4 * 86400 + 900),
  },
  {
    key: "austin-payout-quickpdf",
    handle: "austin",
    kind: "payout",
    amount: 108,
    memo: "Payout — QuickPDF · document set (agent revenue)",
    createdAt: daysAgo(3),
  },
  {
    key: "austin-fee-quickpdf",
    handle: "austin",
    kind: "fee",
    amount: -12,
    memo: "District fee (10%) — QuickPDF · document set",
    createdAt: daysAgo(3),
  },
  {
    key: "austin-refund-researchotter",
    handle: "austin",
    kind: "refund",
    amount: 45,
    memo: "Refund — ResearchOtter run cancelled before start",
    createdAt: daysAgo(2),
  },
  {
    key: "austin-hold-webbuilder",
    handle: "austin",
    kind: "hold",
    amount: -578,
    memo: "Hold — WebBuilder · location page refresh (job award)",
    orderKey: "austin-webbuilder-location-pages",
    createdAt: secondsAgo(1440),
  },
  {
    key: "austin-hold-qafox",
    handle: "austin",
    kind: "hold",
    amount: -110,
    memo: "Hold — QA Fox · Smoke pass",
    orderKey: "austin-qafox-regression",
    createdAt: secondsAgo(440),
  },
  {
    key: "austin-hold-roofintel",
    handle: "austin",
    kind: "hold",
    amount: -470,
    memo: "Hold — RoofIntel · 200 properties",
    orderKey: "austin-roofintel-orlando-batch",
    createdAt: secondsAgo(214),
  },
  {
    key: "austin-hold-scout",
    handle: "austin",
    kind: "hold",
    amount: -79,
    memo: "Hold — Scout · Starter list (Brevard gutters)",
    orderKey: "austin-scout-local-lead-research",
    createdAt: secondsAgo(140),
  },
  // The two closed runs. A cancelled or failed run returns its hold, and
  // `refundHold()` *rewrites* the single money-out row rather than adding a
  // second one — so each of these is one `refund` row, positive, and neither
  // counts against `held_cents`.
  {
    key: "austin-refund-unitfox",
    handle: "austin",
    kind: "refund",
    amount: 30,
    memo: "Refund — UnitFox · conversion cancelled before delivery",
    orderKey: "austin-unitfox-cancelled",
    createdAt: daysAgo(3),
  },
  {
    key: "austin-refund-sitesprint",
    handle: "austin",
    kind: "refund",
    amount: 86,
    memo: "Refund — SiteSprint · run failed, hold returned",
    orderKey: "austin-sitesprint-failed",
    createdAt: daysAgo(2),
  },

  /* ------------------------------------------------------------ other humans */
  {
    key: "ray-topup",
    handle: "roofco-ray",
    kind: "topup",
    amount: 30000,
    memo: "Added credits — storm season float",
    createdAt: daysAgo(4),
  },
  {
    key: "ray-hold-storm",
    handle: "roofco-ray",
    kind: "hold",
    amount: -4800,
    memo: "Hold — RoofIntel · Fort Pierce storm sweep",
    orderKey: "roofco-storm-sweep",
    createdAt: hoursAgo(1),
  },
  {
    key: "jess-hold-landing",
    handle: "buildwithjess",
    kind: "hold",
    amount: -3600,
    memo: "Hold — WebBuilder · Stuart HVAC landing page",
    orderKey: "jess-landing-page-stuart",
    createdAt: hoursAgo(1),
  },
  {
    key: "omar-release-quickpdf",
    handle: "orlando-omar",
    kind: "release",
    amount: -900,
    memo: "Released to QuickPDF — 140 permit PDFs",
    orderKey: "omar-permit-pdfs",
    createdAt: at(-6 * 86400 + 5400),
  },
  {
    key: "maria-topup",
    handle: "maria-work",
    kind: "topup",
    amount: 25000,
    memo: "Added credits — monthly ops budget",
    createdAt: daysAgo(7),
  },
  {
    key: "carla-payout",
    handle: "coastal-carla",
    kind: "payout",
    amount: 1842,
    memo: "Payout — Sunshine Data Co market sales",
    createdAt: daysAgo(1),
  },
];

export const walletTransactions: WalletTransaction[] = TXS.map((tx) => ({
  id: id("wallet-transaction", tx.key),
  profile_id: profileId(tx.handle),
  kind: tx.kind,
  amount_cents: tx.amount,
  order_id: tx.orderKey ? orderKeyId(tx.orderKey) : null,
  memo: tx.memo,
  created_at: tx.createdAt,
})).sort((a, b) => b.created_at.localeCompare(a.created_at));
