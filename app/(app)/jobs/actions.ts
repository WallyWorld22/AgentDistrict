"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { ValidationError } from "@/lib/data/errors";
import { actionError } from "@/lib/action-state";
import { AGENT_CATEGORIES, OUTPUT_FORMATS } from "@/lib/data/types";
import { inviteBidsFor } from "@/lib/data/ext/invite-bids";
import { isLeagueFighter, leagueFighterRefusal } from "@/lib/data/league";
import { MAX_JOB_BUDGET_CENTS, liveBidRefusal } from "@/lib/data/limits";
import { formatCents, parseDollarsToCents } from "@/lib/utils";
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

/** Strict dollars → cents; `NaN` (which the schema words for the visitor) when it is not one. */
function cents(form: FormData, key: string): number {
  return parseDollarsToCents(text(form, key)) ?? Number.NaN;
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
  return actionError(error);
}

/* ------------------------------------------------------------ post a job */

const PostJobSchema = z.object({
  title: z.string().min(6, "Give the bounty an outcome agents can bid on."),
  description: z.string().min(20, "Describe what done looks like — at least a sentence or two."),
  category: z.enum(AGENT_CATEGORIES, { error: "Pick a category." }),
  budgetCents: z
    .number({ error: "Enter the budget in dollars, like 25.00." })
    .int()
    .min(100, "Budgets start at $1.00.")
    .max(MAX_JOB_BUDGET_CENTS, `Budgets top out at ${formatCents(MAX_JOB_BUDGET_CENTS)}.`),
  deadlineSeconds: z
    .number({ error: "Pick a deadline." })
    .int()
    .min(60, "Deadlines start at one minute."),
  outputFormat: z.enum(OUTPUT_FORMATS, { error: "Pick an output format." }),
  columns: z.array(z.string()).max(12, "Twelve columns is the limit."),
  notes: z.string().max(280, "Keep the notes to 280 characters.").optional(),
  pii: z.enum(["none", "redacted", "allowed"], { error: "Pick a personal-data rule." }),
  retentionDays: z
    .number({ error: "Enter retention as a whole number of days, from 0 to 365." })
    .int()
    .min(0, "Retention cannot be negative — 0 deletes the source material on delivery.")
    .max(365, "Retention tops out at 365 days."),
  allowSubcontracting: z.boolean(),
  usOnly: z.boolean(),
});

/**
 * Publish a bounty, then match it and place the District's auto-bids.
 *
 * A board with no bids is not a market, and in demo mode there is no second
 * human to answer — so up to three best-matched founding-cast agents that the
 * poster does *not* own get an auto-bid within seconds (`inviteBidsFor`).
 * Their prices and ETAs are derived from their own Passport (`planAutoBids`),
 * never randomised, and the job page marks every one as an auto-bid.
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
  amountCents: z
    .number({ error: "Enter your price in dollars, like 4.50." })
    .int()
    .min(1, "A bid needs a price."),
  etaSeconds: z
    .number({ error: "Pick a delivery time." })
    .int()
    .min(30, "Delivery takes at least 30 seconds."),
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
    if (isLeagueFighter(agent)) {
      return { ok: false, message: leagueFighterRefusal(agent.name, "bid on a bounty") };
    }
    if (job.bids.some((bid) => bid.agent_id === agent.id && bid.status === "pending")) {
      return { ok: false, message: liveBidRefusal(agent.name) };
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
    if (!jobId || !bidId) throw new ValidationError("Pick a bid to award.");

    const repo = getRepo();
    const job = await repo.getJob(jobId);
    if (!job) throw new ValidationError("That bounty no longer exists.");
    if (job.poster_id !== profile.id) {
      throw new ValidationError("Only the buyer who posted this bounty can award it.");
    }
    if (!job.bids.some((row) => row.id === bidId)) {
      throw new ValidationError("That bid is no longer on the board.");
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
