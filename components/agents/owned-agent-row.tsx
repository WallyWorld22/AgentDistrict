import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Agent } from "@/lib/data/types";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import { priceUnit } from "@/lib/data/ext/agents";
import { FIGHTER_FICTION_LABEL } from "@/lib/data/ext/fight-night";
import { isLeagueFighter } from "@/lib/data/league";
import { FictionBadge } from "@/components/tv/fiction-badge";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { StatusPill } from "@/components/ui/status-pill";

/**
 * One Passport you own, on `/profile`.
 *
 * Deliberately not `AgentCard`: that card is a single link, and the row a
 * creator wants has several destinations (the Passport, publishing a gig,
 * bidding). Nesting anchors inside an anchor is invalid HTML, so this is its
 * own shape.
 *
 * A Fight League fighter you own is a character with nothing to sell: its row
 * links to the Passport only — no price, no "Publish a gig", no bounties.
 */
export function OwnedAgentRow({ agent, gigCount }: { agent: Agent; gigCount: number }) {
  const fighter = isLeagueFighter(agent);
  return (
    <div className="bg-inset-surface grid gap-2.5 rounded-[16px] border border-[#1c2638] p-3">
      <div className="flex items-start gap-3">
        <AgentAvatar
          emoji={agent.avatar_emoji}
          handle={agent.handle}
          gradient={agent.avatar_gradient}
          name={agent.name}
          size="md"
          status={agent.status}
        />
        <div className="min-w-0 flex-1">
          <b className="flex items-center gap-2 text-[13px] leading-tight font-extrabold">
            <span className="truncate">{agent.name}</span>
            <StatusPill status={agent.status} size="sm" />
          </b>
          <small className="mt-0.5 block truncate text-[11px] text-muted">
            @{agent.handle} · {AGENT_CATEGORY_LABELS[agent.category]} ·{" "}
            {gigCount} {gigCount === 1 ? "gig" : "gigs"}
          </small>
        </div>
        {fighter ? (
          <FictionBadge label={FIGHTER_FICTION_LABEL} />
        ) : (
          <Price
            cents={agent.starting_price_cents}
            free={agent.is_free}
            from={agent.pricing_model === "from"}
            unit={priceUnit(agent.pricing_model)}
            tone="green"
            size="sm"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Rating value={agent.rating_avg} count={agent.rating_count} />
        <span className="flex-1" />
        <Link
          href={`/agents/${agent.handle}`}
          className={buttonClasses("subtle", "xs")}
          aria-label={`Open ${agent.name}'s Passport`}
        >
          Passport
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </Link>
        {fighter ? null : (
          <>
            <Link href="/gigs/new" className={buttonClasses("outline", "xs")}>
              Publish a gig
            </Link>
            <Link href="/jobs" className={buttonClasses("ghost", "xs")}>
              Find bounties
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
