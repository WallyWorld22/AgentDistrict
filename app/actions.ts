"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import { PACKAGE_TIERS } from "@/lib/data/types";

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
 *
 * These are the *shared* actions, used from more than one surface. A mutation
 * that belongs to one surface lives beside it in
 * `app/(app)/<surface>/actions.ts` — `publishGigAction`, `postJobAction`,
 * `placeBidAction`, `assembleGuildAction`, `setSpendPauseAction`,
 * `updateSpendPolicyAction`, `registerAgentAction`, `hireGuildAction`,
 * `setChannelFollowAction`, `markThreadReadAction`, `joinRoomAction`,
 * `runShowroomAction`, and the API-key actions on `/profile`.
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

/* ------------------------------------------------------------------ orders */

/** Ids are opaque strings; parse them so a malformed one is a clean message. */
const OrderIdSchema = z.string().trim().min(1, "Missing run id.").max(64);

export async function approveOrderAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const id = OrderIdSchema.parse(text(form, "orderId"));
    await getRepo().approveOrder(id, profile.id);
    revalidatePath(`/orders/${id}`);
    revalidatePath("/wallet");
    revalidatePath("/command");
    return { ok: true, message: "Released — 90% payout, 10% District fee." };
  } catch (error) {
    return zodAware(error);
  }
}

export async function disputeOrderAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const id = OrderIdSchema.parse(text(form, "orderId"));
    const reason = text(form, "reason");
    if (reason.length < 4) throw new Error("Say what went wrong.");
    await getRepo().disputeOrder(id, profile.id, reason);
    revalidatePath(`/orders/${id}`);
    revalidatePath("/wallet");
    return { ok: true, message: "Disputed — the hold has been returned." };
  } catch (error) {
    return zodAware(error);
  }
}

/**
 * A star rating is a 1–5 integer, parsed as one.
 *
 * `Number("abc")` is `NaN`, and `NaN < 1` / `NaN > 5` are *both* false — so an
 * un-parsed rating slipped past the repository's range guard and folded a `NaN`
 * into the agent's and the gig's lifetime `rating_avg`, permanently. Zod is
 * what every sibling action already does; this one had been missed.
 */
const CreateReviewSchema = z.object({
  orderId: OrderIdSchema,
  rating: z.coerce
    .number({ error: "Pick a star rating." })
    .int("Pick a star rating.")
    .min(1, "Pick a star rating.")
    .max(5, "Pick a star rating."),
  body: z.string().trim().min(4, "A review needs a sentence.").max(2000),
});

export async function createReviewAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const input = CreateReviewSchema.parse({
      orderId: text(form, "orderId"),
      rating: text(form, "rating"),
      body: text(form, "body"),
    });
    await getRepo().createReview(input, profile.id);
    revalidatePath(`/orders/${input.orderId}`);
    return { ok: true, message: "Review posted." };
  } catch (error) {
    return zodAware(error);
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

/**
 * A slug reaches `revalidatePath()` and the repository, so it is parsed the way
 * the surface-local actions in `app/(app)/lounge/actions.ts` and
 * `app/(app)/tv/actions.ts` already parse theirs, rather than trusted.
 */
const SlugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/, "Unknown room or channel.");
const ChatBodySchema = z.string().trim().min(1, "Say something first.").max(500);

const LoungeMessageSchema = z.object({
  roomSlug: SlugSchema.nullable(),
  body: ChatBodySchema,
});

export async function postLoungeMessageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const input = LoungeMessageSchema.parse({
      roomSlug: text(form, "roomSlug") || null,
      body: text(form, "body"),
    });
    await getRepo().postLoungeMessage({
      roomSlug: input.roomSlug,
      authorType: "human",
      authorId: profile.id,
      body: input.body,
    });
    revalidatePath(input.roomSlug ? `/lounge/${input.roomSlug}` : "/lounge");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return zodAware(error);
  }
}

const ChannelChatSchema = z.object({ slug: SlugSchema, body: ChatBodySchema });

export async function postChannelChatAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const input = ChannelChatSchema.parse({
      slug: text(form, "slug"),
      body: text(form, "body"),
    });
    await getRepo().postChannelChat(input.slug, profile.display_name, input.body);
    revalidatePath(`/tv/${input.slug}`);
    return { ok: true };
  } catch (error) {
    return zodAware(error);
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

/* ------------------------------------------------------------------ @World */

export async function routeOutcomeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const outcome = text(form, "outcome");
  if (outcome.length < 4) return { ok: false, message: "Describe the outcome you want." };
  redirect(`/world?outcome=${encodeURIComponent(outcome)}`);
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
