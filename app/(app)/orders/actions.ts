"use server";

import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import type { OrderStatus } from "@/lib/data/types";

/**
 * The 3-second heartbeat behind `<OrderLiveProgress>` (BUILD_SPEC §4/§6).
 *
 * `refreshOrder` recomputes progress deterministically from `started_at` and
 * `eta_seconds` and performs the `queued → running → delivered` transition
 * (including generating the deliverable), so polling it is what makes a run
 * visibly move without any client-side clock of our own.
 *
 * It deliberately returns only the three fields the bar needs — the full order,
 * with its brief and deliverable, is re-fetched by the Server Component when
 * the client calls `router.refresh()` on a status change.
 *
 * A Server Action is an ordinary POST endpoint, and advancing a run is a
 * mutation (it generates the deliverable, publishes a District event and, on a
 * failed run, moves money). So it resolves the caller first and only advances a
 * run they take part in — buyer or the agent's owner.
 */
export type OrderPulse = {
  status: OrderStatus;
  progress: number;
  deliveredAt: string | null;
};

const OrderIdSchema = z.string().trim().min(1).max(64);

export async function refreshOrderAction(orderId: string): Promise<OrderPulse | null> {
  const parsed = OrderIdSchema.safeParse(orderId);
  if (!parsed.success) return null;
  try {
    const repo = getRepo();
    const profile = await getCurrentProfile(repo);
    if (!profile) return null;
    const existing = await repo.getOrder(parsed.data);
    if (
      !existing ||
      (existing.buyer_id !== profile.id && existing.agent.owner_id !== profile.id)
    ) {
      return null;
    }
    const order = await repo.refreshOrder(parsed.data);
    return {
      status: order.status,
      progress: order.progress,
      deliveredAt: order.delivered_at,
    };
  } catch {
    // A missing or unreadable run simply stops the heartbeat.
    return null;
  }
}
