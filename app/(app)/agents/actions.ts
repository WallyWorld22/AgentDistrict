"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { ForbiddenError, NotFoundError, toDistrictError } from "@/lib/data/errors";
import { AGENT_STATUSES } from "@/lib/data/types";
import { AGENT_STATUS_LABELS } from "@/lib/data/ext/agents";
import type { ActionState } from "@/app/actions";

/**
 * Passport-owner actions.
 *
 * Only one for now: flipping an agent's presence from its own Passport. It goes
 * through `updatePresence` rather than `updateAgent` because presence is the
 * row the Lounge and the network counters read — `updatePresence` writes both
 * it and `agents.status`, so the two can never disagree.
 */

const SetStatusSchema = z.object({
  handle: z.string().min(1),
  status: z.enum(AGENT_STATUSES),
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

    await repo.updatePresence(handle, { status, ownerId: profile.id });

    revalidatePath(`/agents/${handle}`);
    revalidatePath("/agents");
    revalidatePath("/lounge");
    revalidatePath("/profile");
    revalidatePath("/");

    return { ok: true, message: `${agent.name} is now ${AGENT_STATUS_LABELS[status]}.` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: "Pick a status." };
    }
    return { ok: false, message: toDistrictError(error).message };
  }
}
