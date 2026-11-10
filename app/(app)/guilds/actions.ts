"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { InsufficientFundsError, ValidationError } from "@/lib/data/errors";
import { actionError } from "@/lib/action-state";
import { PACKAGE_TIERS } from "@/lib/data/types";
import { buildGuildHirePlan, walletSummary } from "@/lib/data/ext/economy";
import { formatCents } from "@/lib/utils";
import type { ActionState } from "@/app/actions";

/**
 * Hire a whole guild.
 *
 * A guild is a pipeline, not a single seller, so hiring one creates **one order
 * per member** on that member's headline gig — the same shape @World's
 * "Assemble & run" produces. Every order carries `approved: true`: the buyer
 * saw the total on the page and clicked, and that *is* the approval the
 * Workplace Gateway's threshold asks for.
 *
 * The orders are placed in pipeline order so the Command Center lists them the
 * way the guild describes itself. Everything that would stop the hire part-way
 * is settled **before the first order** (economy-02): the whole team's total is
 * checked against the wallet's available credits, and a member the buyer owns
 * is skipped (a gig cannot be ordered by its own owner) and priced out of that
 * total, as the page shows it. Only a failure nobody could see coming
 * — a race with another spend — can still stop it part-way; then the earlier
 * orders stand, being real runs that have started, and the message says how
 * many were placed.
 */

const HireSchema = z.object({
  slug: z.string().min(1),
  tier: z.enum(PACKAGE_TIERS),
  brief: z.string().min(8, "Tell the guild what outcome you want — a sentence is enough."),
});

export async function hireGuildAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const input = HireSchema.parse({
      slug: String(form.get("slug") ?? "").trim(),
      tier: String(form.get("tier") ?? "basic").trim(),
      brief: String(form.get("brief") ?? "").trim(),
    });

    const repo = getRepo();
    const guild = await repo.getGuildBySlug(input.slug);
    if (!guild) throw new ValidationError("That guild no longer exists.");

    // Members the buyer owns are skipped, exactly as the page priced them.
    const plan = await buildGuildHirePlan(repo, guild, input.tier, { buyerId: profile.id });
    if (plan.hireable.length === 0) {
      throw new ValidationError(
        plan.owned.length > 0
          ? "Every member of this guild with a gig to run is one of your own agents."
          : "Nobody in this guild has a published gig to run yet.",
      );
    }

    const wallet = await repo.getWallet(profile.id);
    const available = wallet ? walletSummary(wallet).available : 0;
    if (plan.totalCents > available) {
      throw new InsufficientFundsError(
        `Hiring ${guild.name} costs ${formatCents(plan.totalCents)}, and you have ` +
          `${formatCents(available)} available. Add credits on the Wallet or pick a ` +
          "smaller package — nothing was ordered.",
      );
    }

    let placed = 0;
    try {
      for (const step of plan.hireable) {
        if (!step.gig) continue;
        await repo.orderGig({
          gigSlug: step.gig.slug,
          tier: step.tier,
          brief: `${guild.name} · ${step.role}: ${input.brief}`,
          buyerId: profile.id,
          approved: true,
        });
        placed += 1;
      }
    } catch (error) {
      if (placed === 0) throw error;
      // The same filter as every other form failure: database text stays in
      // the server log.
      const message = actionError(error).message;
      revalidatePath("/command");
      revalidatePath("/wallet");
      return {
        ok: false,
        message: `${placed} of ${plan.hireable.length} runs started, then: ${message}`,
      };
    }

    revalidatePath("/command");
    revalidatePath("/wallet");
    revalidatePath(`/guilds/${input.slug}`);
    return {
      ok: true,
      message: `${guild.name} hired — ${placed} ${placed === 1 ? "run" : "runs"} started.`,
      href: "/command",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Check the form." };
    }
    return actionError(error);
  }
}
