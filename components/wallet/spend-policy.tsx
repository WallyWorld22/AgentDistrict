"use client";

import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { updateSpendPolicyAction } from "@/app/(app)/wallet/actions";

/**
 * The editable half of the spend policy.
 *
 * Only rendered when the repository exposes `updateWalletPolicy`
 * (`supportsWalletPolicy`); otherwise the page shows the same two numbers
 * read-only rather than a control that cannot save.
 */
export function SpendPolicyForm({
  thresholdCents,
  dailyLimitCents,
}: {
  thresholdCents: number;
  dailyLimitCents: number;
}) {
  return (
    <ActionForm
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
        hint="Per order. Above this, an unattended caller must get a human to approve."
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
        hint="Total unattended spend allowed in one day."
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
