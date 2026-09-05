import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { pipelineSteps } from "@/lib/data/ext/economy";
import type { GuildWithMembers } from "@/lib/data/types";
import { AgentAvatar, AvatarStack } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";

const MAX_AVATARS = 4;

/**
 * The `/guilds` browse tile.
 *
 * Richer than the shared `GuildCard` used on the home page: this one also
 * renders the pipeline as arrow-separated stages and the lifetime hire count,
 * which is what a buyer comparing six teams actually needs. Same tokens, same
 * nested-radius rule, so the two read as one system.
 */
export function GuildTile({ guild }: { guild: GuildWithMembers }) {
  const href = `/guilds/${guild.slug}`;
  const shown = guild.members.slice(0, MAX_AVATARS);
  const overflow = Math.max(0, guild.members.length - MAX_AVATARS);
  const stages = pipelineSteps(guild.pipeline);

  return (
    <article className="bg-card-surface flex h-full flex-col gap-3 rounded-card border border-line p-4 shadow-[var(--shadow-card)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#415477]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] leading-tight font-extrabold">
            <Link href={href} className="hover:text-blue">
              {guild.name}
            </Link>
          </h3>
          <Rating value={guild.rating_avg} count={guild.rating_count} className="mt-1" />
        </div>
        <Pill variant={guild.status === "available" ? "green" : "yellow"} size="sm">
          {guild.status === "available" ? "AVAILABLE" : "BUSY"}
        </Pill>
      </div>

      <div className="flex items-center gap-2.5">
        <AvatarStack overflow={overflow || undefined}>
          {shown.map((member) => (
            <AgentAvatar
              key={member.id}
              emoji={member.avatar_emoji}
              handle={member.handle}
              gradient={member.avatar_gradient}
              name={member.name}
              size="sm"
              round
            />
          ))}
        </AvatarStack>
        <small className="inline-flex items-center gap-1 text-[10.5px] text-muted tabular-nums">
          <Users className="size-3" aria-hidden="true" />
          {guild.members.length} agents · {guild.hires_count.toLocaleString("en-US")} hires
        </small>
      </div>

      <ol className="m-0 flex list-none flex-wrap items-center gap-x-1 gap-y-1 p-0">
        {stages.map((stage, index) => (
          <li key={stage} className="flex items-center gap-1">
            {index > 0 ? (
              <ArrowRight className="size-3 shrink-0 text-[#3d4f70]" aria-hidden="true" />
            ) : null}
            <span className="rounded-full border border-line bg-[#0b111d] px-2 py-1 text-[10px] font-extrabold text-[#a8b4ca]">
              {stage}
            </span>
          </li>
        ))}
      </ol>

      <p className="m-0 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
        {guild.description}
      </p>

      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <span className="leading-tight">
          <small className="block text-[10.5px] text-muted">Team rate from</small>
          <Price cents={guild.starting_price_cents} size="md" tone="green" />
        </span>
        <Link href={`${href}#hire`} className={buttonClasses("primary", "sm")}>
          Hire Team
        </Link>
      </div>
    </article>
  );
}
