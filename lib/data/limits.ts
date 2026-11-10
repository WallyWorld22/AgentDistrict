import { formatCents, formatDuration } from "@/lib/utils";
import { RateLimitError, ValidationError } from "./errors";

/**
 * The marketplace's hard limits, shared by both repository adapters so a
 * bounty, a bid, an order or a top-up is refused the same way whether it came
 * from a form, `/api/v1` or the MCP server, and in demo mode as in supabase
 * mode. Where Postgres enforces the same rule (the top-up caps live inside
 * `top_up_wallet()`, migration 0014), the numbers here are the ones the SQL
 * spells out; `tests/unit/limits.test.ts` keeps them in step.
 */

/**
 * The most a single bounty can offer: $100,000.00.
 *
 * A budget is a promise to pay the winning bid, and nothing a wallet can hold
 * this side of real payments comes near it; $1,000,000,000 used to go through.
 */
export const MAX_JOB_BUDGET_CENTS = 10_000_000;

/** The most one top-up can add: $100.00 of demo credits. */
export const TOPUP_MAX_CENTS = 10_000;

/** The most one profile can top up in a UTC day: $500.00 of demo credits. */
export const TOPUP_DAILY_MAX_CENTS = 50_000;

/**
 * The ledger line every top-up writes. Fixed, not caller-chosen: credits are
 * not money until payments exist, and the ledger must not say otherwise.
 * `top_up_wallet()` (0014) writes the same text.
 */
export const TOPUP_MEMO = "Demo credits added — not real money";

/** Free orders one buyer may place in a rolling hour. */
export const FREE_ORDERS_PER_HOUR = 10;
export const FREE_ORDER_WINDOW_MS = 60 * 60 * 1000;

export function assertJobBudget(budgetCents: number): void {
  if (!Number.isFinite(budgetCents) || budgetCents <= 0) {
    throw new ValidationError("Budget must be greater than zero");
  }
  if (budgetCents > MAX_JOB_BUDGET_CENTS) {
    throw new ValidationError(
      `Budgets top out at ${formatCents(MAX_JOB_BUDGET_CENTS)} per bounty.`,
    );
  }
}

/** A bid never asks for more than the bounty offers, nor longer than it allows. */
export function assertBidFitsJob(
  job: { budget_cents: number; deadline_seconds: number },
  amountCents: number,
  etaSeconds: number,
): void {
  if (amountCents > job.budget_cents) {
    throw new ValidationError(
      `A bid can be at most the bounty's ${formatCents(job.budget_cents)} budget — ` +
        `${formatCents(amountCents)} is over it.`,
    );
  }
  if (!Number.isFinite(etaSeconds) || etaSeconds <= 0) {
    throw new ValidationError("Delivery time must be greater than zero");
  }
  if (etaSeconds > job.deadline_seconds) {
    throw new ValidationError(
      `Delivery has to fit the bounty's ${formatDuration(job.deadline_seconds)} deadline — ` +
        `${formatDuration(etaSeconds)} is past it.`,
    );
  }
}

export function liveBidRefusal(agentName: string): string {
  return `${agentName} already has a live bid on this bounty.`;
}

export const SELF_ORDER_REFUSAL =
  "This is your gig — you cannot order it yourself. Share the page with a buyer instead.";

export function topUpPerTopUpMessage(): string {
  return `Each top-up is capped at ${formatCents(TOPUP_MAX_CENTS)} of demo credits.`;
}

export function topUpDailyMessage(leftCents: number): string {
  const left = Math.max(0, leftCents);
  return (
    `Demo top-ups are capped at ${formatCents(TOPUP_DAILY_MAX_CENTS)} a day. ` +
    (left > 0
      ? `You can add up to ${formatCents(left)} more today.`
      : "You have reached today's cap — try again tomorrow (UTC).")
  );
}

/** Refuse a top-up over either cap. `toppedUpTodayCents` is today's (UTC) total so far. */
export function assertTopUp(amountCents: number, toppedUpTodayCents: number): void {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new ValidationError("Top-up must be greater than zero");
  }
  if (amountCents > TOPUP_MAX_CENTS) throw new ValidationError(topUpPerTopUpMessage());
  if (toppedUpTodayCents + amountCents > TOPUP_DAILY_MAX_CENTS) {
    throw new ValidationError(topUpDailyMessage(TOPUP_DAILY_MAX_CENTS - toppedUpTodayCents));
  }
}

/**
 * Refuse a free order past the hourly allowance. `recent` is the creation
 * time (ms) of each free order this buyer placed inside the window.
 */
export function assertFreeOrderAllowance(recent: number[], nowMs: number): void {
  const inWindow = recent.filter((at) => at > nowMs - FREE_ORDER_WINDOW_MS);
  if (inWindow.length < FREE_ORDERS_PER_HOUR) return;
  const oldest = Math.min(...inWindow);
  const retryAfter = Math.max(1, Math.ceil((oldest + FREE_ORDER_WINDOW_MS - nowMs) / 1000));
  throw new RateLimitError(
    `Free gigs are limited to ${FREE_ORDERS_PER_HOUR} orders an hour per account. ` +
      `Try again in ${formatDuration(retryAfter)}.`,
    retryAfter,
  );
}
