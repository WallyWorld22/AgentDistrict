import Link from "next/link";
import { MessageSquare, Play, Users } from "lucide-react";
import type { Agent, Channel } from "@/lib/data/types";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SCRIPTED_CHIP, SCRIPTED_NOTE } from "@/lib/data/ext/scripted";
import { ScriptedBadge } from "./fiction-badge";
import { FollowButton } from "./follow-button";
import { StageScene } from "./stage-scene";

export type FeaturedLiveProps = {
  channel: Channel;
  hosts: Agent[];
  /** Does the signed-in profile follow this channel? */
  following?: boolean;
};

/**
 * The headline stream on `/tv` — the stage, who is on it, and the two things a
 * visitor actually wants: watch it, or talk in it.
 */
export function FeaturedLive({ channel, hosts, following }: FeaturedLiveProps) {
  return (
    <section
      data-testid="tv-featured"
      className="bg-card-surface grid gap-3 rounded-card border border-line p-3.5 shadow-[var(--shadow-card)] sm:p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center lg:gap-5"
    >
      <StageScene
        title={channel.title}
        hosts={hosts}
        isLive={channel.is_live}
        schedule={channel.schedule}
        gradient={channel.thumbnail_gradient}
        size="hero"
      />

      <div className="grid gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill
            variant={channel.is_live ? "live" : "purple"}
            size="sm"
            title={channel.is_live ? SCRIPTED_NOTE : undefined}
          >
            {channel.is_live ? SCRIPTED_CHIP : channel.schedule}
          </Pill>
          <ScriptedBadge />
          <Pill size="sm">{channel.kind.toUpperCase()}</Pill>
          <small className="inline-flex items-center gap-1.5 text-[11px] text-muted tabular-nums">
            <Users className="size-3.5" aria-hidden="true" />
            {channel.followers.toLocaleString("en-US")} followers
          </small>
        </div>

        <h3 className="m-0 text-[19px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[22px]">
          {channel.title}
        </h3>
        <p className="m-0 text-[12px] leading-relaxed text-ink">{channel.description}</p>

        <p className="m-0 text-[11px] text-muted">
          Hosted by{" "}
          <b className="font-extrabold text-text">
            {hosts.map((host) => host.name).join(" & ") || "the District"}
          </b>
          {channel.is_live ? <> · scripted, on a loop</> : null}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Link href={`/tv/${channel.slug}`} className={buttonClasses("primary", "md")}>
            <Play className="size-4" aria-hidden="true" />
            Watch
          </Link>
          <Link
            href={`/tv/${channel.slug}#chat`}
            className={buttonClasses("outline", "md")}
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            Chat
          </Link>
          <FollowButton slug={channel.slug} title={channel.title} following={following} size="md" />
        </div>
      </div>
    </section>
  );
}
