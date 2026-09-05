"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import {
  AGENT_CATEGORIES,
  OUTPUT_FORMATS,
  PACKAGE_TIERS,
  type GigPackage,
} from "@/lib/data/types";
import { CONTRACT_FIELD_TYPES } from "@/lib/data/ext/gigs";
import type { ActionState } from "@/app/actions";

/**
 * The `/gigs/new` publish flow.
 *
 * `app/actions.ts` already has a `createGigAction`, but it writes a single
 * synthetic contract field per side. The creator form on this route builds real
 * contracts and real package feature lists, so it needs its own zod schema —
 * same `{ ok, message }` shape, same `<ActionForm>` contract.
 *
 * On success it returns `href` rather than calling `redirect()`, so the caller
 * gets the success toast *and* the navigation.
 */

const ContractFieldSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Every contract field needs a name.")
    .max(48)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Field names are machine keys: letters, numbers, _ . - only."),
  type: z.enum(CONTRACT_FIELD_TYPES),
  required: z.boolean(),
  description: z.string().trim().min(3, "Describe what each contract field means."),
});

const PackageSchema = z.object({
  tier: z.enum(PACKAGE_TIERS),
  name: z.string().trim().min(2, "Give each package a name."),
  description: z.string().trim().min(4, "Say what each package includes."),
  price_cents: z.number().int().min(0, "A package price cannot be negative."),
  delivery_seconds: z
    .number()
    .int()
    .min(10, "Delivery times start at 10 seconds.")
    .max(60 * 60 * 24 * 30),
  features: z.array(z.string().trim().min(1)).min(1, "List at least one feature per package."),
});

const PublishGigSchema = z.object({
  agentHandle: z.string().trim().min(1, "Pick one of your agents."),
  title: z.string().trim().min(6, "Give the gig a real title — start with “I will …”."),
  description: z.string().trim().min(20, "Describe what the buyer gets in a sentence or two."),
  category: z.enum(AGENT_CATEGORIES),
  tags: z.array(z.string().trim().min(1)).max(8, "Eight tags is plenty."),
  inputSummary: z.string().trim().min(4, "Summarise what the buyer must send."),
  inputFields: z.array(ContractFieldSchema).min(1, "Declare at least one input field."),
  outputSummary: z.string().trim().min(4, "Summarise what you return."),
  outputFormat: z.enum(OUTPUT_FORMATS),
  outputVolume: z.string().trim().max(60).optional(),
  outputFields: z.array(ContractFieldSchema).min(1, "Declare at least one output field."),
  packages: z.array(PackageSchema).length(3),
});

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function cents(form: FormData, key: string): number {
  const raw = text(form, key).replace(/[$,\s]/g, "");
  const dollars = Number.parseFloat(raw);
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : Number.NaN;
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function commas(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** The contract builder posts its rows as one JSON blob per side. */
function parseFields(form: FormData, key: string): unknown {
  const raw = text(form, key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function readPackage(form: FormData, tier: (typeof PACKAGE_TIERS)[number]) {
  return {
    tier,
    name: text(form, `${tier}Name`),
    description: text(form, `${tier}Description`),
    price_cents: cents(form, `${tier}Price`),
    delivery_seconds: Number(text(form, `${tier}Delivery`)),
    features: lines(text(form, `${tier}Features`)),
  };
}

export async function publishGigAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const input = PublishGigSchema.parse({
      agentHandle: text(form, "agentHandle"),
      title: text(form, "title"),
      description: text(form, "description"),
      category: text(form, "category"),
      tags: commas(text(form, "tags")),
      inputSummary: text(form, "inputSummary"),
      inputFields: parseFields(form, "inputFields"),
      outputSummary: text(form, "outputSummary"),
      outputFormat: text(form, "outputFormat"),
      outputVolume: text(form, "outputVolume") || undefined,
      outputFields: parseFields(form, "outputFields"),
      packages: PACKAGE_TIERS.map((tier) => readPackage(form, tier)),
    });

    const packages: GigPackage[] = input.packages.map((pkg) => ({
      tier: pkg.tier,
      name: pkg.name,
      description: pkg.description,
      price_cents: pkg.price_cents,
      delivery_seconds: pkg.delivery_seconds,
      features: pkg.features,
    }));

    const gig = await getRepo().createGig(
      {
        agentHandle: input.agentHandle,
        title: input.title,
        description: input.description,
        category: input.category,
        tags: input.tags,
        input_contract: {
          summary: input.inputSummary,
          fields: input.inputFields.map((field) => ({
            name: field.name,
            type: field.type,
            required: field.required,
            description: field.description,
          })),
        },
        output_contract: {
          summary: input.outputSummary,
          format: input.outputFormat,
          volume: input.outputVolume,
          fields: input.outputFields.map((field) => ({
            name: field.name,
            type: field.type,
            description: field.description,
          })),
        },
        packages,
      },
      profile.id,
    );

    revalidatePath("/gigs");
    revalidatePath(`/agents/${input.agentHandle}`);
    return {
      ok: true,
      message: "Gig published — it is now machine-discoverable.",
      href: `/gigs/${gig.slug}`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      return { ok: false, message: first?.message ?? "Check the form and try again." };
    }
    return { ok: false, message: toDistrictError(error).message };
  }
}
