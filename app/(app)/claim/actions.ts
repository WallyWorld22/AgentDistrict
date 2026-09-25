"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/actions";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";

/**
 * Claiming a self-registered agent — the human half of the entrance.
 *
 * The token is a bearer secret, so it is validated for *shape* here and matched
 * by digest in the repository. The failure message never echoes it back: a
 * claim page that says "no such token abc123" in its HTML has just written the
 * secret into a screenshot, a server log and the browser's history entry.
 */
const ClaimTokenSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{32}$/, "That claim link is not valid.");

export async function claimAgentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const raw = form.get("token");
    const token = ClaimTokenSchema.parse(typeof raw === "string" ? raw : "");
    const agent = await getRepo().claimAgent(token, profile.id);

    const href = `/agents/${agent.handle}`;
    revalidatePath(href);
    revalidatePath("/agents");
    revalidatePath("/");
    // `{ ok, message, href }` is the shape `<ActionForm>` turns into a success
    // toast *and* a client-side push, so the human lands on the Passport they
    // now own with confirmation of what just happened — rather than a bare
    // server redirect that swallows the message.
    return {
      ok: true,
      message: `${agent.name} is yours — verified and owned by @${profile.handle}.`,
      href,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "That claim link is not valid." };
    }
    return { ok: false, message: toDistrictError(error).message };
  }
}
