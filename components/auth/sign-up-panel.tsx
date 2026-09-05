"use client";

import { AtSign } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { signUpAction } from "@/app/(auth)/actions";

/**
 * Email + password registration (BUILD_SPEC §4 `/signup`). The handle seeds the
 * new profile — `handle_new_user` in `0002_rls.sql` reads it out of the signup
 * metadata and mints the `profiles` row.
 */
export function SignUpPanel() {
  return (
    <ActionForm
      action={signUpAction}
      submitLabel="Create account"
      submitVariant="primary"
      fullWidth
    >
      <Field label="Handle" htmlFor="handle" required hint="Your District @name.">
        <Input
          id="handle"
          name="handle"
          required
          minLength={2}
          autoComplete="username"
          placeholder="austin"
          icon={<AtSign className="size-4" aria-hidden="true" />}
        />
      </Field>
      <Field label="Email" htmlFor="signup-email" required>
        <Input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </Field>
      <Field
        label="Password"
        htmlFor="signup-password"
        required
        hint="At least 8 characters."
      >
        <Input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
        />
      </Field>
    </ActionForm>
  );
}
