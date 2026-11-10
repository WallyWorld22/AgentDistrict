"use client";

import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useLocalFlag } from "@/components/feature/use-local-flag";

type LocalPolicy = {
  key: string;
  label: string;
  hint: string;
  defaultOn: boolean;
};

/** Said under every preference switch, so no switch reads as a rule. */
export const PREFERENCE_NOTE = "A stated preference, saved in this browser. Not enforced yet.";

/**
 * The three preference toggles.
 *
 * These are **per-browser** preferences, and nothing in the District reads
 * them: no bid, order or brief is checked against them. Each one is worded as
 * what you would prefer, never as what is blocked, and each says it is not
 * enforced yet. The one policy that is genuinely enforced (spend) is not a
 * toggle at all: it is the wallet row, rendered into the `spend` slot below by
 * the page.
 */
export const BEFORE: LocalPolicy[] = [
  {
    key: "verified-only",
    label: "Prefer verified agents",
    hint: "You would rather verified Passports bid on your jobs and take your gigs.",
    defaultOn: true,
  },
  {
    key: "pii",
    label: "Keep personal data out of briefs",
    hint: "You would rather no brief carried names, emails or phone numbers.",
    defaultOn: true,
  },
];

export const AFTER: LocalPolicy[] = [
  {
    key: "unverified",
    label: "Open to brand-new Passports",
    hint: "You are happy for agents with no track record yet to work for you.",
    defaultOn: false,
  },
];

export function PolicyBoard({ spend }: { spend: ReactNode }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {BEFORE.map((policy) => (
        <PolicyRow key={policy.key} policy={policy} />
      ))}
      <li>{spend}</li>
      {AFTER.map((policy) => (
        <PolicyRow key={policy.key} policy={policy} />
      ))}
    </ul>
  );
}

function PolicyRow({ policy }: { policy: LocalPolicy }) {
  const [on, setOn] = useLocalFlag(`agentdistrict.policy.${policy.key}`, policy.defaultOn);
  const { toast } = useToast();

  return (
    <li className="bg-inset-surface flex items-start justify-between gap-3 rounded-[16px] border border-[#1c2638] p-3">
      <div className="min-w-0">
        <b id={`policy-${policy.key}`} className="block text-[12.5px] font-extrabold">
          {policy.label}
        </b>
        <small
          id={`policy-${policy.key}-hint`}
          className="mt-0.5 block text-[10.5px] leading-relaxed text-muted"
        >
          {policy.hint} {PREFERENCE_NOTE}
        </small>
      </div>
      <Switch
        checked={on}
        onCheckedChange={(next) => {
          setOn(next);
          toast({
            title: `${policy.label} ${next ? "on" : "off"}`,
            description: "Saved in this browser.",
            tone: "success",
          });
        }}
        labelledBy={`policy-${policy.key}`}
        describedBy={`policy-${policy.key}-hint`}
      />
    </li>
  );
}
