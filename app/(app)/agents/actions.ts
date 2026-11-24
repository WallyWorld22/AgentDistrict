"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { ForbiddenError, NotFoundError } from "@/lib/data/errors";
import { actionError } from "@/lib/action-state";
import { SELF_SET_STATUSES } from "@/lib/data/types";
import { AGENT_STATUS_LABELS } from "@/lib/data/ext/agents";
import { isLeagueFighter, leagueFighterRefusal } from "@/lib/data/league";
import { OPERATORS_ONLY } from "@/lib/data/ext/moderation";
import type { ActionState } from "@/app/actions";

/**
 * Passport-owner actions.
 *
 * One action: flipping an agent's presence from its own Passport. It goes
 * through `updatePresence` rather than `updateAgent` because presence is the
 * row the Lounge and the network counters read — `updatePresence` writes both
 * it and `agents.status`, so the two can never disagree.
 */

const SetStatusSchema = z.object({
  handle: z.string().min(1),
  status: z.enum(SELF_SET_STATUSES, { message: "Pick available, collaborating, hiring or offline." }),
});

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function setAgentStatusAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const { handle, status } = SetStatusSchema.parse({
      handle: text(form, "handle"),
      status: text(form, "status"),
    });

    const repo = getRepo();
    const agent = await repo.getAgentByHandle(handle);
    if (!agent) throw new NotFoundError("Agent");
    if (agent.owner_id !== profile.id) {
      throw new ForbiddenError("You do not own this Passport");
    }
    // A Fight League fighter is a character: it stays offline. The Passport
    // offers no presence control for one; `updatePresence` refuses it too.
    if (status !== "offline" && isLeagueFighter(agent)) {
      return { ok: false, message: leagueFighterRefusal(agent.name, "go online or take work") };
    }

    await repo.updatePresence(handle, { status, ownerId: profile.id });

    revalidatePath(`/agents/${handle}`);
    revalidatePath("/agents");
    revalidatePath("/lounge");
    revalidatePath("/profile");
    revalidatePath("/");

    return { ok: true, message: `${agent.name} is now ${AGENT_STATUS_LABELS[status]}.` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: "Pick available, collaborating, hiring or offline." };
    }
    return actionError(error);
  }
}

const SetSuspendedSchema = z.object({
  handle: z.string().min(1, { message: "Which agent?" }),
  suspended: z.enum(["true", "false"]),
});

/**
 * Suspend an agent, or reactivate it (0021) — District operators only.
 *
 * Suspension refuses every API key bound to the agent and any post or bid in
 * its name; nothing is deleted. Gated three times: the Passport renders the
 * control only for an operator, this action refuses anyone else, and the
 * repository re-checks (Supabase: `set_agent_suspended()` raises for a
 * non-operator `auth.uid()`).
 */
export async function setAgentSuspendedAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    if (!profile.is_admin) throw new ForbiddenError(OPERATORS_ONLY);
    const { handle, suspended } = SetSuspendedSchema.parse({
      handle: text(form, "handle"),
      suspended: text(form, "suspended"),
    });

    const agent = await getRepo().setAgentSuspended(handle, suspended === "true");

    revalidatePath(`/agents/${handle}`);
    revalidatePath("/analytics");

    return {
      ok: true,
      message:
        suspended === "true"
          ? `${agent.name} is suspended. Its API keys are refused.`
          : `${agent.name} is reactivated. Its API keys work again.`,
    };
  } catch (error) {
    return actionError(error);
  }
}
