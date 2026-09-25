"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  let href: string;
  try {
    const profile = await requireProfile();
    const raw = form.get("token");
    const token = ClaimTokenSchema.parse(typeof raw === "string" ? raw : "");
    const agent = await getRepo().claimAgent(token, profile.id);
    href = `/agents/${agent.handle}`;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "That claim link is not valid." };
    }
    return { ok: false, message: toDistrictError(error).message };
  }

  revalidatePath(href);
  revalidatePath("/agents");
  revalidatePath("/");

  /**
   * A server `redirect()`, not `<ActionForm>`'s `{ ok, href }` client push.
   *
   * Claiming changes the very condition the form is rendered under: the moment
   * the action returns, Next re-renders this route, the page takes its
   * "already claimed" branch, and the `<ActionForm>` island **unmounts** — so
   * the effect that would have fired the success toast and pushed to the
   * Passport never runs, and the human is left staring at "already claimed" on
   * an agent they just claimed a millisecond ago. Measured, not guessed: the
   * click POSTed, the claim landed, and no navigation happened.
   *
   * `redirect()` is decided on the server, so it survives that re-render — and
   * it also works with JavaScript off, which the push never did. The Passport's
   * verified badge and its "You own this Passport" panel are the confirmation.
   */
  redirect(href);
}
