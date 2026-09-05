"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import { AGENT_CATEGORIES, PRICING_MODELS } from "@/lib/data/types";
import { HANDLE_PATTERN, isPublicHttpsUrl } from "@/lib/data/ext/agents";
import { slugify } from "@/lib/utils";
import type { ActionState } from "@/app/actions";

/**
 * Creator onboarding (BUILD_SPEC §4 `/onboarding/agent`).
 *
 * The wizard is a client component that keeps its draft in React state and
 * posts the whole thing as JSON on the last step, so the schema below — not the
 * markup — is what actually decides whether a Passport is valid. Endpoints are
 * re-checked here even though the wizard checks them inline: the client rule is
 * a convenience, this one is the gate.
 */

const EndpointSchema = z
  .string()
  .trim()
  .max(400)
  .refine((value) => value === "" || isPublicHttpsUrl(value), {
    message: "Endpoints must be https:// URLs on a public host.",
  })
  .transform((value) => (value === "" ? undefined : value));

const DraftSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HANDLE_PATTERN, "Handles are lowercase letters, digits and hyphens (2–32)."),
  name: z.string().trim().min(2, "Give your agent a display name."),
  tagline: z.string().trim().min(6, "Write one line on what it does."),
  description: z.string().trim().max(2000).optional().default(""),
  avatarEmoji: z.string().trim().min(1).max(8).default("🤖"),
  avatarGradient: z
    .string()
    .trim()
    .regex(/^linear-gradient\([^;{}]*\)$/, "Pick one of the offered gradients.")
    .optional(),
  category: z.enum(AGENT_CATEGORIES),
  skills: z.array(z.string().trim().min(1).max(48)).min(1, "List at least one skill.").max(12),
  regions: z.array(z.string().trim().min(1).max(48)).min(1, "Pick at least one region.").max(12),
  pricingModel: z.enum(PRICING_MODELS),
  priceCents: z
    .number()
    .int("Enter a price like 0.25.")
    .min(0, "A price cannot be negative.")
    .max(100_000_00),
  endpoints: z
    .object({
      a2a: EndpointSchema.optional(),
      mcp: EndpointSchema.optional(),
      openapi: EndpointSchema.optional(),
      webhook: EndpointSchema.optional(),
    })
    .default({}),
  mcpTools: z.array(z.string().trim().min(1).max(64)).max(16).default([]),
  bringOnline: z.boolean().default(true),
});

export type HandleCheck = {
  handle: string;
  available: boolean;
  message: string;
};

/**
 * Live handle availability for step 1. A plain Server Action called straight
 * from the wizard — it answers a question rather than performing a mutation, so
 * it does not go through `<ActionForm>`.
 */
export async function checkHandleAvailability(raw: string): Promise<HandleCheck> {
  const handle = slugify(String(raw ?? ""));
  if (!handle || !HANDLE_PATTERN.test(handle)) {
    return {
      handle,
      available: false,
      message: "Lowercase letters, digits and hyphens only (2–32 characters).",
    };
  }

  const existing = await getRepo().getAgentByHandle(handle);
  return existing
    ? { handle, available: false, message: `@${handle} is already registered in the District.` }
    : { handle, available: true, message: `@${handle} is available.` };
}

export async function registerAgentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();

    const raw = form.get("draft");
    if (typeof raw !== "string" || raw.length === 0) {
      return { ok: false, message: "Nothing to publish — start at step one." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, message: "That draft could not be read. Reload and try again." };
    }

    const draft = DraftSchema.parse(parsed);
    const repo = getRepo();

    const agent = await repo.createAgent(
      {
        handle: draft.handle,
        name: draft.name,
        tagline: draft.tagline,
        description: draft.description || draft.tagline,
        avatar_emoji: draft.avatarEmoji,
        avatar_gradient: draft.avatarGradient,
        category: draft.category,
        skills: draft.skills,
        regions: draft.regions,
        pricing_model: draft.pricingModel,
        starting_price_cents: draft.priceCents,
        endpoints: draft.endpoints,
        mcp_tools: draft.mcpTools,
      },
      profile.id,
    );

    // `createAgent` always seats a new Passport as `available`. A creator who
    // is not ready to take work can publish it dark and flip it on from the
    // Passport itself; presence and `agents.status` move together.
    if (!draft.bringOnline) {
      await repo.updatePresence(agent.handle, { status: "offline" });
    }

    revalidatePath("/agents");
    revalidatePath("/profile");
    revalidatePath("/lounge");
    revalidatePath("/");

    return {
      ok: true,
      message: `@${agent.handle} is registered — Passport live.`,
      href: `/agents/${agent.handle}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        message: error.issues[0]?.message ?? "Check the form and try again.",
      };
    }
    return { ok: false, message: toDistrictError(error).message };
  }
}
