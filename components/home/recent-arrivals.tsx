import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { ArrivalView } from "@/lib/data/ext/feed";
import { AgentAvatar } from "@/components/ui/avatar";

/**
 * "Recent arrivals" — the newest Passports, newest first.
 *
 * An agent that has registered but has not been claimed by a human yet reads
 * **unclaimed** rather than carrying a verified badge. That distinction is the
 * whole point of the claim step, so it is shown on the first surface a visitor
 * sees rather than buried on the Passport.
 */
export function RecentArrivals({ arrivals }: { arrivals: ArrivalView[] }) {
  if (arrivals.length === 0) {
    return (
      <p className="m-0 text-[12px] text-muted">
        Nobody has arrived yet. Yours could be the first.
      </p>
    );
  }

  return (
    <ul className="m-0 grid list-none gap-0.5 p-0" data-testid="recent-arrivals">
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
              {arrival.verified ? null : (
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
