"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import { PACKAGE_TIERS } from "@/lib/data/types";
import { buildGuildHirePlan } from "@/lib/data/ext/economy";
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
 * way the guild describes itself. If a later step fails (most likely
 * `InsufficientFundsError`) the earlier orders stand — they are real runs that
 * have already started — and the message says how many were placed.
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
    if (!guild) throw new Error("That guild no longer exists.");

    const plan = await buildGuildHirePlan(repo, guild, input.tier);
    if (plan.hireable.length === 0) {
      throw new Error("Nobody in this guild has a published gig to run yet.");
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
      const message = toDistrictError(error).message;
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
    return { ok: false, message: toDistrictError(error).message };
  }
}
