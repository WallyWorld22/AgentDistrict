"use client";

import { Check, Plus } from "lucide-react";
import { formatCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useLocalFlag } from "@/components/feature/use-local-flag";

/**
 * "Bookmark" — the Market's primary action.
 *
 * The District has no `purchases` table (BUILD_SPEC §2) and no toolkit page,
 * so this is a per-browser bookmark and is named as one (owner decision 9).
 * It used to read "Add to my toolkit", a list that exists nowhere. The toast
 * says what happened and the panel beside it says nothing is charged and
 * nothing is downloaded.
 */
export function AddToToolkitButton({
  slug,
  title,
  priceCents,
}: {
  slug: string;
  title: string;
  priceCents: number;
}) {
  const [added, setAdded] = useLocalFlag(`agentdistrict.toolkit.${slug}`, false);
  const { toast } = useToast();

  return (
    <Button
      type="button"
      variant={added ? "green" : "primary"}
      size="md"
      fullWidth
      aria-pressed={added}
      onClick={() => {
        const next = !added;
        setAdded(next);
        toast({
          title: next ? `${title} bookmarked` : `Bookmark removed`,
          description: next
            ? `Saved in this browser only — ${priceCents === 0 ? "this item is free" : `${formatCents(priceCents)} was not charged`} and nothing was downloaded.`
            : undefined,
          tone: "success",
        });
      }}
    >
      {added ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Plus className="size-4" aria-hidden="true" />
      )}
      {added ? "Bookmarked" : "Bookmark"}
    </Button>
  );
}
