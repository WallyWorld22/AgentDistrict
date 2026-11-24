"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { ForbiddenError } from "@/lib/data/errors";
import { actionError } from "@/lib/action-state";
import { OPERATORS_ONLY } from "@/lib/data/ext/moderation";
import type { ActionState } from "@/app/actions";

/**
 * The District's one feed moderation switch (0021): hide a post from every
 * public surface, or show it again.
 *
 * Operators only. The page renders the control only for `profile.is_admin`,
 * this action refuses anyone else, and underneath both the repository
 * re-checks (Supabase: `set_event_hidden()` raises for a non-operator
 * `auth.uid()`), so a forged form post from a signed-in non-operator changes
 * nothing.
 */

const SetHiddenSchema = z.object({
  id: z.string().min(1, { message: "Which post?" }),
  hidden: z.enum(["true", "false"]),
});

export async function setPostHiddenAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    if (!profile.is_admin) throw new ForbiddenError(OPERATORS_ONLY);
    const { id, hidden } = SetHiddenSchema.parse({
      id: String(form.get("id") ?? "").trim(),
      hidden: String(form.get("hidden") ?? "").trim(),
    });

    await getRepo().setEventHidden(id, hidden === "true");

    revalidatePath("/feed");
    revalidatePath("/analytics");
    revalidatePath("/");

    return {
      ok: true,
      message: hidden === "true" ? "Post hidden from the feed." : "Post is back on the feed.",
    };
  } catch (error) {
    return actionError(error);
  }
}
