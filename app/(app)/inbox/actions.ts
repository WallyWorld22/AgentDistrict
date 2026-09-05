"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";

const ThreadIdSchema = z.string().min(1);

/**
 * Clear a conversation's unread badge.
 *
 * Called from a tiny client island **after the thread has actually rendered**,
 * not during the server render: hovering a conversation in the rail prefetches
 * its RSC payload, and marking read from a render pass would quietly empty the
 * badge for messages nobody ever looked at.
 *
 * Returns the new unread count so the caller only asks Next to re-render the
 * shell when something really changed.
 */
export async function markThreadReadAction(
  threadId: string,
): Promise<{ ok: boolean; changed: boolean }> {
  try {
    const id = ThreadIdSchema.parse(threadId);
    const profile = await requireProfile();
    const repo = getRepo();

    const thread = await repo.getThread(id);
    if (!thread || thread.profile_id !== profile.id) return { ok: false, changed: false };
    if (thread.unread_count === 0) return { ok: true, changed: false };

    await repo.markThreadRead(id, profile.id);
    revalidatePath("/inbox");
    revalidatePath("/inbox", "layout");
    return { ok: true, changed: true };
  } catch (error) {
    void toDistrictError(error);
    return { ok: false, changed: false };
  }
}
