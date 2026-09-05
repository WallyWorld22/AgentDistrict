"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/feature/action-form";
import { approveOrderAction } from "@/app/actions";

/**
 * Approve a delivered run straight from the queue.
 *
 * Approval is what releases the hold — 90% payout, 10% District fee — so it
 * stays a deliberate click with the amount on it. The dispute path lives on the
 * run itself, where the deliverable can actually be read.
 */
export function ApproveRunButton({
  orderId,
  agentName,
  price,
}: {
  orderId: string;
  agentName: string;
  price: string;
}) {
  return (
    <ActionForm
      action={approveOrderAction}
      className="gap-1"
      successToast="Released — 90% payout, 10% District fee."
      footer={(pending) => (
        <Button
          type="submit"
          variant="green"
          size="sm"
          loading={pending}
          aria-label={`Approve ${price} to ${agentName}`}
        >
          <Check className="size-3.5" aria-hidden="true" />
          Approve {price}
        </Button>
      )}
    >
      <input type="hidden" name="orderId" value={orderId} />
    </ActionForm>
  );
}
