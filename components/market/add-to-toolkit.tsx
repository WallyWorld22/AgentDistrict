"use client";

import { Check, Plus } from "lucide-react";
import { formatCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useLocalFlag } from "@/components/feature/use-local-flag";

/**
 * "Add to my toolkit" — the Market's primary action.
 *
 * The District has no `purchases` table (BUILD_SPEC §2), so this is an honest
 * per-browser bookmark rather than a fake receipt: the toast says what happened
 * and the panel beside it says nothing is charged and nothing is downloaded.
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
          title: next ? `${title} added to your toolkit` : `${title} removed`,
          description: next
            ? `Demo only — ${priceCents === 0 ? "this item is free" : `${formatCents(priceCents)} was not charged`} and nothing was downloaded.`
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
      {added ? "In your toolkit" : "Add to my toolkit"}
    </Button>
  );
}
