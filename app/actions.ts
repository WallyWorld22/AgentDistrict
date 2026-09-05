"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import { AGENT_CATEGORIES, OUTPUT_FORMATS, PACKAGE_TIERS } from "@/lib/data/types";
import { routeOutcome } from "@/lib/world";

/**
 * Server Actions — every mutation the UI performs (BUILD_SPEC §1).
 *
 * Rules that hold for all of them:
 *
 * - they run as `requireProfile()`, which in demo mode is the demo human;
 * - they go through `getRepo()`, never an adapter;
 * - they are called from a `<form action=…>`, so the input is `FormData` and
 *   is validated with zod before it reaches the repository;
 * - a failure comes back as `{ ok: false, message }` for the caller to render
 *   rather than throwing into the error boundary. Domain errors already carry
 *   user-facing copy (`lib/data/errors`).
 *
 * A mutation the buyer performed through the UI passes `approved: true`: they
 * saw the price and clicked. Machine callers never do — that is what the
 * wallet's `approval_threshold_cents` is for.
 */

export type ActionState =
  | { ok: true; message?: string; href?: string }
  | { ok: false; message: string }
  | null;

function fail(error: unknown): ActionState {
  return { ok: false, message: toDistrictError(error).message };
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function cents(form: FormData, key: string): number {
  // Forms collect dollars; the domain is integer cents, always.
  const raw = text(form, key).replace(/[$,\s]/g, "");
  const dollars = Number.parseFloat(raw);
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : Number.NaN;
}

function list(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/* -------------------------------------------------------------------- gigs */

const OrderGigSchema = z.object({
  gigSlug: z.string().min(1),
  tier: z.enum(PACKAGE_TIERS),
  brief: z.string().min(4, "Tell the agent what you need — at least a sentence."),
});

export async function orderGigAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let href: string;
  try {
    const profile = await requireProfile();
    const input = OrderGigSchema.parse({
      gigSlug: text(form, "gigSlug"),
      tier: text(form, "tier"),
      brief: text(form, "brief"),
    });
    const order = await getRepo().orderGig({
      gigSlug: input.gigSlug,
      tier: input.tier,
      brief: input.brief,
      buyerId: profile.id,
      approved: true,
    });
    href = `/orders/${order.id}`;
  } catch (error) {
    return zodAware(error);
  }
  revalidatePath("/command");
  revalidatePath("/wallet");
  redirect(href);
}

const CreateGigSchema = z.object({
  agentHandle: z.string().min(1, "Pick one of your agents."),
  title: z.string().min(6, "Give the gig a real title."),
  description: z.string().min(20, "Describe what the buyer gets."),
  category: z.enum(AGENT_CATEGORIES),
  tags: z.array(z.string()).max(8),
  inputSummary: z.string().min(4),
  outputSummary: z.string().min(4),
  outputFormat: z.enum(OUTPUT_FORMATS),
  basicCents: z.number().int().min(0),
  standardCents: z.number().int().min(0),
  premiumCents: z.number().int().min(0),
  deliverySeconds: z.number().int().min(30),
});

export async function createGigAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let href: string;
  try {
    const profile = await requireProfile();
    const input = CreateGigSchema.parse({
      agentHandle: text(form, "agentHandle"),
      title: text(form, "title"),
      description: text(form, "description"),
      category: text(form, "category"),
      tags: list(text(form, "tags")),
      inputSummary: text(form, "inputSummary"),
      outputSummary: text(form, "outputSummary"),
      outputFormat: text(form, "outputFormat"),
      basicCents: cents(form, "basicPrice"),
      standardCents: cents(form, "standardPrice"),
      premiumCents: cents(form, "premiumPrice"),
      deliverySeconds: Number(text(form, "deliverySeconds")),
    });

    const gig = await getRepo().createGig(
      {
        agentHandle: input.agentHandle,
        title: input.title,
        description: input.description,
        category: input.category,
        tags: input.tags,
        input_contract: {
          summary: input.inputSummary,
          fields: [
            {
              name: "brief",
              type: "string",
              required: true,
              description: input.inputSummary,
            },
          ],
        },
        output_contract: {
          summary: input.outputSummary,
          format: input.outputFormat,
          fields: [
            { name: "result", type: "string", description: input.outputSummary },
          ],
        },
        packages: [
          {
            tier: "basic",
            name: "Basic",
            description: "The core run.",
            price_cents: input.basicCents,
            delivery_seconds: input.deliverySeconds,
            features: ["Machine-readable output", "Delivery SLA"],
          },
          {
            tier: "standard",
            name: "Standard",
            description: "More volume and a QA pass.",
            price_cents: input.standardCents,
            delivery_seconds: Math.round(input.deliverySeconds * 1.6),
            features: ["Everything in Basic", "QA pass", "Priority queue"],
          },
          {
            tier: "premium",
            name: "Premium",
            description: "Everything, with a human-readable summary.",
            price_cents: input.premiumCents,
            delivery_seconds: Math.round(input.deliverySeconds * 2.4),
            features: ["Everything in Standard", "Written summary", "Revision"],
          },
        ],
      },
      profile.id,
    );
    href = `/gigs/${gig.slug}`;
  } catch (error) {
    return zodAware(error);
  }
  revalidatePath("/gigs");
  redirect(href);
}

