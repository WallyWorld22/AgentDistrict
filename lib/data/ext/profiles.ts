import { AVATAR_EMOJI, AVATAR_GRADIENTS } from "./agents";
import type { Profile } from "@/lib/data/types";

/**
 * How a human's avatar is stored in `profiles.avatar_url`.
 *
 * The column is a nullable `text` and has always been one — the seed writes
 * `null` for every profile and nothing rendered it. Rather than add a column
 * (0010 is already adding one, and a migration per UI field is how a schema
 * rots) `/settings` stores the chosen emoji and gradient as a token:
 *
 *     district:🛰️:violet
 *
 * Three rules make that safe to render:
 *
 *  - the **gradient is stored by id**, never as CSS. The value reaches the DOM
 *    as an inline `background-image`, so a column a user can write must not be
 *    able to author it; an unknown id falls back to the deterministic
 *    per-handle gradient;
 *  - the **emoji is validated against `AVATAR_EMOJI`**, the same list the
 *    onboarding picker offers, so the column cannot hold arbitrary markup;
 *  - anything that is *not* a District token — an `https://…` URL written by a
 *    future upload flow, or a value from `handle_new_user`'s OAuth metadata —
 *    parses as `null` and the UI falls back to initials. Nothing is lost and
 *    nothing is executed.
 *
 * Pure and dependency-free, so both Server Components and client islands can
 * import it.
 */

const PREFIX = "district:";

export type ProfileAvatar = {
  emoji: string;
  /** An id from `AVATAR_GRADIENTS`. */
  gradientId: string;
  /** The CSS gradient that id resolves to. */
  gradient: string;
};

export const DEFAULT_PROFILE_EMOJI = "🧠";
export const DEFAULT_PROFILE_GRADIENT_ID = AVATAR_GRADIENTS[0].id;

function gradientById(id: string): string | null {
  return AVATAR_GRADIENTS.find((choice) => choice.id === id)?.value ?? null;
}

/** `("🛰️", "violet")` → `"district:🛰️:violet"`. Throws on an unknown pick. */
export function encodeProfileAvatar(emoji: string, gradientId: string): string {
  if (!(AVATAR_EMOJI as readonly string[]).includes(emoji)) {
    throw new Error(`profile avatar: unknown emoji ${emoji}`);
  }
  if (!gradientById(gradientId)) {
    throw new Error(`profile avatar: unknown gradient ${gradientId}`);
  }
  return `${PREFIX}${emoji}:${gradientId}`;
}

/** The stored token, or `null` for "no District avatar" (URL, empty, garbage). */
export function parseProfileAvatar(value: string | null | undefined): ProfileAvatar | null {
  if (!value || !value.startsWith(PREFIX)) return null;
  const rest = value.slice(PREFIX.length);
  const split = rest.lastIndexOf(":");
  if (split <= 0) return null;

  const emoji = rest.slice(0, split);
  const gradientId = rest.slice(split + 1);
  if (!(AVATAR_EMOJI as readonly string[]).includes(emoji)) return null;
  const gradient = gradientById(gradientId);
  if (!gradient) return null;

  return { emoji, gradientId, gradient };
}

/** What the picker should start on for a profile that has never set one. */
export function profileAvatarOrDefault(profile: Pick<Profile, "avatar_url">): ProfileAvatar {
  return (
    parseProfileAvatar(profile.avatar_url) ?? {
      emoji: DEFAULT_PROFILE_EMOJI,
      gradientId: DEFAULT_PROFILE_GRADIENT_ID,
      gradient: gradientById(DEFAULT_PROFILE_GRADIENT_ID) ?? AVATAR_GRADIENTS[0].value,
    }
  );
}

/** `AVATAR_GRADIENTS` id for a CSS value — the picker speaks values. */
export function gradientIdFor(value: string): string | null {
  return AVATAR_GRADIENTS.find((choice) => choice.value === value)?.id ?? null;
}
