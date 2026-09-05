"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * The one transport behind the Lounge and District TV chats.
 *
 * Two modes, one hook, chosen at runtime:
 *
 * - **Supabase Realtime.** When `NEXT_PUBLIC_SUPABASE_URL` /
 *   `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, `createClient()` returns a browser
 *   client and we subscribe to `postgres_changes` (`INSERT`) on the table. New
 *   rows arrive as a push; nothing polls.
 * - **Polling.** In demo mode `createClient()` returns `null` — there is no
 *   Postgres to listen to — so the hook calls the supplied Server Action every
 *   `intervalMs` instead. The demo repository is process-local, so this is
 *   genuinely how another tab's message reaches this one.
 *
 * Either way the caller gets the same thing back: the merged transcript, the
 * transport actually in use, and a `refresh` it can await after posting.
 *
 * Which transport is in play is derived during render from the public env vars
 * (which Next inlines into the client bundle), not discovered in an effect —
 * so the server HTML and the first client render agree.
 */

export type RealtimeFeedOptions<Row> = {
  /** Server-rendered rows, oldest → newest. */
  initial: Row[];
  /**
   * Identity of `initial`. When it changes the transcript is replaced — that
   * covers both a revalidated server render and a caller-side filter change
   * (pass `[]` as `initial` for a filter the server did not render).
   */
  initialKey: string;
  /** Reads the current rows. Called on an interval and after every post. */
  fetcher: () => Promise<Row[]>;
  /** Merge strategy — usually `mergeMessages` from `lib/data/ext/lounge`. */
  merge: (current: Row[], incoming: Row[]) => Row[];
  /** Supabase table to listen to. Omit to always poll. */
  table?: string;
  /** `postgres_changes` row filter, e.g. `channel_id=eq.<uuid>`. */
  filter?: string;
  /** Poll cadence in demo mode. */
  intervalMs?: number;
  /** Pause the subscription/poll. */
  enabled?: boolean;
};

export type RealtimeFeed<Row> = {
  rows: Row[];
  /** `"realtime"` when a Supabase subscription is live, else `"polling"`. */
  transport: "realtime" | "polling";
  /** Re-read from the server now. */
  refresh: () => Promise<void>;
};

const DEFAULT_INTERVAL_MS = 4000;

export function useRealtimeFeed<Row>({
  initial,
  initialKey,
  fetcher,
  merge,
  table,
  filter,
  intervalMs = DEFAULT_INTERVAL_MS,
  enabled = true,
}: RealtimeFeedOptions<Row>): RealtimeFeed<Row> {
  const [rows, setRows] = React.useState<Row[]>(initial);

  // "Adjust state when a prop changes", the React-documented way: a render-time
  // comparison rather than an effect, so the new transcript paints in the same
  // commit instead of one frame later.
  const [seenKey, setSeenKey] = React.useState(initialKey);
  if (seenKey !== initialKey) {
    setSeenKey(initialKey);
    setRows(initial);
  }

  // Latest callbacks, kept out of the subscription effect's dependency list so
  // a re-render never tears down and re-opens the channel.
  const latest = React.useRef({ fetcher, merge });
  React.useEffect(() => {
    latest.current = { fetcher, merge };
  }, [fetcher, merge]);

  const refresh = React.useCallback(async () => {
    try {
      const incoming = await latest.current.fetcher();
      setRows((current) => latest.current.merge(current, incoming));
    } catch {
      /* a dropped poll is not worth surfacing — the next one lands in 4s */
    }
  }, []);

  const transport: "realtime" | "polling" =
    table && isSupabaseConfigured() ? "realtime" : "polling";

  React.useEffect(() => {
    if (!enabled) return;

    if (transport === "realtime" && table) {
      const supabase = createClient();
      if (supabase) {
        const channel: RealtimeChannel = supabase
          .channel(`ad-${table}-${filter ?? "all"}`)
          .on(
            // The typed overload wants a literal union; the runtime takes the string.
            "postgres_changes" as never,
            {
              event: "INSERT",
              schema: "public",
              table,
              ...(filter ? { filter } : {}),
            } as never,
            () => {
              void refresh();
            },
          )
          .subscribe();

        return () => {
          void supabase.removeChannel(channel);
        };
      }
    }

    const timer = setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, transport, table, filter, intervalMs, refresh]);

  return { rows, transport, refresh };
}
