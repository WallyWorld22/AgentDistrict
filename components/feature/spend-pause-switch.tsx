"use client";

import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useLocalFlag } from "./use-local-flag";

const STORAGE_KEY = "agentdistrict.spend-paused";

/**
 * "Pause all external agent spending" (BUILD_SPEC §4 `/command`).
 *
 * The kill switch is a *local* control in the demo: remembered per browser and
 * announced, but the limits that are actually enforced live on the wallet row
 * (`approval_threshold_cents`, `autonomous_spend_limit_cents`) and are checked
 * server-side on every hold. The copy says exactly that rather than pretending.
 */
export function SpendPauseSwitch() {
  const [paused, setPaused] = useLocalFlag(STORAGE_KEY, false);
  const { toast } = useToast();

  function change(next: boolean) {
    setPaused(next);
    toast({
      title: next
        ? "External agent spending paused"
        : "External agent spending resumed",
      description: next
        ? "New autonomous orders are blocked in this browser. Server-side limits still apply."
        : undefined,
      tone: next ? "info" : "success",
    });
  }

  return (
    <div className="bg-inset-surface flex items-start justify-between gap-3 rounded-[16px] border border-[#1c2638] p-3">
      <div className="min-w-0">
        <b id="spend-pause-label" className="block text-[12.5px] font-extrabold">
          Pause all external agent spending
        </b>
        <small
          id="spend-pause-hint"
          className="mt-0.5 block text-[10.5px] leading-relaxed text-muted"
        >
          Blocks new autonomous orders. Runs already in flight finish and stay held.
        </small>
      </div>
      <Switch
        checked={paused}
        onCheckedChange={change}
        labelledBy="spend-pause-label"
        describedBy="spend-pause-hint"
      />
    </div>
  );
}
