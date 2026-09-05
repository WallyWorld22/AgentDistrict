"use client";

import { Loader2, PauseCircle, PlayCircle } from "lucide-react";
import { cn, formatCents } from "@/lib/utils";
import { ActionForm } from "@/components/feature/action-form";
import { setSpendPauseAction } from "@/app/(app)/command/actions";

export type SpendPauseProps = {
  paused: boolean;
  /** The wallet's daily autonomous ceiling, for the copy under the switch. */
  dailyLimitCents: number;
};

/**
 * "Pause all external agent spending" (BUILD_SPEC §4 `/command`).
 *
 * A real control, not a preference: the switch is a form submit, the flag lives
 * on the session server-side, and every unattended spend path — @World's
 * "Assemble & run" and its one-click hires — refuses while it is on. The wallet's
 * approval threshold and daily ceiling keep enforcing themselves underneath for
 * API-key and MCP callers; the copy says so rather than overclaiming.
 */
export function SpendPause({ paused, dailyLimitCents }: SpendPauseProps) {
  return (
    <ActionForm
      action={setSpendPauseAction}
      className="gap-2"
      footer={(pending) => (
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-[16px] border p-3",
            paused
              ? "border-[#8a3142] bg-[#25101a]"
              : "bg-inset-surface border-[#1c2638]",
          )}
        >
          <div className="min-w-0">
            <b id="spend-pause-label" className="block text-[12.5px] font-extrabold">
              Pause all external agent spending
            </b>
            <small
              id="spend-pause-hint"
              className="mt-0.5 block text-[10.5px] leading-relaxed text-muted"
            >
              {paused
                ? "Paused. @World cannot start runs and no unattended order can be placed. Runs already in flight finish and stay held."
                : `Live. Unattended spend is capped at ${formatCents(
                    dailyLimitCents,
                  )} a day and anything over your approval threshold still needs you.`}
            </small>
          </div>

          <button
            type="submit"
            role="switch"
            aria-checked={paused}
            aria-labelledby="spend-pause-label"
            aria-describedby="spend-pause-hint"
            disabled={pending}
            className={cn(
              "relative inline-flex h-6 w-[42px] shrink-0 cursor-pointer items-center rounded-full p-[3px]",
              "transition-colors duration-200 ease-out",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
              "disabled:cursor-progress disabled:opacity-60",
              paused ? "bg-[#5a1f2c]" : "bg-[#1a2333]",
            )}
          >
            <span
              className={cn(
                "grid size-[18px] place-items-center rounded-full bg-white text-[#0a0f1a] shadow-[0_1px_3px_rgba(0,0,0,.4)]",
                "transition-transform duration-200 ease-out",
                paused ? "translate-x-[18px]" : "translate-x-0",
              )}
              aria-hidden="true"
            >
              {pending ? (
                <Loader2 className="size-3 animate-spin-slow" />
              ) : paused ? (
                <PauseCircle className="size-3" />
              ) : (
                <PlayCircle className="size-3" />
              )}
            </span>
          </button>
        </div>
      )}
    >
      {/* Submitting toggles: the value is what the switch will become. */}
      <input type="hidden" name="paused" value={paused ? "0" : "1"} />
    </ActionForm>
  );
}
