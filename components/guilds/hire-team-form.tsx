"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { cn, formatCents, formatDuration } from "@/lib/utils";
import type { PackageTier } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { ActionForm } from "@/components/feature/action-form";
import { hireGuildAction } from "@/app/(app)/guilds/actions";

export type HireTierOption = {
  tier: PackageTier;
  label: string;
  totalCents: number;
  etaSeconds: number;
  /** Per-member price at this tier, in pipeline order. */
  prices: number[];
};

export type HireMember = {
  name: string;
  role: string;
  gigTitle: string | null;
};

/**
 * "Hire Team" — one order per member, priced before the click.
 *
 * The tier chips are the only client state on the page: switching tier repricess
 * every step from data the server already computed, so the total on the button
 * is the exact amount the wallet will be asked to hold. The submit goes through
 * `<ActionForm>` like every other mutation in the District.
 */
export function HireTeamForm({
  slug,
  guildName,
  members,
  tiers,
  availableCents,
}: {
  slug: string;
  guildName: string;
  members: HireMember[];
  tiers: HireTierOption[];
  availableCents: number;
}) {
  const [tier, setTier] = React.useState<PackageTier>(tiers[0]?.tier ?? "basic");
  const active = tiers.find((option) => option.tier === tier) ?? tiers[0];
  const hireable = members.filter((member) => member.gigTitle !== null).length;
  const short = active ? active.totalCents - availableCents : 0;

  return (
    <ActionForm
      action={hireGuildAction}
      className="gap-3"
      footer={(pending) => (
        <Button type="submit" variant="primary" size="md" loading={pending} fullWidth>
          <Users className="size-4" aria-hidden="true" />
          Hire Team — {formatCents(active?.totalCents ?? 0)}
        </Button>
      )}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tier" value={tier} />

      <div>
        <span className="mb-1.5 block text-[10px] font-extrabold tracking-[0.06em] text-muted uppercase">
          Package
        </span>
        <Tabs
          label="Package tier"
          size="sm"
          value={tier}
          onValueChange={(value) => setTier(value as PackageTier)}
          items={tiers.map((option) => ({
            value: option.tier,
            label: option.label,
          }))}
        />
      </div>

      <ul className="m-0 grid list-none gap-1 p-0">
        {members.map((member, index) => (
          <li
            key={`${member.name}-${index}`}
            className={cn(
              "flex items-baseline justify-between gap-3 border-b border-[#161f30] py-1.5 last:border-0",
              member.gigTitle === null && "opacity-55",
            )}
          >
            <span className="min-w-0">
              <b className="block truncate text-[11.5px] font-bold text-ink">
                {member.name}
              </b>
              <small className="block truncate text-[10px] text-muted">
                {member.gigTitle ?? "No published gig — skipped"}
              </small>
            </span>
            <b className="shrink-0 text-[11.5px] font-extrabold tabular-nums">
              {member.gigTitle === null
                ? "—"
                : formatCents(active?.prices[index] ?? 0)}
            </b>
          </li>
        ))}
      </ul>

      <div className="bg-inset-surface grid gap-1 rounded-[16px] border border-[#1c2638] p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11.5px] text-muted">
            {hireable} {hireable === 1 ? "run" : "runs"}, started together
          </span>
          <b className="text-[16px] font-extrabold text-green tabular-nums">
            {formatCents(active?.totalCents ?? 0)}
          </b>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11.5px] text-muted">Slowest step</span>
          <b className="text-[11.5px] font-bold text-ink tabular-nums">
            {formatDuration(active?.etaSeconds ?? 0)}
          </b>
        </div>
      </div>

      <Field
        label={`Brief for ${guildName}`}
        htmlFor="guild-brief"
        required
        hint="Every step gets this brief, prefixed with its role."
      >
        <Textarea
          id="guild-brief"
          name="brief"
          rows={3}
          required
          minLength={8}
          placeholder="e.g. 200 roofing companies in Tampa, owner contact where public, scored and QA'd."
        />
      </Field>

      {short > 0 ? (
        <p className="m-0 text-[11px] leading-relaxed text-yellow">
          {formatCents(active?.totalCents ?? 0)} is {formatCents(short)} more than the{" "}
          {formatCents(availableCents)} you have available. Add credits on the Wallet
          first, or pick a smaller package.
        </p>
      ) : null}
    </ActionForm>
  );
}
