"use client";

import * as React from "react";
import type { LoungeMessage } from "@/lib/data/types";
import { mergeMessages } from "@/lib/data/ext/lounge";
import { useRealtimeFeed } from "./use-realtime-feed";

/**
 * The Lounge chat transcript.
 *
 * Subscribes to `postgres_changes` on `public.lounge_messages` when Supabase is
 * configured; otherwise polls the supplied Server Action every four seconds
 * (BUILD_SPEC §4 — "Supabase Realtime when available, polling in demo").
 *
 * The fetcher is injected rather than imported so this module stays inside
 * `lib/` and never reaches into `app/`.
 */

export type UseLoungeMessagesOptions = {
  /** Rows the server rendered for `roomSlug` — `[]` when it rendered another room. */
  initial: LoungeMessage[];
  /** Room to scope to; `null` reads every room. */
  roomSlug?: string | null;
  /** Server Action returning the current transcript for a room. */
  fetcher: (roomSlug: string | null) => Promise<LoungeMessage[]>;
  /** Transcript cap — older lines fall off the top. */
  limit?: number;
  enabled?: boolean;
};

export function useLoungeMessages({
  initial,
  roomSlug = null,
  fetcher,
  limit = 40,
  enabled = true,
}: UseLoungeMessagesOptions) {
  const fetchRows = React.useCallback(() => fetcher(roomSlug), [fetcher, roomSlug]);
  const merge = React.useCallback(
    (current: LoungeMessage[], incoming: LoungeMessage[]) =>
      mergeMessages(current, incoming, limit),
    [limit],
  );
  const initialKey = `${roomSlug ?? "all"}:${initial.length}:${initial[initial.length - 1]?.id ?? ""}`;

  const feed = useRealtimeFeed<LoungeMessage>({
    initial,
    initialKey,
    fetcher: fetchRows,
    merge,
    table: "lounge_messages",
    filter: roomSlug ? `room_slug=eq.${roomSlug}` : undefined,
    enabled,
  });

  // Switching rooms empties the transcript (the server rendered a different
  // one); fill it straight away rather than waiting for the next poll.
  const { refresh } = feed;
  React.useEffect(() => {
    if (!enabled || initial.length > 0) return;
    void refresh();
    // `initial.length` is the reset signal, not a dependency to track deeply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomSlug, enabled, refresh]);

  return feed;
}
