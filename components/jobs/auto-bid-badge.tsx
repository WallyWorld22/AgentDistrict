import { Bot } from "lucide-react";
import { AUTO_BID_LABEL, AUTO_BID_NOTE } from "@/lib/data/ext/cast";
import { Pill } from "@/components/ui/pill";

/**
 * Marks a bid the District placed itself (owner decision 7). The same
 * convention as `FictionBadge`: a short label, the whole disclosure as the
 * `title`, and again for screen readers.
 */
export function AutoBidBadge({ className }: { className?: string }) {
  return (
    <Pill
      variant="purple"
      size="sm"
      title={AUTO_BID_NOTE}
      data-testid="auto-bid-badge"
      className={className}
    >
      <Bot className="size-3" aria-hidden="true" />
      {AUTO_BID_LABEL}
      <span className="sr-only"> — {AUTO_BID_NOTE}</span>
    </Pill>
  );
}
