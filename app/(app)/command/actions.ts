"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import type { OrderStatus } from "@/lib/data/types";
import type { ActionState } from "@/app/actions";

/**
 * Command Center Server Actions.
 *
 * The approvals queue reuses `approveOrderAction` from `app/actions.ts`; what
 * lives here is the spend kill switch and the poll that keeps active runs
 * moving without a page reload.
 */

/**
 * The switch sends the state it *wants*, or `toggle` when it cannot be sure —
 * a stale tab rendered before someone else flipped it. Either way the action
 * reads the wallet first, so two submits in a row cannot leave the District in
 * a state nobody asked for.
 */
const PauseSchema = z.object({ intent: z.enum(["pause", "resume", "toggle"]) });

/**
 * "Pause all external agent spending".
 *
 * One write, to `wallets.autonomous_paused` — the same row `holdFunds` reads
 * inside the transaction that places a hold, so @World, an API key and an MCP
 * client are all refused while it is on, and every browser sees the same
 * switch. Nothing is clamped and nothing has to be restored.
 */
export async function setSpendPauseAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const raw = String(form.get("intent") ?? "toggle");
    const { intent } = PauseSchema.parse({
      intent: raw === "pause" || raw === "resume" ? raw : "toggle",
    });

    const repo = getRepo();
    const wallet = await repo.getWallet(profile.id);
    const current = wallet?.autonomous_paused ?? false;
    const paused = intent === "toggle" ? !current : intent === "pause";

    if (paused !== current) {
      await repo.updateWalletPolicy(profile.id, { autonomousPaused: paused });
    }

    revalidatePath("/command");
    revalidatePath("/workplace");
    revalidatePath("/wallet");
    return {
      ok: true,
      message: paused
        ? "External agent spending paused."
        : "External agent spending resumed.",
    };
  } catch (error) {
    return { ok: false, message: toDistrictError(error).message };
  }
}

export type RunPulse = {
  id: string;
  status: OrderStatus;
  progress: number;
};

/**
 * Advance every in-flight run and report where they are.
 *
 * `listOrders` runs the same deterministic progress path as `refreshOrder`, so
 * reading is what advances the clock (BUILD_SPEC §6). The client component
 * polls this and asks Next to re-render once a run leaves the running state.
 */
export async function refreshRunsAction(): Promise<RunPulse[]> {
  try {
    const profile = await requireProfile();
    const orders = await getRepo().listOrders({ buyerId: profile.id, limit: 50 });
    return orders
      .filter(
        (order) =>
          order.status === "queued" ||
          order.status === "running" ||
          order.status === "delivered",
      )
      .map((order) => ({
        id: order.id,
        status: order.status,
        progress: order.progress,
      }));
  } catch {
    return [];
  }
}
