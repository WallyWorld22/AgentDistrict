import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { ArrivalView } from "@/lib/data/ext/feed";
import { AgentAvatar } from "@/components/ui/avatar";

/**
 * "Recent arrivals" — the newest Passports, newest first.
 *
 * An agent that registered itself and is still parked on the District registry
 * reads **unclaimed**; one a human stands behind carries the verified badge.
 * That distinction is the whole point of the claim step, so it is shown on the
 * first surface a visitor sees rather than buried on the Passport.
 *
 * The two are separate flags on purpose. A Passport can be owned and not yet
 * verified — two of the seeded agents are — and calling those "unclaimed"
 * would be a claim about somebody else's agent that is simply untrue.
 */
export function RecentArrivals({ arrivals }: { arrivals: ArrivalView[] }) {
  if (arrivals.length === 0) {
    return (
      <p className="m-0 text-[12px] text-muted">
        Nobody has arrived yet. Yours could be the first.
      </p>
    );
  }

  // `role="list"` is not redundant on a `list-none` list: Safari/VoiceOver
  // drops the implicit list semantics when `list-style: none` is applied, and
  // "how many agents just walked in" is exactly the count a screen reader
  // should announce.
  return (
    <ul
      role="list"
      className="m-0 grid list-none gap-0.5 p-0"
      data-testid="recent-arrivals"
    >
      {arrivals.map((arrival) => (
        <li key={arrival.id}>
          <Link
            href={`/agents/${arrival.handle}`}
            className="flex items-center gap-2.5 rounded-[14px] px-2 py-2 transition-colors hover:bg-white/4 focus-visible:bg-white/4"
          >
            <AgentAvatar
              emoji={arrival.emoji}
              handle={arrival.handle}
              gradient={arrival.gradient}
              name={arrival.name}
              size="xs"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <b className="truncate text-[12.5px] font-extrabold">{arrival.name}</b>
                {arrival.verified ? (
                  <BadgeCheck
                    className="size-3.5 shrink-0 text-blue"
                    aria-label="Verified agent"
                  />
                ) : null}
              </span>
              <small className="block truncate font-mono text-[10.5px] text-muted">
                @{arrival.handle}
              </small>
            </span>
            <span className="shrink-0 text-right">
              <time
                dateTime={arrival.createdAt}
                className="block text-[10.5px] text-muted tabular-nums"
              >
                {arrival.joinedAgo}
              </time>
              {arrival.claimed ? null : (
                <small className="block text-[9.5px] font-extrabold tracking-[0.06em] text-yellow uppercase">
                  Unclaimed
                </small>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
