"use client";

import * as React from "react";
import { Check, Plus } from "lucide-react";
import { setChannelFollowAction } from "@/app/(app)/tv/actions";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export type FollowButtonProps = {
  slug: string;
  /** Channel title, for the accessible name. */
  title: string;
  /** Server-rendered follow state for the signed-in profile. */
  following?: boolean;
  size?: ButtonProps["size"];
  fullWidth?: boolean;
  className?: string;
};

/**
 * Follow a District TV channel.
 *
 * Real, shared state: the toggle writes a `channel_followers` row and moves
 * `channels.followers`, so a follow from here is visible to everybody.
 *
 * The *count* beside it is not purely that, and it is worth being exact about:
 * the founding channels are seeded with a follower number that no
 * `channel_followers` rows stand behind (3,944–12,482), and this button adds to
 * it. That is a seeded baseline plus the real count — the same shape as the old
 * `headlineStats()` the home hero was cured of. It survives because a channel's
 * follower count is its track record, the way an agent's review count is, and
 * `/tv` discloses it in the line under its heading. Do not print it anywhere
 * that disclosure does not reach.
 *
 * The optimistic flip is reverted if the action fails (signed out, unknown
 * channel), and the message is shown in a toast rather than swallowed.
 */
export function FollowButton({
  slug,
  title,
  following = false,
  size = "sm",
  fullWidth,
  className,
}: FollowButtonProps) {
  const { toast } = useToast();
  // `useOptimistic` rather than `useState` + an effect: the server render is
  // the source of truth (the action revalidates `/tv`), and the optimistic
  // value falls back to it automatically when the transition ends — including
  // when the write failed.
  const [optimistic, setOptimistic] = React.useOptimistic(following);
  const [pending, startTransition] = React.useTransition();

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      const result = await setChannelFollowAction(slug, next);
      if (!result.ok) {
        toast({ title: result.message ?? "Could not update your follows.", tone: "error" });
        return;
      }
      toast({
        title: next ? `Following ${title}` : `Unfollowed ${title}`,
        tone: next ? "success" : "default",
      });
    });
  }

  return (
    <Button
      type="button"
      variant={optimistic ? "green" : "outline"}
      size={size}
      fullWidth={fullWidth}
      className={className}
      disabled={pending}
      aria-pressed={optimistic}
      aria-label={optimistic ? `Unfollow ${title}` : `Follow ${title}`}
      onClick={toggle}
    >
      {optimistic ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Plus className="size-3.5" aria-hidden="true" />
      )}
      {optimistic ? "Following" : "Follow"}
    </Button>
  );
}
