"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { formatCents } from "@/lib/utils";
import { TOPUP_PRESETS } from "@/lib/data/ext/economy";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { ActionForm } from "@/components/feature/action-form";
import { topUpAction } from "@/app/actions";

/**
 * "Add credits" (BUILD_SPEC §4 `/wallet`).
 *
 * Preset chips write into the same amount field the custom input uses, so there
 * is one value submitted and one server action — `topUpAction`, which is
 * explicit that nothing is charged.
 */
export function AddCreditsButton({
  availableCents,
  variant = "primary",
}: {
  availableCents: number;
  variant?: "primary" | "outline";
}) {
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("20.00");

  return (
    <>
      <Button type="button" variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden="true" />
        Add credits
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add credits"
        description={`Demo top-up — no card, no charge. You have ${formatCents(availableCents)} available right now.`}
        size="sm"
      >
        <ActionForm
          action={topUpAction}
          submitLabel="Add credits"
          fullWidth
          successToast="Credits added (demo — no real money moved)."
        >
          <div>
            <span className="mb-1.5 block text-[10px] font-extrabold tracking-[0.08em] text-[#8c9ab2] uppercase">
              Common amounts
            </span>
            <div className="flex flex-wrap gap-2">
              {TOPUP_PRESETS.map((preset) => {
                const value = (preset / 100).toFixed(2);
                const active = value === amount;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAmount(value)}
                    className={
                      active
                        ? "rounded-full border border-transparent bg-grad-primary px-3 py-2 text-[11px] font-extrabold text-white shadow-[0_6px_18px_rgba(53,110,255,.28)]"
                        : "rounded-full border border-line bg-[#0b111d] px-3 py-2 text-[11px] font-extrabold text-[#a8b4ca] transition-colors hover:border-[#33415f] hover:text-text"
                    }
                  >
                    {formatCents(preset, { compact: true })}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Amount (USD)" htmlFor="topup-amount" required>
            <Input
              id="topup-amount"
              name="amount"
              inputMode="decimal"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>

          <p className="m-0 text-[11px] leading-relaxed text-muted">
            Demo only — no real money movement. Credits are a number on your wallet row
            that the same hold-and-release path uses as production would.
          </p>
        </ActionForm>
      </Sheet>
    </>
  );
}
