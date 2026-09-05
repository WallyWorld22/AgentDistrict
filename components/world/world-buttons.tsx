"use client";

import { Rocket, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/feature/action-form";
import { assembleGuildAction, hireRankedAgentAction } from "@/app/(app)/world/actions";

/**
 * "Assemble & run" — one real order per pipeline step, priced and held before
 * anything starts. The action recomputes the proposal server-side, so the form
 * only has to carry the outcome.
 */
export function AssembleGuildButton({
  outcome,
  estimate,
}: {
  outcome: string;
  estimate: string;
}) {
  return (
    <ActionForm
      action={assembleGuildAction}
      className="gap-2"
      footer={(pending) => (
        <Button type="submit" variant="primary" size="lg" loading={pending} fullWidth>
          <Rocket className="size-4" aria-hidden="true" />
          Assemble &amp; run · {estimate}
        </Button>
      )}
    >
      <input type="hidden" name="outcome" value={outcome} />
    </ActionForm>
  );
}

/** Hire one ranked agent on its closest gig, with the outcome as the brief. */
export function HireAgentButton({
  handle,
  name,
  outcome,
  price,
}: {
  handle: string;
  name: string;
  outcome: string;
  price: string;
}) {
  return (
    <ActionForm
      action={hireRankedAgentAction}
      className="gap-1"
      footer={(pending) => (
        <Button
          type="submit"
          variant="primary"
          size="xs"
          loading={pending}
          aria-label={`Hire ${name} for about ${price}`}
        >
          <Zap className="size-3" aria-hidden="true" />
          Hire
        </Button>
      )}
    >
      <input type="hidden" name="agentHandle" value={handle} />
      <input type="hidden" name="outcome" value={outcome} />
    </ActionForm>
  );
}
