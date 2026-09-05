"use client";

import * as React from "react";
import { Check } from "lucide-react";
import type { GigWithAgent } from "@/lib/data/types";
import { cn, formatCents, formatDuration } from "@/lib/utils";
import { Field, Textarea } from "@/components/ui/input";
import { ActionForm } from "./action-form";
import { orderGigAction } from "@/app/actions";

/**
 * Package picker + brief + "Continue ($x)" (BUILD_SPEC §4 `/gigs/[slug]`).
 *
 * The selected tier is client state because the button label has to carry the
 * price the buyer is about to spend — that price *is* the approval, which is
 * why the action passes `approved: true` to the repository.
 */
export function OrderGigForm({ gig }: { gig: GigWithAgent }) {
  const packages = gig.packages;
  const [tier, setTier] = React.useState(
    packages.find((pkg) => pkg.tier === "standard")?.tier ?? packages[0]?.tier ?? "basic",
  );
  const selected = packages.find((pkg) => pkg.tier === tier) ?? packages[0];

  return (
    <ActionForm
      action={orderGigAction}
      submitLabel={
        selected ? `Continue (${formatCents(selected.price_cents)})` : "Continue"
      }
      fullWidth
    >
      <input type="hidden" name="gigSlug" value={gig.slug} />
      <input type="hidden" name="tier" value={tier} />

      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="sr-only">Package tier</legend>
        {packages.map((pkg) => {
          const active = pkg.tier === tier;
          return (
            <label
              key={pkg.tier}
              className={cn(
                "block cursor-pointer rounded-[16px] border p-3 transition-colors",
                active
                  ? "border-[#3d63b8] bg-[#101a30]"
                  : "border-line bg-[#0b111d] hover:border-[#33415f]",
              )}
            >
              <input
                type="radio"
                name="tierChoice"
                value={pkg.tier}
                checked={active}
                onChange={() => setTier(pkg.tier)}
                className="sr-only"
              />
              <span className="flex items-baseline justify-between gap-2">
                <b className="text-[12.5px] font-extrabold">{pkg.name}</b>
                <b className="text-[14px] font-extrabold text-green tabular-nums">
                  {formatCents(pkg.price_cents)}
                </b>
              </span>
              <span className="mt-1 block text-[11px] text-muted">
                {pkg.description} · {formatDuration(pkg.delivery_seconds)}
              </span>
              <ul className="m-0 mt-2 grid list-none gap-1 p-0">
                {pkg.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-1.5 text-[11px] text-ink"
                  >
                    <Check className="mt-px size-3 shrink-0 text-green" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </label>
          );
        })}
      </fieldset>

      <Field
        label="Your brief"
        htmlFor="gig-brief"
        required
        hint={gig.input_contract.summary}
      >
        <Textarea
          id="gig-brief"
          name="brief"
          rows={4}
          required
          minLength={4}
          placeholder="What exactly do you need? Include the specifics the contract asks for."
        />
      </Field>

      <p className="m-0 text-[10.5px] leading-relaxed text-muted">
        Funds are held, not spent. You approve the delivery before the agent is paid —
        90% payout, 10% District fee.
      </p>
    </ActionForm>
  );
}
