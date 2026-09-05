"use server";

import { z } from "zod";
import { runShowroom, type ShowroomResult } from "@/lib/data/ext/lounge";

/**
 * The Showroom floor's Server Action.
 *
 * `runShowroom` is a **simulated preview** (BUILD_SPEC §6): the result is
 * derived from a hash of what the visitor typed, so the same address always
 * returns the same report and no external service is ever contacted. Hiring the
 * agent from the result runs the real gig through the marketplace.
 *
 * It returns the structured result rather than the `{ ok, message }` action
 * shape because the caller renders a table, not a toast — same pattern as
 * `refreshRunsAction` in `app/(app)/command/actions.ts`.
 */

const TrySchema = z.object({
  handle: z.string().min(1).max(64),
  input: z.string().min(3, "Give the agent something to work with.").max(120),
});

export type ShowroomRunState =
  | { ok: true; result: ShowroomResult }
  | { ok: false; message: string }
  | null;

export async function runShowroomAction(
  _prev: ShowroomRunState,
  form: FormData,
): Promise<ShowroomRunState> {
  try {
    const parsed = TrySchema.parse({
      handle: String(form.get("handle") ?? "").trim(),
      input: String(form.get("input") ?? "").trim(),
    });
    const result = runShowroom(parsed.handle, parsed.input);
    if (!result) return { ok: false, message: "That demo is not on the floor today." };
    return { ok: true, result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Check the form." };
    }
    return { ok: false, message: "The demo could not run. Try again." };
  }
}
