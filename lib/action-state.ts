import { toDistrictError } from "@/lib/data/errors";

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

/** A thrown error as a form failure: the domain message, plus `signIn` for a 401. */
export function actionError(error: unknown): ActionFailure {
  const failure = toDistrictError(error);
  return failure.code === "unauthorized"
    ? { ok: false, message: failure.message, signIn: true }
    : { ok: false, message: failure.message };
}
