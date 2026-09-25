"use client";

import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { changePasswordAction } from "@/app/(app)/settings/actions";

/**
 * `/settings` → Security. Rendered only where Supabase is configured; demo mode
 * gets an honest note instead of a form that could never work.
 */
export function PasswordForm() {
  return (
    <ActionForm
      action={changePasswordAction}
      successToast="Password updated."
      resetOnSuccess
      footer={(pending) => (
        <Button type="submit" variant="primary" size="sm" loading={pending} fullWidth>
          <KeyRound className="size-3.5" aria-hidden="true" />
          Change password
        </Button>
      )}
    >
      <Field
        label="New password"
        htmlFor="settings-password"
        required
        hint="At least 8 characters. You stay signed in on this device."
      >
        <Input
          id="settings-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirm new password" htmlFor="settings-password-confirm" required>
        <Input
          id="settings-password-confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>
    </ActionForm>
  );
}
