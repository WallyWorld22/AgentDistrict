"use client";

import { AlertTriangle } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import { SignInHint } from "@/components/auth/sign-in-prompt";

/**
 * A failed Server Action, rendered inline and announced.
 *
 * Domain errors already carry user-facing copy, so the message is shown
 * verbatim — except a failure marked `signIn` (no account behind the request),
 * which becomes "**Sign in** to continue." with the words as a link back to
 * this page. A bare "Sign in to continue" left a signed-out visitor nowhere to
 * go (shell-home-02).
 */
export function FormAlert({
  state,
  compact = false,
  className,
}: {
  state: ActionState;
  compact?: boolean;
  className?: string;
}) {
  if (!state || state.ok) return null;
  return (
    <p
      role="alert"
      className={cn(
        "m-0 flex items-start gap-2 rounded-[13px] border border-[#8a3142] bg-[#2c1017] px-3 py-2 font-semibold text-[#ffb3bd]",
        compact ? "text-[11.5px]" : "text-[12px]",
        className,
      )}
    >
      <AlertTriangle
        className={cn("mt-px shrink-0", compact ? "size-3.5" : "size-4")}
        aria-hidden="true"
      />
      {state.signIn ? (
        <span>
          <SignInHint className="text-[#ffd0d6]" /> to continue.
        </span>
      ) : (
        <span>{state.message}</span>
      )}
    </p>
  );
}