/* -------------------------------------------------------------------- jobs */

const CreateJobSchema = z.object({
  title: z.string().min(6, "Give the bounty a title agents can bid on."),
  description: z.string().min(20, "Describe the outcome you want."),
  category: z.enum(AGENT_CATEGORIES),
  budgetCents: z.number().int().min(100, "Budgets start at $1.00."),
  deadlineSeconds: z.number().int().min(60),
  outputFormat: z.enum(OUTPUT_FORMATS),
  columns: z.array(z.string()),
  pii: z.enum(["none", "redacted", "allowed"]),
  retentionDays: z.number().int().min(0).max(365),
  allowSubcontracting: z.boolean(),
});

export async function createJobAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let href: string;
  try {
    const profile = await requireProfile();
    const input = CreateJobSchema.parse({
      title: text(form, "title"),
      description: text(form, "description"),
      category: text(form, "category"),
      budgetCents: cents(form, "budget"),
      deadlineSeconds: Number(text(form, "deadlineSeconds")),
      outputFormat: text(form, "outputFormat"),
      columns: list(text(form, "columns")),
      pii: text(form, "pii") || "none",
      retentionDays: Number(text(form, "retentionDays") || "0"),
      allowSubcontracting: form.get("allowSubcontracting") === "on",
    });

    const job = await getRepo().createJob(
      {
        title: input.title,
        description: input.description,
        category: input.category,
        budget_cents: input.budgetCents,
        deadline_seconds: input.deadlineSeconds,
        required_output: {
          format: input.outputFormat,
          columns: input.columns.length > 0 ? input.columns : undefined,
        },
        data_policy: {
          pii: input.pii,
          retention_days: input.retentionDays,
          allow_subcontracting: input.allowSubcontracting,
        },
      },
      profile.id,
    );
    href = `/jobs/${job.id}`;
  } catch (error) {
    return zodAware(error);
  }
  revalidatePath("/jobs");
  redirect(href);
}

const PlaceBidSchema = z.object({
  jobId: z.string().min(1),
  agentHandle: z.string().min(1, "Pick one of your agents."),
  amountCents: z.number().int().min(1, "A bid needs a price."),
  etaSeconds: z.number().int().min(30),
  note: z.string().min(4, "Say how you would do it."),
});

export async function placeBidAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const input = PlaceBidSchema.parse({
      jobId: text(form, "jobId"),
      agentHandle: text(form, "agentHandle"),
      amountCents: cents(form, "amount"),
      etaSeconds: Number(text(form, "etaSeconds")),
      note: text(form, "note"),
    });
    await requireProfile();
    await getRepo().placeBid(input);
    revalidatePath(`/jobs/${input.jobId}`);
    return { ok: true, message: "Bid placed." };
  } catch (error) {
    return zodAware(error);
  }
}

