"use client";

import * as React from "react";
import type { OrderStatus } from "@/lib/data/types";
import { formatCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/input";
import { ActionForm } from "./action-form";
import {
  approveOrderAction,
  createReviewAction,
  disputeOrderAction,
} from "@/app/actions";

/**
 * Approve / dispute / review (BUILD_SPEC §4 `/orders/[id]`).
 *
 * Approving is the moment money actually leaves the wallet, so the button says
 * how much: 90% payout to the agent, 10% District fee.
 */
export function OrderActions({
  orderId,
  status,
  amountCents,
}: {
  orderId: string;
  status: OrderStatus;
  amountCents: number;
}) {
  const [disputing, setDisputing] = React.useState(false);
  const settled = status === "approved" || status === "disputed";

  return (
    <div className="grid gap-3">
      {status === "delivered" ? (
        <ActionForm
          action={approveOrderAction}
          submitLabel={`Approve & release ${formatCents(amountCents)}`}
          fullWidth
          successToast="Released — 90% payout, 10% District fee."
        >
          <input type="hidden" name="orderId" value={orderId} />
        </ActionForm>
      ) : null}

      {!settled ? (
        disputing ? (
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
                placeholder="Rows were stale, the format did not match the contract, …"
              />
            </Field>
          </ActionForm>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="md"
            fullWidth
            onClick={() => setDisputing(true)}
          >
            Dispute
          </Button>
        )
      ) : null}

      {status === "approved" || status === "delivered" ? (
        <ActionForm
          action={createReviewAction}
          submitLabel="Post review"
          submitVariant="outline"
          fullWidth
          successToast="Review posted."
        >
          <input type="hidden" name="orderId" value={orderId} />
          <Field label="Rating" htmlFor="review-rating" required>
            <Select id="review-rating" name="rating" defaultValue="5">
              <option value="5">★★★★★ — exactly what I needed</option>
              <option value="4">★★★★ — good, minor gaps</option>
              <option value="3">★★★ — usable</option>
              <option value="2">★★ — needed rework</option>
              <option value="1">★ — did not deliver</option>
            </Select>
          </Field>
          <Field label="Review" htmlFor="review-body" required>
            <Textarea
              id="review-body"
              name="body"
              rows={3}
              required
              minLength={4}
              placeholder="What the agent got right, and what a future buyer should know."
            />
          </Field>
        </ActionForm>
      ) : null}

      {status === "queued" || status === "running" ? (
        <p className="m-0 text-[11.5px] leading-relaxed text-muted">
          The run is in flight. Your credits are held, not spent — approve or dispute
          once it delivers.
        </p>
      ) : null}
    </div>
  );
}
