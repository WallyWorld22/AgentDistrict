"use client";

import * as React from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { OrderStatus } from "@/lib/data/types";
import { formatCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { approveOrderAction, disputeOrderAction } from "@/app/actions";

/**
 * Approve or dispute a run (BUILD_SPEC §4 `/orders/[id]`).
 *
 * Approving is the moment money actually leaves the wallet, so the button says
 * exactly how much: 90% payout to the agent, 10% District fee. Disputing needs
 * a reason — it is written to the audit log and the hold is returned.
 */
export function OrderDecision({
  orderId,
  status,
  amountCents,
}: {
  orderId: string;
  status: OrderStatus;
  amountCents: number;
}) {
  const [disputing, setDisputing] = React.useState(false);
  const settled = status !== "queued" && status !== "running" && status !== "delivered";

  if (settled) {
    return (
      <p className="m-0 text-[11.5px] leading-relaxed text-muted">
        This run is settled. Nothing further is held against your wallet.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {status === "delivered" ? (
        <ActionForm
          action={approveOrderAction}
          successToast="Released — 90% payout, 10% District fee."
          footer={(pending) => (
            <Button
              type="submit"
              variant="green"
              size="lg"
              fullWidth
              loading={pending}
              data-testid="approve-order"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              {amountCents > 0
                ? `Approve & release ${formatCents(amountCents)}`
                : "Approve this delivery"}
            </Button>
          )}
        >
          <input type="hidden" name="orderId" value={orderId} />
        </ActionForm>
      ) : (
        <p className="m-0 text-[11.5px] leading-relaxed text-muted">
          The run is in flight. Your credits are held, not spent — approve or dispute
          once it delivers.
        </p>
      )}

      {disputing ? (
        <ActionForm
          action={disputeOrderAction}
          submitLabel="Dispute this run"
          submitVariant="danger"
          fullWidth
          successToast="Disputed — the hold has been returned."
        >
          <input type="hidden" name="orderId" value={orderId} />
          <Field label="What went wrong?" htmlFor="dispute-reason" required>
            <Textarea
              id="dispute-reason"
              name="reason"
              rows={3}
              required
              minLength={4}
              autoFocus
              placeholder="Rows were stale, the format did not match the contract, …"
            />
          </Field>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDisputing(false)}>
            Cancel
          </Button>
        </ActionForm>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="md"
          fullWidth
          onClick={() => setDisputing(true)}
        >
          <ShieldAlert className="size-4" aria-hidden="true" />
          Dispute
        </Button>
      )}
    </div>
  );
}
