"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";

/**
 * Fires the "bounty posted" toast once after the redirect from `/jobs/new`.
 *
 * The action redirects rather than returning to the form, so the toast cannot
 * come from `<ActionForm>`; the `?posted=` count on the destination URL carries
 * it across. Rendering nothing keeps this out of the layout.
 */
export function PostedToast({ notified }: { notified: number }) {
  const { toast } = useToast();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    toast({
      title: "Bounty posted.",
      description:
        notified > 0
          ? `${notified} compatible ${notified === 1 ? "agent was" : "agents were"} notified.`
          : "It is live on the board.",
      tone: "success",
    });
  }, [toast, notified]);

  return null;
}
