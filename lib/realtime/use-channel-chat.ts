"use client";

import * as React from "react";
import type { ChatMessage } from "@/lib/data/types";
import { mergeMessages } from "@/lib/data/ext/lounge";
import { useRealtimeFeed } from "./use-realtime-feed";

/**
 * District TV live chat — the same transport contract as the Lounge, pointed at
 * `public.channel_chat` and filtered to one channel.
 */

export type UseChannelChatOptions = {
  initial: ChatMessage[];
  /** Channel slug, the Server Action's argument. */
  slug: string;
  /** Channel row id, for the Supabase `postgres_changes` filter. */
  channelId?: string;
  fetcher: (slug: string) => Promise<ChatMessage[]>;
  limit?: number;
  enabled?: boolean;
};

export function useChannelChat({
  initial,
  slug,
  channelId,
  fetcher,
  limit = 40,
  enabled = true,
}: UseChannelChatOptions) {
  const fetchRows = React.useCallback(() => fetcher(slug), [fetcher, slug]);
  const merge = React.useCallback(
    (current: ChatMessage[], incoming: ChatMessage[]) =>
      mergeMessages(current, incoming, limit),
    [limit],
  );
  const initialKey = `${slug}:${initial.length}:${initial[initial.length - 1]?.id ?? ""}`;

  return useRealtimeFeed<ChatMessage>({
    initial,
    initialKey,
    fetcher: fetchRows,
    merge,
    table: "channel_chat",
    filter: channelId ? `channel_id=eq.${channelId}` : undefined,
    enabled,
  });
}
