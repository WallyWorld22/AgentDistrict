"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { FormAlert } from "@/components/feature/form-alert";
import type { ActionState } from "@/app/actions";

export type ActionFormProps = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  /** Submit button label. Omit to supply your own submit control. */
  submitLabel?: React.ReactNode;
  submitVariant?: ButtonProps["variant"];
  submitSize?: ButtonProps["size"];
  fullWidth?: boolean;
  /** Toast title shown on success. Omit for a silent success. */
  successToast?: string;
  /**
   * Reset the form's fields after a successful submit. On by default, which is
   * what a plain React `<form action>` did; pass `false` to keep the values.
   * A failed submit never resets: the visitor fixes the one field the message
   * names and sends the rest as they typed it.
   */
  resetOnSuccess?: boolean;
  /**
   * Called once after a successful submit — how a dialog closes itself.
   *
   * A sheet that stays open with the amount still filled invites an accidental
   * second submit, and the toast lands inside the dialog rather than on the
   * page behind it.
   */
  onSuccess?: () => void;
  className?: string;
  /**
   * Rendered instead of the default submit button. A function receives the
   * pending flag so a custom control can still show progress; pass `null` to
   * render no submit control at all.
   */
  footer?: React.ReactNode | ((pending: boolean) => React.ReactNode);
};

/**
 * The one client wrapper every mutation form in the District uses.
 *
 * It owns the three things a Server Action form always needs and nothing else:
 * pending state on the submit button, the returned `{ ok: false, message }`
 * rendered inline (and announced; a sign-in failure as a link back to this
 * page, see `FormAlert`), and an optional success toast. Errors from
 * `lib/data/errors` already carry user-facing copy, so the message is shown
 * verbatim.
 *
 * **A failed submit keeps what was typed.** React 19 resets a `<form action>`
 * after every action, success or failure. After a server-side error that wiped
 * the text and put every uncontrolled `<select>` back on its first option — on
 * Publish a gig the agent picker snapped back to the first agent, so the next
 * submit published under the wrong one — and it unchecked a controlled radio
 * group while its React state still showed the old pick (the review form then
 * posted 5 stars whatever the stars showed). So once hydrated, the submit is
 * handled here: `onSubmit` prevents React's own dispatch (which is where the
 * reset lives) and calls the action inside a transition, so pending state and
 * `useFormStatus` behave exactly as before. The form is reset only after a
 * success. `action` stays on the element so a submit before hydration still
 * reaches the Server Action.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  submitVariant = "primary",
  submitSize = "md",
  fullWidth,
  successToast,
  resetOnSuccess = true,
  onSuccess,
  className,
  footer,
}: ActionFormProps) {
  const [state, formAction, pending] = React.useActionState(action, null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const { toast } = useToast();
  const router = useRouter();
  const lastHandled = React.useRef<ActionState>(null);

  React.useEffect(() => {
    if (!state || state === lastHandled.current) return;
    lastHandled.current = state;
    if (!state.ok) return;
    if (resetOnSuccess) formRef.current?.reset();
    if (successToast || state.message) {
      toast({ title: successToast ?? state.message ?? "Done", tone: "success" });
    }
    if (state.href) router.push(state.href);
    onSuccess?.();
  }, [state, resetOnSuccess, successToast, toast, router, onSuccess]);

  const handleSubmit = submitKeepingInput(formAction);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      className={cn("grid gap-3", className)}
    >
      {children}

      <FormAlert state={state} />

      {footer === undefined ? (
        <Button
          type="submit"
          variant={submitVariant}
          size={submitSize}
          loading={pending}
          fullWidth={fullWidth}
        >
          {submitLabel}
        </Button>
      ) : typeof footer === "function" ? (
        footer(pending)
      ) : (
        footer
      )}
    </form>
  );
}

/**
 * An `onSubmit` handler that runs a `useActionState` dispatch without React's
 * automatic form reset, so a refused submit keeps what was typed (see
 * `ActionForm`). The caller resets the form itself after a success. Keep
 * `action={formAction}` on the element too, so a submit before hydration still
 * reaches the Server Action.
 */
export function submitKeepingInput(
  formAction: (formData: FormData) => void,
): (event: React.FormEvent<HTMLFormElement>) => void {
  return (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    // `new FormData(form, submitter)` is not in every browser this site
    // supports; a named submit button's value is added by hand instead.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (
      (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
      submitter.name
    ) {
      formData.append(submitter.name, submitter.value);
    }
    React.startTransition(() => formAction(formData));
  };
}
