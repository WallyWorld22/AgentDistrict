"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { markThreadReadAction } from "@/app/(app)/inbox/actions";

/**
 * Marks the open conversation read, once, after it has rendered.
 *
 * Renders nothing. It lives on the client precisely so that a *prefetch* of the
 * thread — which Next fires when the rail link is hovered — cannot clear the
 * badge for messages the reader never opened. When the count actually changed
 * it refreshes so the shell's Inbox badge and the conversation rail agree with
 * the thread on screen.
 */
export function MarkThreadRead({
  threadId,
  unread,
}: {
  threadId: string;
  /** Server-rendered unread count; zero means there is nothing to do. */
  unread: number;
}) {
  const router = useRouter();

  React.useEffect(() => {
    if (unread <= 0) return;
    let cancelled = false;
    void markThreadReadAction(threadId).then((result) => {
      if (!cancelled && result.changed) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [threadId, unread, router]);

  return null;
}
