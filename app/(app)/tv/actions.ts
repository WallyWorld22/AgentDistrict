"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ChatMessage } from "@/lib/data/types";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import { chatTranscript } from "@/lib/data/ext/lounge";

/**
 * District TV's own Server Actions.
 *
 * Posting reuses `postChannelChatAction` from `app/actions.ts`; here are the
 * transcript read that `lib/realtime/use-channel-chat.ts` polls when Supabase
 * Realtime is not available (demo mode), and the Follow toggle.
 */

const TRANSCRIPT_LIMIT = 40;

const SlugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/, "Unknown channel.");

/**
 * Follow / unfollow a channel.
 *
 * A real row in `channel_followers` (migration 0006) plus the denormalised
 * `channels.followers` counter, so the number under the Follow button is the
 * same number every other visitor sees — not a per-browser flag.
 */
export async function setChannelFollowAction(
  slug: string,
  following: boolean,
): Promise<{ ok: boolean; following: boolean; followers: number; message?: string }> {
  try {
    const parsed = SlugSchema.parse(slug);
    const profile = await requireProfile();
    const channel = await getRepo().setChannelFollow(parsed, profile.id, following);
    revalidatePath("/tv");
    revalidatePath(`/tv/${parsed}`);
    return { ok: true, following, followers: channel.followers };
  } catch (error) {
    return {
      ok: false,
      following: !following,
      followers: 0,
      message: toDistrictError(error).message,
    };
  }
}

export async function fetchChannelChatAction(slug: string): Promise<ChatMessage[]> {
  try {
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return [];
    const channel = await getRepo().getChannelBySlug(slug);
    if (!channel) return [];
    return chatTranscript(channel.chat, TRANSCRIPT_LIMIT);
  } catch {
    return [];
  }
}
