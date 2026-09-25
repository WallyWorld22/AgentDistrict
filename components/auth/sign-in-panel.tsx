"use client";

import * as React from "react";
import { KeyRound, Mail } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { ActionForm } from "@/components/feature/action-form";
import { magicLinkAction, signInAction } from "@/app/(auth)/actions";

type Mode = "password" | "magic";

/**
 * Sign-in with two real tabs (BUILD_SPEC §4 `/login`): email + password, or a
 * one-time magic link. Only rendered when Supabase is configured — in demo mode
 * the page says there is no account system instead of showing a form that
 * cannot work.
 */
export function SignInPanel({ next }: { next?: string | null }) {
  const [mode, setMode] = React.useState<Mode>("password");

  return (
    <div className="grid gap-3">
      <Tabs
        label="Sign-in method"
        value={mode}
        onValueChange={(value) => setMode(value as Mode)}
        items={[
          {
            value: "password",
            label: "Password",
            icon: <KeyRound className="size-3.5" aria-hidden="true" />,
          },
          {
            value: "magic",
            label: "Magic link",
            icon: <Mail className="size-3.5" aria-hidden="true" />,
          },
        ]}
      />

      {mode === "password" ? (
        <ActionForm
          action={signInAction}
          submitLabel="Sign in"
          submitVariant="primary"
          fullWidth
        >
          {next ? <input type="hidden" name="next" value={next} /> : null}
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
        <ActionForm
          action={magicLinkAction}
          submitLabel="Email me a link"
          submitVariant="primary"
          fullWidth
        >
          <Field
            label="Email"
            htmlFor="magic-email"
            required
            hint="We send a one-time sign-in link — no password to remember."
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
    </div>
  );
}
