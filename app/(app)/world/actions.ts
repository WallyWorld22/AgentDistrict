"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import { pickGigForOutcome } from "@/lib/data/ext/jobs";
import { routeOutcome } from "@/lib/world";
import type { ActionState } from "@/app/actions";
import { isSpendPaused } from "@/app/(app)/command/spend-pause";

/**
 * @World Server Actions (BUILD_SPEC §4/§5).
 *
 * Routing itself is a GET — the result page is a shareable URL — so the prompt
 * action only redirects. The two spending actions are the ones that matter:
 * both run as the signed-in human with `approved: true`, and both refuse while
 * the Command Center's "Pause all external agent spending" switch is on, which
 * is what makes that switch a control rather than a decoration.
 */

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const PAUSED_MESSAGE =
  "External agent spending is paused in the Command Center. Resume it there to let @World start runs.";

/** Submit the prompt: `/world?outcome=…` so the answer has its own URL. */
export async function askWorldAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const outcome = text(form, "outcome");
  if (outcome.length < 4) {
    return { ok: false, message: "Describe the outcome you want — a sentence is plenty." };
  }
  redirect(`/world?outcome=${encodeURIComponent(outcome)}`);
}

/**
 * "Assemble & run" — one real order per pipeline step.
 *
 * The proposal is recomputed server-side from the same outcome rather than
 * trusted from the form, so a tampered payload cannot order something the page
 * never showed. Each step runs on that agent's closest published gig.
 */
export async function assembleGuildAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const outcome = text(form, "outcome");
    if (outcome.length < 4) throw new Error("Describe the outcome you want.");
    if (await isSpendPaused()) return { ok: false, message: PAUSED_MESSAGE };

    const repo = getRepo();
    const result = await routeOutcome({ outcome }, { repo });
    const steps =
      result.guild?.steps ??
      result.ranked.slice(0, 1).map((entry) => ({ role: "Run", agent: entry.agent }));
    if (steps.length === 0) throw new Error("No agent in the District fits that yet.");

    const created: string[] = [];
    const names: string[] = [];
    for (const step of steps) {
      const gigs = await repo.listGigs({ agentHandle: step.agent.handle, limit: 12 });
      const gig = pickGigForOutcome(gigs, result.intent.categories);
      if (!gig) continue;
      const order = await repo.orderGig({
        gigSlug: gig.slug,
        tier: "basic",
        brief: `${step.role}: ${outcome}`,
        buyerId: profile.id,
        approved: true,
      });
      created.push(order.id);
      names.push(step.agent.name);
    }

    if (created.length === 0) {
      throw new Error("Those agents have no published gigs to run yet.");
    }

    revalidatePath("/command");
    revalidatePath("/orders");
    revalidatePath("/wallet");
    return {
      ok: true,
      message: `Guild assembled — ${names.join(", ")} are working.`,
      href: `/command?runs=${created.join(",")}`,
    };
  } catch (error) {
    return { ok: false, message: toDistrictError(error).message };
  }
}

/** Hire one ranked agent on its closest gig, with the outcome as the brief. */
export async function hireRankedAgentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const handle = text(form, "agentHandle");
    const outcome = text(form, "outcome");
    if (!handle) throw new Error("Pick an agent to hire.");
    if (await isSpendPaused()) return { ok: false, message: PAUSED_MESSAGE };

    const repo = getRepo();
    const agent = await repo.getAgentByHandle(handle);
    if (!agent) throw new Error("That agent is no longer in the District.");

    const result = await routeOutcome({ outcome }, { repo, limit: 1 });
    const gigs = await repo.listGigs({ agentHandle: handle, limit: 12 });
    const gig = pickGigForOutcome(gigs, [agent.category, ...result.intent.categories]);
    if (!gig) throw new Error(`${agent.name} has no published gig to run this on yet.`);

    const order = await repo.orderGig({
      gigSlug: gig.slug,
      tier: "basic",
      brief: outcome || gig.input_contract.summary,
      buyerId: profile.id,
      approved: true,
    });

    revalidatePath("/command");
    revalidatePath("/orders");
    revalidatePath("/wallet");
    return {
      ok: true,
      message: `${agent.name} hired — the run has started.`,
      href: `/orders/${order.id}`,
    };
  } catch (error) {
    return { ok: false, message: toDistrictError(error).message };
  }
}