export async function acceptBidAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let href: string;
  try {
    const profile = await requireProfile();
    const jobId = text(form, "jobId");
    const bidId = text(form, "bidId");
    if (!jobId || !bidId) throw new Error("Pick a bid to award.");
    const order = await getRepo().acceptBid({
      jobId,
      bidId,
      buyerId: profile.id,
      approved: true,
    });
    href = `/orders/${order.id}`;
  } catch (error) {
    return zodAware(error);
  }
  revalidatePath("/jobs");
  redirect(href);
}

/* ------------------------------------------------------------------ orders */

export async function approveOrderAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const id = text(form, "orderId");
    await getRepo().approveOrder(id, profile.id);
    revalidatePath(`/orders/${id}`);
    revalidatePath("/wallet");
    revalidatePath("/command");
    return { ok: true, message: "Released — 90% payout, 10% District fee." };
  } catch (error) {
    return fail(error);
  }
}

export async function disputeOrderAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const id = text(form, "orderId");
    const reason = text(form, "reason");
    if (reason.length < 4) throw new Error("Say what went wrong.");
    await getRepo().disputeOrder(id, profile.id, reason);
    revalidatePath(`/orders/${id}`);
    revalidatePath("/wallet");
    return { ok: true, message: "Disputed — the hold has been returned." };
  } catch (error) {
    return fail(error);
  }
}

export async function createReviewAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const orderId = text(form, "orderId");
    const rating = Number(text(form, "rating"));
    const body = text(form, "body");
    if (body.length < 4) throw new Error("A review needs a sentence.");
    await getRepo().createReview({ orderId, rating, body }, profile.id);
    revalidatePath(`/orders/${orderId}`);
    return { ok: true, message: "Review posted." };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ wallet */

export async function topUpAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const amount = cents(form, "amount");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount.");
    await getRepo().topUp(profile.id, amount);
    revalidatePath("/wallet");
    return { ok: true, message: "Credits added (demo — no real money moved)." };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------- lounge / tv / inbox */

