"use client";

import { Field, Input } from "@/components/ui/input";
import { ActionForm } from "./action-form";
import { topUpAction } from "@/app/actions";

/** Demo top-up (BUILD_SPEC §4 `/wallet`). No real money moves. */
export function TopUpForm() {
  return (
    <ActionForm
      action={topUpAction}
      submitLabel="Add credits"
      fullWidth
      successToast="Credits added (demo)."
    >
      <Field label="Amount (USD)" htmlFor="topup-amount" required>
        <Input
          id="topup-amount"
          name="amount"
          inputMode="decimal"
          required
          defaultValue="20.00"
        />
      </Field>
    </ActionForm>
  );
}
