"use client";

import * as React from "react";
import { formatCents, formatDuration } from "@/lib/utils";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { placeBidAction } from "@/app/(app)/jobs/actions";

export type PlaceBidFormProps = {
  jobId: string;
  budgetCents: number;
  deadlineSeconds: number;
  agents: Array<{ handle: string; name: string; startingPriceCents: number; latencySeconds: number }>;
};

/** ETA choices, clamped to the bounty's own deadline. */
function etaOptions(deadlineSeconds: number): Array<{ value: number; label: string }> {
  const candidates = [60, 300, 900, 1800, 3600, 10_800, 28_800, 86_400];
  const inside = candidates.filter((seconds) => seconds <= deadlineSeconds);
  const values = inside.length > 0 ? inside : [Math.max(60, deadlineSeconds)];
  if (values[values.length - 1] !== deadlineSeconds) values.push(deadlineSeconds);
  return values.map((value) => ({
    value,
    label:
      value === deadlineSeconds
        ? `${formatDuration(value)} (the deadline)`
        : formatDuration(value),
  }));
}

/**
 * Bid as one of your own agents (BUILD_SPEC §4 `/jobs/[id]`).
 *
 * Price and ETA are what buyers compare, so both are pre-filled from the agent
 * you pick — its list price and its typical latency — and the live hint under
 * the price says how that lands against the budget. The server action rejects a
 * bid on your own bounty with a plain-English message.
 */
export function PlaceBidForm({
  jobId,
  budgetCents,
  deadlineSeconds,
  agents,
}: PlaceBidFormProps) {
  const [handle, setHandle] = React.useState(agents[0]?.handle ?? "");
  const agent = agents.find((candidate) => candidate.handle === handle) ?? agents[0];
  const options = etaOptions(deadlineSeconds);

  // A starting point, not a rule: never more than 80% of the budget, never the
  // agent's single-run list price on a bounty that is plainly bigger than one
  // run (a $0.08/run agent quoting $0.08 for 1,000 rows is not a real offer).
  const suggestedCents = Math.max(
    1,
    Math.min(
      Math.round(budgetCents * 0.8),
      Math.max(agent?.startingPriceCents ?? 0, Math.round(budgetCents * 0.25)),
    ),
  );
  const suggestedEta =
    options.find((option) => option.value >= (agent?.latencySeconds ?? 0))?.value ??
    options[options.length - 1].value;

  return (
    <ActionForm
      action={placeBidAction}
      submitLabel="Place bid"
      successToast="Bid placed."
      fullWidth
    >
      <input type="hidden" name="jobId" value={jobId} />

      <Field label="Bid as" htmlFor="bid-agent" required>
        <Select
          id="bid-agent"
          name="agentHandle"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
        >
          {agents.map((option) => (
            <option key={option.handle} value={option.handle}>
              {option.name} (@{option.handle})
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Your price"
          htmlFor="bid-amount"
          required
          hint={`Budget is ${formatCents(budgetCents)}.`}
        >
          <Input
            id="bid-amount"
            name="amount"
            inputMode="decimal"
            required
            key={`amount-${handle}`}
            defaultValue={(suggestedCents / 100).toFixed(2)}
          />
        </Field>
        <Field
          label="Delivery"
          htmlFor="bid-eta"
          required
          hint={`Deadline is ${formatDuration(deadlineSeconds)}.`}
        >
          <Select
            id="bid-eta"
            name="etaSeconds"
            key={`eta-${handle}`}
            defaultValue={String(suggestedEta)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="How you would do it" htmlFor="bid-note" required>
        <Textarea
          id="bid-note"
          name="note"
          rows={3}
          required
          minLength={4}
          placeholder="What you would run, what the buyer gets back, and why this price."
        />
      </Field>
    </ActionForm>
  );
}
