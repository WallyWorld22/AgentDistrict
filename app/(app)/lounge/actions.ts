"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import { AGENT_STATUSES, type LoungeMessage } from "@/lib/data/types";
import { chatTranscript, messagesForRoom } from "@/lib/data/ext/lounge";
import { isLeagueFighter, leagueFighterRefusal } from "@/lib/data/league";
import type { ActionState } from "@/app/actions";

/**
 * The Lounge's own Server Actions.
 *
 * Posting reuses `postLoungeMessageAction` from `app/actions.ts`; what lives
 * here is the transcript read the realtime hook falls back to in demo mode
 * (`lib/realtime/use-lounge-messages.ts`) and the "join this room" presence
 * write.
 */

const TRANSCRIPT_LIMIT = 40;

/**
 * Current transcript for a room (or the whole Lounge when `roomSlug` is null).
 *
 * Reads only — it never mutates — so it is safe to call every four seconds.
 */
export async function fetchLoungeMessagesAction(
  roomSlug: string | null,
): Promise<LoungeMessage[]> {
  try {
    const slug = roomSlug && /^[a-z0-9-]{1,64}$/.test(roomSlug) ? roomSlug : undefined;
    const messages = await getRepo().listLoungeMessages(slug, TRANSCRIPT_LIMIT);
    return chatTranscript(messagesForRoom(messages, slug ?? null), TRANSCRIPT_LIMIT);
  } catch {
    return [];
  }
}

const JoinRoomSchema = z.object({
  agentHandle: z.string().min(1, "Pick one of your agents."),
  roomSlug: z.string().min(1, "Pick a room."),
  status: z.enum(AGENT_STATUSES),
});

/**
 * "Join this room with your agent" — moves one of the signed-in creator's
 * agents into the room and sets its presence status.
 */
export async function joinRoomAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const input = JoinRoomSchema.parse({
      agentHandle: String(form.get("agentHandle") ?? "").trim(),
      roomSlug: String(form.get("roomSlug") ?? "").trim(),
      status: String(form.get("status") ?? "available").trim(),
    });

    const repo = getRepo();
    const owned = await repo.listAgentsByOwner(profile.id);
    const agent = owned.find((entry) => entry.handle === input.agentHandle);
    if (!agent) throw new Error("That agent is not one of yours.");
    // Taking a seat with a status is going online; a fighter stays offline.
    if (input.status !== "offline" && isLeagueFighter(agent)) {
      return { ok: false, message: leagueFighterRefusal(agent.name, "go online or take work") };
    }

    await repo.updatePresence(agent.handle, {
      status: input.status,
      roomSlug: input.roomSlug,
      ownerId: profile.id,
    });

    revalidatePath(`/lounge/${input.roomSlug}`);
    revalidatePath("/lounge");
    revalidatePath("/");
    return { ok: true, message: `${agent.name} is in the room.` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Check the form." };
    }
    return { ok: false, message: toDistrictError(error).message };
  }
}
