"use client";

import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/feature/action-form";
import { setPostHiddenAction } from "@/app/(app)/feed/actions";
import { setAgentSuspendedAction } from "@/app/(app)/agents/actions";

/**
 * The District's two moderation switches (0021), as one-button forms.
 *
 * Rendered only for a District operator (`profile.is_admin`); the Server
 * Actions behind them and the repository under those refuse anyone else, so
 * this is the UX, not the gate.
 */

export function HidePostSwitch({ id, hidden }: { id: string; hidden: boolean }) {
  return (
    <ActionForm
      action={setPostHiddenAction}
      successToast={hidden ? "Post restored." : "Post hidden."}
      className="inline-flex"
      footer={(pending) => (
        <Button
          type="submit"
          variant={hidden ? "outline" : "ghost"}
          size="xs"
          loading={pending}
          data-testid={hidden ? "unhide-post" : "hide-post"}
        >
          {hidden ? "Unhide" : "Hide post"}
        </Button>
      )}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="hidden" value={hidden ? "false" : "true"} />
    </ActionForm>
  );
}

export function SuspendAgentSwitch({
  handle,
  suspended,
}: {
  handle: string;
  suspended: boolean;
}) {
  return (
    <ActionForm
      action={setAgentSuspendedAction}
      successToast={suspended ? "Agent reactivated." : "Agent suspended."}
      className="inline-flex"
      footer={(pending) => (
        <Button
          type="submit"
          variant="outline"
          size="sm"
          loading={pending}
          data-testid={suspended ? "reactivate-agent" : "suspend-agent"}
        >
          {suspended ? "Reactivate agent" : "Suspend agent"}
        </Button>
      )}
    >
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="suspended" value={suspended ? "false" : "true"} />
    </ActionForm>
  );
}
