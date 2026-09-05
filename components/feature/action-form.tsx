"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
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
  /** Reset the form's fields after a successful submit (chat composers). */
  resetOnSuccess?: boolean;
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
 * rendered inline (and announced), and an optional success toast. Errors from
 * `lib/data/errors` already carry user-facing copy, so the message is shown
 * verbatim.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  submitVariant = "primary",
  submitSize = "md",
  fullWidth,
  successToast,
  resetOnSuccess,
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
  }, [state, resetOnSuccess, successToast, toast, router]);

  return (
    <form ref={formRef} action={formAction} className={cn("grid gap-3", className)}>
      {children}

      {state && !state.ok ? (
        <p
          role="alert"
          className="m-0 flex items-start gap-2 rounded-[13px] border border-[#8a3142] bg-[#2c1017] px-3 py-2 text-[12px] font-semibold text-[#ffb3bd]"
        >
          <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}

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
