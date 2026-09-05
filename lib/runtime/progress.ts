import type { CostBreakdown, Cents, Order, OrderStatus } from "@/lib/data/types";

/**
 * Deterministic run mechanics (BUILD_SPEC §6).
 *
 * Progress is a pure function of `started_at`, `eta_seconds` and the current
 * time — no randomness, no stored counters. That is what lets `refreshOrder()`
 * reproduce a seeded order's progress exactly on first load instead of jumping.
 */

/** District takes 10% of every order. */
export const DISTRICT_FEE_RATE = 0.1;
/** Tool/compute cost carried by the agent, shown in the cost breakdown. */
export const TOOLS_RATE = 0.05;

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * `progress = 100 × (now − started_at) / eta_seconds`, clamped to 0..100.
 * An order that has not started yet stays at its stored progress.
 */
export function computeProgress(order: Order, nowMs: number): number {
  if (order.status === "approved" || order.status === "delivered") return 100;
  if (order.status === "cancelled" || order.status === "failed") return order.progress;
  if (!order.started_at) return order.progress;
  const started = Date.parse(order.started_at);
  if (!Number.isFinite(started)) return order.progress;
  const eta = Math.max(1, order.eta_seconds);
  return clampProgress((100 * (nowMs - started)) / (eta * 1000));
}

/** `queued` until work begins, `running` in flight, `delivered` at 100%. */
export function projectedStatus(order: Order, progress: number): OrderStatus {
  if (order.status !== "queued" && order.status !== "running") return order.status;
  if (progress >= 100) return "delivered";
  if (progress <= 0) return "queued";
  return "running";
}

/** When the run will have finished: `started_at + eta_seconds`. */
export function deliveryTime(order: Order, nowMs: number): number {
  const started = order.started_at ? Date.parse(order.started_at) : nowMs;
  const base = Number.isFinite(started) ? started : nowMs;
  return Math.min(nowMs, base + order.eta_seconds * 1000);
}

/**
 * 10% District fee + 5% tools + the rest to the agent. Always sums exactly to
 * `amount` — the same split the seed writes, so approving a seeded order does
 * not change its numbers.
 */
export function costBreakdownFor(amount: Cents): CostBreakdown {
  const districtFee = Math.round(amount * DISTRICT_FEE_RATE);
  const tools = Math.round(amount * TOOLS_RATE);
  return {
    agent_cents: amount - districtFee - tools,
    district_fee_cents: districtFee,
    tools_cents: tools,
    total_cents: amount,
  };
}

/**
 * What actually moves when a buyer approves: the District keeps 10% and 90% is
 * released as payout (the agent nets that minus its own tool cost, which is
 * what `costBreakdownFor` itemises).
 */
export function settlement(amount: Cents): {
  districtFeeCents: Cents;
  payoutCents: Cents;
} {
  const districtFeeCents = Math.round(amount * DISTRICT_FEE_RATE);
  return { districtFeeCents, payoutCents: amount - districtFeeCents };
}
