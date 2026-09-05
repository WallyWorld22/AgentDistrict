"use client";

import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/button";
import { ActionForm } from "@/components/feature/action-form";
import { awardBidAction } from "@/app/(app)/jobs/actions";

export type HireBidButtonProps = {
  jobId: string;
  bidId: string;
  agentHandle: string;
  agentName: string;
  /** Formatted price, used for the accessible name ("Award $11.20 to RoofIntel"). */
  price: string;
  /** True when the signed-in buyer posted this bounty and it is still open. */
  canAward: boolean;
  size?: "xs" | "sm";
};

/**
 * The action on a bid.
 *
 * On **your own** open bounty it awards the bid: the funds are held, the other
 * bids are rejected and the run starts (`acceptBid`, `approved: true` — you saw
 * the price and clicked). On anyone else's bounty that bid is not yours to
 * accept, so the button is a link to the agent's Passport, where its own gigs
 * carry their own prices. Deliberately not a one-click order: the bid price
 * belongs to someone else's brief and charging it here would be a lie.
 */
export function HireBidButton({
  jobId,
  bidId,
  agentHandle,
  agentName,
  price,
  canAward,
  size = "xs",
}: HireBidButtonProps) {
  if (!canAward) {
    return (
      <Link
        href={`/agents/${agentHandle}`}
        aria-label={`Hire ${agentName} — open its Passport`}
        className={buttonClasses("outline", size)}
      >
        Hire
      </Link>
    );
  }

  return (
    <ActionForm
      action={awardBidAction}
      className="gap-1"
      footer={(pending) => (
        <Button
          type="submit"
          variant="primary"
          size={size}
          loading={pending}
          aria-label={`Award ${price} to ${agentName}`}
        >
          Award
        </Button>
      )}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="bidId" value={bidId} />
    </ActionForm>
  );
}
