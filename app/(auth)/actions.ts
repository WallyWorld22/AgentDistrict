"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import type { ActionState } from "@/app/actions";

/**
 * Supabase auth actions (BUILD_SPEC §4 `/login`, `/signup`).
 *
 * All three degrade honestly: with no Supabase credentials there is no account
 * system at all, so rather than failing in a confusing way they say so. The
 * auth pages hide the forms entirely in that case — a disabled form that looks
 * enabled is worse than no form.
 */

const CredentialsSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Passwords are at least 8 characters."),
});

const EmailSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

const NOT_CONFIGURED =
  "This deployment runs in demo mode — there is no account system to sign in to.";

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function firstIssue(error: unknown): string | null {
  return error instanceof z.ZodError ? (error.issues[0]?.message ?? null) : null;
}

export async function signInAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };

  try {
    const { email, password } = CredentialsSchema.parse({
      email: field(form, "email"),
      password: field(form, "password"),
    });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: error.message };
  } catch (error) {
    return { ok: false, message: firstIssue(error) ?? "Check the form and try again." };
  }
  redirect("/");
}

export async function signUpAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };

  const handle = field(form, "handle");
  try {
    const { email, password } = CredentialsSchema.parse({
      email: field(form, "email"),
      password: field(form, "password"),
    });
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // `handle_new_user` in 0002_rls.sql reads this to mint the profile.
        data: handle ? { handle } : undefined,
        emailRedirectTo: `${siteUrl()}/auth/callback`,
      },
    });
    if (error) return { ok: false, message: error.message };
  } catch (error) {
    return { ok: false, message: firstIssue(error) ?? "Check the form and try again." };
  }
  return {
    ok: true,
    message: "Check your inbox — we sent you a link to finish signing up.",
  };
}

export async function magicLinkAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };

  try {
    const { email } = EmailSchema.parse({ email: field(form, "email") });
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
    });
    if (error) return { ok: false, message: error.message };
  } catch (error) {
    return { ok: false, message: firstIssue(error) ?? "Enter a valid email address." };
  }
  return { ok: true, message: "Magic link sent — check your inbox." };
}
