"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { districtNow, getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import {
  ALL_KEY_SCOPES,
  revokeApiKey,
  toApiKeyView,
  type ApiKeyView,
} from "@/lib/data/ext/agents";
import { timeAgo } from "@/lib/utils";

/**
 * API key management for `/profile#api-keys`.
 *
 * These are called directly from the client panel rather than through
 * `<ActionForm>`: the raw key comes back exactly once and has to land in a
 * modal the user can copy from, not in a toast that disappears.
 */

const CreateKeySchema = z.object({
  label: z.string().trim().min(1, "Give the key a label.").max(64),
  scopes: z
    .array(z.enum(ALL_KEY_SCOPES as [string, ...string[]]))
    .min(1, "Pick at least one scope."),
});

export type CreateKeyResult =
  | { ok: true; key: string; record: ApiKeyView }
  | { ok: false; message: string };

export async function createProfileApiKey(input: {
  label: string;
  scopes: string[];
}): Promise<CreateKeyResult> {
  try {
    const profile = await requireProfile();
    const parsed = CreateKeySchema.parse(input);

    const created = await getRepo().createApiKey({
      profileId: profile.id,
      label: parsed.label,
      // De-duplicate: `<resource>:write` already implies `<resource>:read`.
      scopes: Array.from(new Set(parsed.scopes)),
    });

    revalidatePath("/profile");
    revalidatePath("/developers");

    const now = districtNow();
    return {
      ok: true,
      key: created.key,
      record: toApiKeyView(created.record, (iso) => timeAgo(iso, now)),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Check the form." };
    }
    return { ok: false, message: toDistrictError(error).message };
  }
}

export type RevokeKeyResult = { ok: boolean; message: string };

/**
 * Revoke a key. `Repository` does not declare `revokeApiKey` yet, so this goes
 * through the optional-capability helper: the panel only renders the control
 * when the live adapter can actually do it.
 */
export async function revokeProfileApiKey(id: string): Promise<RevokeKeyResult> {
  try {
    const profile = await requireProfile();
    const repo = getRepo();

    const owned = await repo.listApiKeys(profile.id);
    if (!owned.some((key) => key.id === id)) {
      return { ok: false, message: "That key is not on your account." };
    }

    const done = await revokeApiKey(repo, id, profile.id);
    if (!done) {
      return {
        ok: false,
        message: "This deployment cannot revoke keys yet.",
      };
    }

    revalidatePath("/profile");
    revalidatePath("/developers");
    return { ok: true, message: "Key revoked." };
  } catch (error) {
    return { ok: false, message: toDistrictError(error).message };
  }
}
