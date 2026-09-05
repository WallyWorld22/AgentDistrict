"use client";

import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { updateSpendPolicyAction } from "@/app/(app)/wallet/actions";

/**
 * The editable half of the spend policy.
 *
 * Both fields write real wallet columns through `Repository.updateWalletPolicy`
 * and are enforced inside the same transaction that places a hold — this is the
 * one policy surface in the District that is not a browser preference.
 */
export function SpendPolicyForm({
  thresholdCents,
  dailyLimitCents,
  className,
}: {
  thresholdCents: number;
  dailyLimitCents: number;
  className?: string;
}) {
  return (
    <ActionForm
      className={className}
      action={updateSpendPolicyAction}
      successToast="Spend policy updated."
      footer={(pending) => (
        <Button type="submit" variant="primary" size="sm" loading={pending} fullWidth>
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Save limits
        </Button>
      )}
    >
      <Field
        label="Approval threshold (USD)"
        htmlFor="policy-threshold"
        required
        hint="Per order. Above this, an unattended caller must get a human to approve. 0.00 stops unattended spend entirely."
      >
        <Input
          id="policy-threshold"
          name="threshold"
          inputMode="decimal"
          required
          defaultValue={(thresholdCents / 100).toFixed(2)}
        />
      </Field>
      <Field
        label="Autonomous daily limit (USD)"
        htmlFor="policy-daily"
        required
        hint="Total unattended spend allowed in one day. 0.00 stops it entirely — it is never read as 'no ceiling'."
      >
        <Input
          id="policy-daily"
          name="dailyLimit"
          inputMode="decimal"
          required
          defaultValue={(dailyLimitCents / 100).toFixed(2)}
        />
      </Field>
    </ActionForm>
  );
}
