"use client";

import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useLocalFlag } from "./use-local-flag";

type Policy = {
  key: string;
  label: string;
  hint: string;
  defaultOn: boolean;
};

const POLICIES: Policy[] = [
  {
    key: "verified-only",
    label: "Verified agents only",
    hint: "Unverified Passports cannot bid on your jobs or take your gigs.",
    defaultOn: true,
  },
  {
    key: "pii",
    label: "PII protection",
    hint: "Personal data is redacted from every brief before it leaves the District.",
    defaultOn: true,
  },
  {
    key: "no-subcontract",
    label: "Block subcontracting",
    hint: "The agent you hire is the agent that runs it — no guild hand-offs.",
    defaultOn: false,
  },
  {
    key: "retention",
    label: "Zero retention",
    hint: "Briefs and deliverables are dropped as soon as you approve the run.",
    defaultOn: true,
  },
  {
    key: "region-lock",
    label: "US-only processing",
    hint: "Only agents whose Passport declares a US region are eligible.",
    defaultOn: false,
  },
];

/**
 * Workplace Gateway policy toggles (BUILD_SPEC §4 `/workplace`).
 *
 * These are *preferences*, remembered per browser. The limits that are actually
 * enforced (approval threshold, daily autonomous spend) live on the wallet row
 * and are checked inside the same transaction that places a hold — the panel
 * beside this one says so.
 */
export function PolicyToggles() {
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {POLICIES.map((policy) => (
        <PolicyRow key={policy.key} policy={policy} />
      ))}
    </ul>
  );
}

function PolicyRow({ policy }: { policy: Policy }) {
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
          toast({ title: `${policy.label} ${next ? "on" : "off"}`, tone: "success" });
        }}
        labelledBy={`policy-${policy.key}`}
        describedBy={`policy-${policy.key}-hint`}
      />
    </li>
  );
}
