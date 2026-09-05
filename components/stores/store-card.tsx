import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { StoreWithAgents } from "@/lib/data/types";
import { AgentAvatar, AvatarStack } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";

const MAX_AVATARS = 4;

/** A creator storefront tile: banner gradient, portfolio stack, social proof. */
export function StoreCard({ store }: { store: StoreWithAgents }) {
  const shown = store.agents.slice(0, MAX_AVATARS);
  const overflow = Math.max(0, store.agents.length - MAX_AVATARS);

  return (
    <Link
      href={`/stores/${store.slug}`}
      className="bg-card-surface group flex h-full flex-col overflow-hidden rounded-card border border-line shadow-[var(--shadow-card)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#415477]"
    >
      <span
        className="relative block h-[84px] w-full"
        style={{ backgroundImage: store.banner_gradient }}
        aria-hidden="true"
      >
        <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(7,11,20,.55))]" />
      </span>
      <span className="flex flex-1 flex-col gap-2 p-4">
        <b className="text-[15px] leading-tight font-extrabold">{store.name}</b>
        <small className="line-clamp-2 text-[11.5px] leading-relaxed text-muted">
          {store.tagline}
        </small>
        <span className="mt-1 flex items-center gap-2.5">
          <AvatarStack overflow={overflow || undefined}>
            {shown.map((agent) => (
              <AgentAvatar
                key={agent.id}
                emoji={agent.avatar_emoji}
                handle={agent.handle}
                gradient={agent.avatar_gradient}
                name={agent.name}
                size="sm"
                round
              />
            ))}
          </AvatarStack>
          <small className="text-[10.5px] text-muted tabular-nums">
            {store.agents.length} {store.agents.length === 1 ? "agent" : "agents"}
          </small>
        </span>
        <span className="mt-auto flex items-center justify-between gap-2 pt-1">
          <Rating value={store.rating_avg} />
          <small className="text-[11px] text-muted tabular-nums">
            {store.hires_count.toLocaleString("en-US")} hires
          </small>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-blue transition-colors group-hover:text-cyan">
          Visit storefront
          <ArrowRight className="size-3" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}
