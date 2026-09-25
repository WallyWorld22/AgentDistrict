"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import { AVATAR_EMOJI } from "@/lib/data/ext/agents";
import { encodeProfileAvatar } from "@/lib/data/ext/profiles";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ActionState } from "@/app/actions";

/**
 * `/settings` — the two mutations a person performs on their own account.
 *
 * `updateProfileAction` goes through `Repository.updateProfile`, so it works in
 * both data modes. `changePasswordAction` deliberately does **not**: a password
 * is an auth credential, not a District row, and it only exists where Supabase
 * does. In demo mode it answers with the reason rather than pretending.
 */

const AVATAR_EMOJI_SET = new Set<string>(AVATAR_EMOJI);

const ProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Your display name needs at least two characters.")
    .max(60, "Display names are 60 characters or fewer."),
  bio: z.string().trim().max(400, "Bios are 400 characters or fewer."),
  // Both halves of the avatar are checked against the offered lists rather than
  // trusted: the value ends up in `profiles.avatar_url`, and the gradient id is
  // resolved to inline CSS when the chip renders.
  avatarEmoji: z
    .string()
    .trim()
    .refine((value) => AVATAR_EMOJI_SET.has(value), "Pick one of the offered emoji."),
  avatarGradient: z.string().trim().min(1, "Pick one of the offered gradients."),
});

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export async function updateProfileAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const input = ProfileSchema.parse({
      displayName: field(form, "displayName"),
      bio: field(form, "bio"),
      avatarEmoji: field(form, "avatarEmoji"),
      avatarGradient: field(form, "avatarGradient"),
    });

    await getRepo().updateProfile(profile.id, {
      display_name: input.displayName,
      bio: input.bio.length > 0 ? input.bio : null,
      // `encodeProfileAvatar` throws on an unknown gradient id, which the zod
      // schema above cannot check without duplicating the list.
      avatar_url: encodeProfileAvatar(input.avatarEmoji, input.avatarGradient),
    });

    // The shell renders the name and the avatar on every page.
    revalidatePath("/", "layout");
    return { ok: true, message: "Profile saved." };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Check the form and try again." };
    }
    return { ok: false, message: toDistrictError(error).message };
  }
}

const PasswordSchema = z
  .object({
    password: z.string().min(8, "Passwords are at least 8 characters.").max(200),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "The two passwords do not match.",
  });

/**
 * Change the Supabase account password.
 *
 * `auth.updateUser` acts on the session cookie, so it can only ever change the
 * caller's own password. The page hides this section entirely in demo mode; the
 * guard here is the one that matters, because a Server Action is reachable
 * without the page that renders it.
 */
export async function changePasswordAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message:
        "Demo mode has no passwords — every visitor is signed in as @austin. Configure Supabase to turn on real accounts.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, message: "This deployment has no account system to change." };
  }

  try {
    const input = PasswordSchema.parse({
      password: field(form, "password"),
      confirm: field(form, "confirm"),
    });
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) return { ok: false, message: error.message };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Check the form and try again." };
    }
    return { ok: false, message: toDistrictError(error).message };
  }

  return { ok: true, message: "Password updated." };
}
