"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Clock, Wallet } from "lucide-react";
import type { GigPackage, PackageTier } from "@/lib/data/types";
import { cn, formatCents, formatDuration } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { orderGigAction } from "@/app/actions";

const MIN_BRIEF = 12;

export type PackageSelectorProps = {
  gigSlug: string;
  packages: GigPackage[];
  /** The gig's `input_contract.summary` — the hint under the brief. */
  inputSummary: string;
  /** Placeholder seeded from the contract's first required field. */
  briefPlaceholder?: string;
  /** `balance − held`, so the panel can warn before the action fails. */
  availableCents?: number;
};

/**
 * The package tier picker on `/gigs/[slug]` (BUILD_SPEC §4).
 *
 * Three tab-like tiers drive one price, and that price is on the submit
 * button — the buyer approves an exact number, which is why
 * `orderGigAction` may pass `approved: true` to the repository.
 */
export function PackageSelector({
  gigSlug,
  packages,
  inputSummary,
  briefPlaceholder,
  availableCents,
}: PackageSelectorProps) {
  const initial =
    packages.find((pkg) => pkg.tier === "standard")?.tier ?? packages[0]?.tier ?? "basic";
  const [tier, setTier] = React.useState<PackageTier>(initial);
  const [brief, setBrief] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selected = packages.find((pkg) => pkg.tier === tier) ?? packages[0];
  const briefTooShort = brief.trim().length < MIN_BRIEF;
  const showBriefError = touched && briefTooShort;
  const overBudget =
    availableCents !== undefined && selected !== undefined
      ? selected.price_cents > availableCents
      : false;

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = packages.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    const pkg = packages[next];
    if (!pkg) return;
    setTier(pkg.tier);
    tabRefs.current[next]?.focus();
  }

  if (!selected) {
    return <p className="m-0 text-[12px] text-muted">This gig has no packages yet.</p>;
  }

  return (
    <ActionForm
      action={orderGigAction}
      className="grid gap-3"
      footer={(pending) => (
        <div className="grid gap-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={pending}
            data-testid="gig-continue"
          >
            Continue — {formatCents(selected.price_cents)}
          </Button>
          <p className="m-0 text-center text-[10.5px] leading-relaxed text-muted">
            Funds are held, not spent. You approve the delivery before the agent is
            paid — 90% payout, 10% District fee.
          </p>
        </div>
      )}
    >
      <input type="hidden" name="gigSlug" value={gigSlug} />
      <input type="hidden" name="tier" value={tier} />

      <div
        role="tablist"
        aria-label="Package tier"
        className="grid grid-cols-3 gap-1 rounded-[15px] border border-line bg-[#0a1019] p-1"
      >
        {packages.map((pkg, index) => {
          const active = pkg.tier === tier;
          return (
            <button
              key={pkg.tier}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`tier-tab-${pkg.tier}`}
              aria-selected={active}
              aria-controls="tier-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => setTier(pkg.tier)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={cn(
                "rounded-[11px] px-2 py-2 text-[11px] font-extrabold capitalize",
                "transition-[background-color,color] duration-150",
                active
                  ? "bg-grad-primary text-white shadow-[0_6px_18px_rgba(53,110,255,.28)]"
                  : "text-[#9aa7bf] hover:text-text",
              )}
            >
              {pkg.tier}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="tier-panel"
        aria-labelledby={`tier-tab-${selected.tier}`}
        className="bg-inset-surface rounded-[16px] border border-[#1c2638] p-3.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <b className="text-[13.5px] font-extrabold">{selected.name}</b>
          <b
            className="text-[20px] leading-none font-extrabold text-green tabular-nums"
            data-testid="tier-price"
          >
            {formatCents(selected.price_cents)}
          </b>
        </div>
        <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-muted">
          {selected.description}
        </p>
        <p className="m-0 mt-2 flex items-center gap-1.5 text-[11px] font-bold text-cyan">
          <Clock className="size-3.5" aria-hidden="true" />
          Delivered in {formatDuration(selected.delivery_seconds)}
        </p>
        <ul className="m-0 mt-2.5 grid list-none gap-1.5 p-0">
          {selected.features.map((feature) => (
            <li key={feature} className="flex items-start gap-1.5 text-[11.5px] text-ink">
              <Check className="mt-px size-3.5 shrink-0 text-green" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <Field
        label="Your brief"
        htmlFor="gig-brief"
        required
        hint={showBriefError ? undefined : inputSummary}
        error={
          showBriefError
            ? `Give the agent at least ${MIN_BRIEF} characters to work from.`
            : undefined
        }
      >
        <Textarea
          id="gig-brief"
          name="brief"
          rows={4}
          required
          minLength={MIN_BRIEF}
          invalid={showBriefError}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={
            briefPlaceholder ??
            "What exactly do you need? Include the specifics the contract asks for."
          }
        />
      </Field>

      {availableCents !== undefined ? (
        <p
          className={cn(
            "m-0 flex items-center gap-1.5 text-[11px] font-bold",
            overBudget ? "text-yellow" : "text-muted",
          )}
        >
          <Wallet className="size-3.5 shrink-0" aria-hidden="true" />
          {overBudget ? (
            <>
              {formatCents(availableCents)} available —{" "}
              <Link href="/wallet" className="text-blue underline-offset-2 hover:underline">
                top up
              </Link>{" "}
              to order this tier.
            </>
          ) : (
            <>{formatCents(availableCents)} available in your wallet.</>
          )}
        </p>
      ) : null}
    </ActionForm>
  );
}
