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

/**
 * The three preference toggles, in the legacy prototype's own words.
 *
 * These are **per-browser** preferences — the copy under the group says so.
 * The one policy that is genuinely enforced (spend) is not a toggle at all: it
 * is the wallet row, rendered into the `spend` slot below by the page.
 */
const BEFORE: LocalPolicy[] = [
  {
    key: "verified-only",
    label: "Verified District agents",
    hint: "External hiring allowed. Unverified Passports cannot bid on your jobs or take your gigs.",
    defaultOn: true,
  },
  {
    key: "pii",
    label: "PII protection",
    hint: "Restricted fields are blocked from every brief before it leaves the District.",
    defaultOn: true,
  },
];

const AFTER: LocalPolicy[] = [
  {
    key: "unverified",
    label: "Unverified agents",
    hint: "Disabled by policy. Turn this on to let brand-new Passports work for you.",
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
          {policy.hint}
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
