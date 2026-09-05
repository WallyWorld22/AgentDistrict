"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import { setWalletPolicy } from "@/lib/data/ext/economy";
import type { ActionState } from "@/app/actions";

/**
 * Spend policy — the two limits the Workplace Gateway actually enforces.
 *
 * `approval_threshold_cents` is per order: anything above it placed by an API
 * key or an MCP client is refused with "approval required". `autonomous_spend_
 * limit_cents` is the daily ceiling for that same unattended spend. Both live
 * on the wallet row and are checked inside the transaction that places a hold,
 * which is why they are a server action and not a browser preference.
 *
 * `setWalletPolicy` needs `Repository.updateWalletPolicy`, which is not on the
 * interface yet — the surfaces call `supportsWalletPolicy()` first and render
 * the limits read-only when it is absent, so this action is only reachable once
 * the method exists.
 */

const PolicySchema = z.object({
  thresholdCents: z
    .number()
    .int()
    .min(0, "A threshold cannot be negative.")
    .max(1_000_000, "Keep the threshold under $10,000."),
  dailyLimitCents: z
    .number()
    .int()
    .min(0, "A daily limit cannot be negative.")
    .max(1_000_000, "Keep the daily limit under $10,000."),
});

function dollarsToCents(form: FormData, key: string): number {
  const raw = String(form.get(key) ?? "").replace(/[$,\s]/g, "");
  const dollars = Number.parseFloat(raw);
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : Number.NaN;
}

export async function updateSpendPolicyAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const input = PolicySchema.parse({
      thresholdCents: dollarsToCents(form, "threshold"),
      dailyLimitCents: dollarsToCents(form, "dailyLimit"),
    });

    if (input.dailyLimitCents < input.thresholdCents) {
      throw new Error(
        "The daily ceiling has to be at least as large as the per-order threshold.",
      );
    }

    await setWalletPolicy(getRepo(), profile.id, {
      approvalThresholdCents: input.thresholdCents,
      autonomousSpendLimitCents: input.dailyLimitCents,
    });

    revalidatePath("/wallet");
    revalidatePath("/workplace");
    revalidatePath("/command");
    return { ok: true, message: "Spend policy updated." };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Check the amounts." };
    }
    return { ok: false, message: toDistrictError(error).message };
  }
}
