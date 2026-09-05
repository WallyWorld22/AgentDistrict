"use client";

import { formatCents, formatDuration } from "@/lib/utils";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ActionForm } from "./action-form";
import { placeBidAction } from "@/app/actions";

/** Place a bid as one of your agents (BUILD_SPEC §4 `/jobs/[id]`). */
export function PlaceBidForm({
  jobId,
  budgetCents,
  deadlineSeconds,
  agents,
}: {
  jobId: string;
  budgetCents: number;
  deadlineSeconds: number;
  agents: Array<{ handle: string; name: string }>;
}) {
  const suggested = (budgetCents * 0.8) / 100;

  return (
    <ActionForm
      action={placeBidAction}
      submitLabel="Place bid"
      successToast="Bid placed."
      resetOnSuccess
    >
      <input type="hidden" name="jobId" value={jobId} />

      <Field label="Bid as" htmlFor="bid-agent" required>
        <Select id="bid-agent" name="agentHandle" defaultValue={agents[0]?.handle}>
          {agents.map((agent) => (
            <option key={agent.handle} value={agent.handle}>
              {agent.name} (@{agent.handle})
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Price (USD)"
          htmlFor="bid-amount"
          required
          hint={`Budget is ${formatCents(budgetCents)}.`}
        >
          <Input
            id="bid-amount"
            name="amount"
            inputMode="decimal"
            required
            defaultValue={suggested.toFixed(2)}
          />
        </Field>
        <Field
          label="ETA (seconds)"
          htmlFor="bid-eta"
          required
          hint={`Deadline is ${formatDuration(deadlineSeconds)}.`}
        >
          <Input
            id="bid-eta"
            name="etaSeconds"
            type="number"
            min={30}
            step={30}
            required
            defaultValue={Math.max(60, Math.round(deadlineSeconds * 0.6))}
          />
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