export async function postLoungeMessageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const roomSlug = text(form, "roomSlug") || null;
    const body = text(form, "body");
    await getRepo().postLoungeMessage({
      roomSlug,
      authorType: "human",
      authorId: profile.id,
      body,
    });
    revalidatePath(roomSlug ? `/lounge/${roomSlug}` : "/lounge");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function postChannelChatAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const slug = text(form, "slug");
    await getRepo().postChannelChat(slug, profile.display_name, text(form, "body"));
    revalidatePath(`/tv/${slug}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function sendMessageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const threadId = text(form, "threadId");
    await getRepo().sendMessage({
      threadId,
      senderType: "human",
      senderId: profile.id,
      body: text(form, "body"),
    });
    revalidatePath(`/inbox/${threadId}`);
    revalidatePath("/inbox");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function startThreadAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let href: string;
  try {
    const profile = await requireProfile();
    const agentHandle = text(form, "agentHandle");
    const body = text(form, "body");
    if (body.length < 4) throw new Error("Write a first message.");
    const thread = await getRepo().createThread({
      profileId: profile.id,
      agentHandle,
      subject: text(form, "subject") || `Question for @${agentHandle}`,
      body,
    });
    href = `/inbox/${thread.id}`;
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/inbox");
  redirect(href);
}

/* ------------------------------------------------------------- onboarding */

const CreateAgentSchema = z.object({
  handle: z.string().min(2, "Pick a handle."),
  name: z.string().min(2, "Give your agent a name."),
  tagline: z.string().min(6, "One line on what it does."),
  description: z.string().optional(),
  category: z.enum(AGENT_CATEGORIES),
  skills: z.array(z.string()).min(1, "List at least one skill."),
  regions: z.array(z.string()),
  pricingModel: z.enum(["per_run", "per_job", "per_hour", "from"]),
  priceCents: z.number().int().min(0),
  avatarEmoji: z.string().optional(),
  endpoints: z.object({
    a2a: z.string().optional(),
    mcp: z.string().optional(),
    openapi: z.string().optional(),
    webhook: z.string().optional(),
  }),
});

export async function createAgentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let href: string;
  try {
    const profile = await requireProfile();
    const input = CreateAgentSchema.parse({
      handle: text(form, "handle"),
      name: text(form, "name"),
      tagline: text(form, "tagline"),
      description: text(form, "description") || undefined,
      category: text(form, "category"),
      skills: list(text(form, "skills")),
      regions: list(text(form, "regions")),
      pricingModel: text(form, "pricingModel"),
      priceCents: cents(form, "price"),
      avatarEmoji: text(form, "avatarEmoji") || undefined,
      endpoints: {
        a2a: text(form, "a2a") || undefined,
        mcp: text(form, "mcp") || undefined,
        openapi: text(form, "openapi") || undefined,
        webhook: text(form, "webhook") || undefined,
      },
    });

    const agent = await getRepo().createAgent(
      {
        handle: input.handle,
        name: input.name,
        tagline: input.tagline,
        description: input.description,
        avatar_emoji: input.avatarEmoji,
        category: input.category,
        skills: input.skills,
        regions: input.regions.length > 0 ? input.regions : ["US"],
        pricing_model: input.pricingModel,
        starting_price_cents: input.priceCents,
        endpoints: input.endpoints,
      },
      profile.id,
    );
    href = `/agents/${agent.handle}`;
  } catch (error) {
    return zodAware(error);
  }
  revalidatePath("/agents");
  redirect(href);
}

/* --------------------------------------------------------------- api keys */

export async function createApiKeyAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const label = text(form, "label") || "New key";
    const scopes = list(text(form, "scopes"));
    const created = await getRepo().createApiKey({
      profileId: profile.id,
      label,
      scopes: scopes.length > 0 ? scopes : ["agents:read", "gigs:read", "stats:read"],
    });
    revalidatePath("/profile");
    revalidatePath("/developers");
    // The raw key is returned exactly once — the caller shows it and it is gone.
    return { ok: true, message: created.key };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ @World */

export async function routeOutcomeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const outcome = text(form, "outcome");
  if (outcome.length < 4) return { ok: false, message: "Describe the outcome you want." };
  redirect(`/world?outcome=${encodeURIComponent(outcome)}`);
}

/** Assemble the proposed guild into real orders (one per pipeline step). */
export async function assembleGuildAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const outcome = text(form, "outcome");
    if (outcome.length < 4) throw new Error("Describe the outcome you want.");

    const repo = getRepo();
    const result = await routeOutcome({ outcome }, { repo });
    const steps = result.guild?.steps ?? result.ranked.slice(0, 1).map((entry) => ({
      role: "Run",
      verb: "runs",
      agent: entry.agent,
      estimateCents: entry.estimateCents,
      etaSeconds: entry.etaSeconds,
    }));
    if (steps.length === 0) throw new Error("No agent in the District fits that yet.");

    const created: string[] = [];
    for (const step of steps) {
      const gigs = await repo.listGigs({ agentHandle: step.agent.handle, limit: 1 });
      const gig = gigs[0];
      if (!gig) continue;
      const order = await repo.orderGig({
        gigSlug: gig.slug,
        tier: "basic",
        brief: `${step.role}: ${outcome}`,
        buyerId: profile.id,
        approved: true,
      });
      created.push(order.id);
    }
    if (created.length === 0) {
      throw new Error("Those agents have no published gigs to run yet.");
    }

    revalidatePath("/command");
    revalidatePath("/wallet");
    return {
      ok: true,
      message: `Assembled — ${created.length} ${created.length === 1 ? "run" : "runs"} started.`,
      href: "/command",
    };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ helper */

/** Surface the first zod issue as the message; anything else via `fail`. */
function zodAware(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return { ok: false, message: first?.message ?? "Check the form and try again." };
  }
  return fail(error);
}
