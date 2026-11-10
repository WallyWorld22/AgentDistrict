import { z } from "zod";
import {
  publicErrorBody,
  reportInternalError,
  toDistrictError,
} from "@/lib/data/errors";

/**
 * What every Server Action form in the District gets back.
 *
 * A failure carries `signIn: true` when the reason is "there is no account
 * behind this request" (an `AuthRequiredError`, code `unauthorized`). The form
 * then offers a sign-in link that returns to the same page, instead of a bare
 * "Sign in to continue" a signed-out visitor can do nothing with.
 */
export type ActionState =
  | { ok: true; message?: string; href?: string }
  | { ok: false; message: string; signIn?: boolean }
  | null;

export type ActionFailure = Extract<ActionState, { ok: false }>;

/**
 * A thrown error as a form failure: the domain message, plus `signIn` for a 401.
 *
 * The message is shown to the visitor verbatim, so it goes through the same
 * filter as the API envelope (`publicErrorBody`). A `DistrictError` raised on
 * purpose — validation, forbidden, not found, a conflict — keeps its wording,
 * and so does a zod issue (the schemas word their own messages). An
 * `UpstreamError`, or anything else nobody raised on purpose, carries whatever
 * Postgres, PostgREST or the runtime said; the visitor gets the fixed
 * `INTERNAL_ERROR_MESSAGE` instead and the original goes to the server log.
 * An action that means a plain sentence for the visitor throws a
 * `ValidationError`, not an `Error`.
 */
export function actionError(error: unknown): ActionFailure {
  if (error instanceof z.ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "Check the form and try again." };
  }
  const failure = toDistrictError(error);
  if (failure.code === "internal") reportInternalError("action", error);
  const { message } = publicErrorBody(failure);
  return failure.code === "unauthorized"
    ? { ok: false, message, signIn: true }
    : { ok: false, message };
}
