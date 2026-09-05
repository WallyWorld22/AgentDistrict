"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import { AGENT_CATEGORIES, OUTPUT_FORMATS } from "@/lib/data/types";
import { inviteBidsFor } from "@/lib/data/ext/invite-bids";
import type { ActionState } from "@/app/actions";

/**
 * Server Actions for the reverse market (BUILD_SPEC §4 `/jobs`).
 *
 * They follow the house rules from `app/actions.ts`: run as `requireProfile()`,
 * go through `getRepo()`, validate `FormData` with zod, and return
 * `{ ok, message }` for `<ActionForm>` to render rather than throwing into the
 * error boundary. A human clicked, so every hire passes `approved: true`.
 */

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function cents(form: FormData, key: string): number {
  const raw = text(form, key).replace(/[$,\s]/g, "");
  const dollars = Number.parseFloat(raw);
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : Number.NaN;
}

function list(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ].slice(0, 12);
}

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "Check the form and try again." };
  }
  return { ok: false, message: toDistrictError(error).message };
}

/* ------------------------------------------------------------ post a job */

const PostJobSchema = z.object({
  title: z.string().min(6, "Give the bounty an outcome agents can bid on."),
  description: z.string().min(20, "Describe what done looks like — at least a sentence or two."),
  category: z.enum(AGENT_CATEGORIES),
  budgetCents: z.number().int().min(100, "Budgets start at $1.00."),
  deadlineSeconds: z.number().int().min(60),
  outputFormat: z.enum(OUTPUT_FORMATS),
  columns: z.array(z.string()).max(12),
  notes: z.string().max(280).optional(),
  pii: z.enum(["none", "redacted", "allowed"]),
  retentionDays: z.number().int().min(0).max(365),
  allowSubcontracting: z.boolean(),
  usOnly: z.boolean(),
});

/**
 * Publish a bounty, then wake the agents it matches.
 *
 * A board with no bids is not a market, and in demo mode there is no second
 * human to answer — so the best-matched agents that the poster does *not* own
 * bid within seconds, exactly like the legacy prototype's "6 compatible agents
 * were notified" promise. Their prices and ETAs are derived from their own
 * Passport (`planAutoBids`), never randomised, and the job page says plainly
 * that these are District agents responding to the notification.
 */
export async function postJobAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let href: string;
  try {
    const profile = await requireProfile();
    const input = PostJobSchema.parse({
      title: text(form, "title"),
      description: text(form, "description"),
      category: text(form, "category"),
      budgetCents: cents(form, "budget"),
      deadlineSeconds: Number(text(form, "deadlineSeconds")),
      outputFormat: text(form, "outputFormat"),
      columns: list(text(form, "columns")),
      notes: text(form, "notes") || undefined,
      pii: text(form, "pii") || "none",
      retentionDays: Number(text(form, "retentionDays") || "0"),
      allowSubcontracting: form.get("allowSubcontracting") === "on",
      usOnly: form.get("usOnly") === "on",
    });

    const repo = getRepo();
    const job = await repo.createJob(
      {
        title: input.title,
        description: input.description,
        category: input.category,
        budget_cents: input.budgetCents,
        deadline_seconds: input.deadlineSeconds,
        required_output: {
          format: input.outputFormat,
          columns: input.columns.length > 0 ? input.columns : undefined,
          notes: input.notes,
        },
        data_policy: {
          pii: input.pii,
          retention_days: input.retentionDays,
          allow_subcontracting: input.allowSubcontracting,
          regions: input.usOnly ? ["US"] : undefined,
        },
      },
      profile.id,
    );

    const notified = await inviteBidsFor(repo, job.id, profile.id);
    href = `/jobs/${job.id}?posted=${notified}`;
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/jobs");
  revalidatePath("/");
  redirect(href);
}

/* ------------------------------------------------------------ place a bid */

const PlaceBidSchema = z.object({
  jobId: z.string().min(1),
  agentHandle: z.string().min(1, "Pick one of your agents."),
  amountCents: z.number().int().min(1, "A bid needs a price."),
  etaSeconds: z.number().int().min(30),
  note: z.string().min(4, "Say how you would do it — buyers read this."),
});

export async function placeBidAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const profile = await requireProfile();
    const input = PlaceBidSchema.parse({
      jobId: text(form, "jobId"),
      agentHandle: text(form, "agentHandle"),
      amountCents: cents(form, "amount"),
      etaSeconds: Number(text(form, "etaSeconds")),
      note: text(form, "note"),
    });

    const repo = getRepo();
    const job = await repo.getJob(input.jobId);
    if (!job) return { ok: false, message: "That bounty no longer exists." };

    // You cannot bid on your own bounty — award one of the bids below instead.
    if (job.poster_id === profile.id) {
      return {
        ok: false,
        message:
          "This is your own bounty. You can award a bid, but you cannot bid on it.",
      };
    }
    if (job.status !== "open") {
      return { ok: false, message: "This bounty is closed — it has already been awarded." };
    }

    const mine = await repo.listAgentsByOwner(profile.id);
    const agent = mine.find((candidate) => candidate.handle === input.agentHandle);
    if (!agent) {
      return { ok: false, message: "You can only bid as an agent you own." };
    }
    if (job.bids.some((bid) => bid.agent_id === agent.id && bid.status === "pending")) {
      return { ok: false, message: `${agent.name} already has a live bid on this bounty.` };
    }

    await repo.placeBid({
      jobId: input.jobId,
      agentHandle: agent.handle,
      amountCents: input.amountCents,
      etaSeconds: input.etaSeconds,
      note: input.note,
    });

    revalidatePath(`/jobs/${input.jobId}`);
    revalidatePath("/jobs");
    return { ok: true, message: `Bid placed as ${agent.name}.` };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------- award a bid */

/**
 * Award a bid on a bounty you posted.
 *
 * `acceptBid` holds the funds, rejects the other bids and starts the run — and
 * it passes `approved: true` because a human saw the price and clicked, which
 * is exactly what the wallet's approval threshold is there to require. Only the
 * poster can award; the button is a link to the agent's Passport for everyone
 * else, so nobody is ever charged someone else's bid price.
 */
export async function awardBidAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let href: string;
  try {
    const profile = await requireProfile();
    const jobId = text(form, "jobId");
    const bidId = text(form, "bidId");
    if (!jobId || !bidId) throw new Error("Pick a bid to award.");

    const repo = getRepo();
    const job = await repo.getJob(jobId);
    if (!job) throw new Error("That bounty no longer exists.");
    if (job.poster_id !== profile.id) {
      throw new Error("Only the buyer who posted this bounty can award it.");
    }
    if (!job.bids.some((row) => row.id === bidId)) {
      throw new Error("That bid is no longer on the board.");
    }

    const order = await repo.acceptBid({
      jobId,
      bidId,
      buyerId: profile.id,
      approved: true,
    });
    href = `/orders/${order.id}`;
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/jobs");
  revalidatePath("/command");
  revalidatePath("/wallet");
  redirect(href);
}
