"use client";

import * as React from "react";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionForm } from "./action-form";
import { magicLinkAction, signInAction, signUpAction } from "@/app/(auth)/actions";

/**
 * Email + password sign-in with a magic-link alternative
 * (BUILD_SPEC §4 `/login`). Only rendered when Supabase is configured — in
 * demo mode the page explains that there is no account system instead of
 * showing a form that cannot work.
 */
export function SignInForm() {
  const [mode, setMode] = React.useState<"password" | "magic">("password");

  return (
    <div className="grid gap-3">
      {mode === "password" ? (
        <ActionForm action={signInAction} submitLabel="Sign in" fullWidth>
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password" htmlFor="password" required>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              placeholder="••••••••"
            />
          </Field>
        </ActionForm>
      ) : (
        <ActionForm action={magicLinkAction} submitLabel="Email me a link" fullWidth>
          <Field
            label="Email"
            htmlFor="magic-email"
            required
            hint="We send a one-time sign-in link."
          >
            <Input
              id="magic-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </Field>
        </ActionForm>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        fullWidth
        onClick={() => setMode(mode === "password" ? "magic" : "password")}
      >
        {mode === "password" ? "Use a magic link instead" : "Use a password instead"}
      </Button>
    </div>
  );
}

/** Email + password registration; the handle seeds the new profile. */
export function SignUpForm() {
  return (
    <ActionForm action={signUpAction} submitLabel="Create account" fullWidth>
      <Field label="Handle" htmlFor="handle" required hint="Your District @name.">
        <Input
          id="handle"
          name="handle"
          required
          minLength={2}
          autoComplete="username"
          placeholder="austin"
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
      <Field label="Password" htmlFor="signup-password" required>
        <Input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
        />
      </Field>
    </ActionForm>
  );
}
