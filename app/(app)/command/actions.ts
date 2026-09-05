"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import type { OrderStatus } from "@/lib/data/types";
import {
  PAUSED_AUTONOMOUS_LIMIT_CENTS,
  walletPolicyWriter,
} from "@/lib/data/ext/jobs";
import type { ActionState } from "@/app/actions";
import { pausedPreviousLimitCents, writeSpendPause } from "./spend-pause";

/**
 * Command Center Server Actions.
 *
 * The approvals queue reuses `approveOrderAction` from `app/actions.ts`; what
 * lives here is the spend kill switch and the poll that keeps active runs
 * moving without a page reload.
 */

const PauseSchema = z.object({ paused: z.boolean() });

/**
 * "Pause all external agent spending".
 *
 * Writes the session-level pause (see `./spend-pause`) and, the moment the
 * repository grows a `setWalletPolicy`, clamps the wallet's daily autonomous
 * ceiling to one cent as well — one cent rather than zero, because the data
 * layer reads a zero limit as "no ceiling at all". Lifting the pause restores
 * the ceiling that was recorded when it went on.
 */
export async function setSpendPauseAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const { paused } = PauseSchema.parse({ paused: form.get("paused") === "1" });

    const repo = getRepo();
    const wallet = await repo.getWallet(profile.id);
    const writer = walletPolicyWriter(repo);
    const previous = wallet?.autonomous_spend_limit_cents ?? 0;

    if (paused) {
      await writeSpendPause(true, previous);
      await writer?.setWalletPolicy(profile.id, {
        autonomous_spend_limit_cents: PAUSED_AUTONOMOUS_LIMIT_CENTS,
      });
    } else {
      const restore = (await pausedPreviousLimitCents()) ?? previous;
      await writeSpendPause(false);
      await writer?.setWalletPolicy(profile.id, {
        autonomous_spend_limit_cents: restore,
      });
    }

    revalidatePath("/command");
    revalidatePath("/workplace");
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
