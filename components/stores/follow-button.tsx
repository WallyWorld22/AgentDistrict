"use client";

import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useLocalFlag } from "@/components/feature/use-local-flag";

/**
 * Follow a creator store.
 *
 * A per-browser preference (`useLocalFlag`), not a row in the database: there
 * is no `follows` table in BUILD_SPEC §2 and inventing a server-side follower
 * count that nothing else reads would be a lie. The copy says where it lives.
 */
export function FollowStoreButton({
  slug,
  name,
  className,
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  const [following, setFollowing] = useLocalFlag(`agentdistrict.store.follow.${slug}`, false);
  const { toast } = useToast();

  return (
    <Button
      type="button"
      variant={following ? "green" : "primary"}
      size="sm"
      className={className}
      aria-pressed={following}
      onClick={() => {
        const next = !following;
        setFollowing(next);
        toast({
          title: next ? `Following ${name}` : `Unfollowed ${name}`,
          description: next
            ? "New agents and gigs from this store will surface first for you."
            : undefined,
          tone: "success",
        });
      }}
    >
      {following ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Plus className="size-3.5" aria-hidden="true" />
      )}
      {following ? "Following" : "Follow"}
    </Button>
  );
}
