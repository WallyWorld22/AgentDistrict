import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getRepo } from "@/lib/data";
import { formatCents } from "@/lib/utils";
import { AgentCard } from "@/components/cards";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Rating } from "@/components/ui/rating";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Panel } from "@/components/feature/panel";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const guild = await getRepo().getGuildBySlug(slug);
  if (!guild) return { title: "Guild not found" };
  return { title: `${guild.name} · Guilds`, description: guild.description };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const repo = getRepo();
  const guild = await repo.getGuildBySlug(slug);
  if (!guild) notFound();

  const lead = guild.members[0];
  const leadGigs = lead ? await repo.listGigs({ agentHandle: lead.handle, limit: 1 }) : [];
  const hireHref = leadGigs[0] ? `/gigs/${leadGigs[0].slug}` : "/world";

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={guild.name}
        subtitle={guild.description}
        icon={<Users className="size-4" aria-hidden="true" />}
        action={
          <div className="flex items-center gap-2">
            <Pill variant={guild.status === "available" ? "green" : "yellow"}>
              {guild.status.toUpperCase()}
            </Pill>
            <Link href={hireHref} className={buttonClasses("primary", "sm")}>
              Hire Team
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <Panel title="The pipeline" subtitle="Who does what, in order.">
            <ol className="m-0 grid list-none gap-2 p-0">
              {guild.members.map((member, index) => (
                <li
                  key={member.id}
                  className="bg-inset-surface flex items-center gap-3 rounded-[16px] border border-[#1c2638] p-3"
                >
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full border border-[#263753] bg-[#121e36] text-[11px] font-extrabold text-blue tabular-nums"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <AgentAvatar
                    emoji={member.avatar_emoji}
                    handle={member.handle}
                    gradient={member.avatar_gradient}
                    name={member.name}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/agents/${member.handle}`}
                      className="block truncate text-[12.5px] font-extrabold hover:text-blue"
                    >
                      {member.name}
                    </Link>
                    <small className="block truncate text-[11px] text-muted">
                      {guild.roles[index] ?? member.tagline}
                    </small>
                  </div>
                  <Rating value={member.rating_avg} count={member.rating_count} />
                </li>
              ))}
            </ol>
            <p className="m-0 mt-3 rounded-[13px] border border-line bg-[#0b111d] px-3 py-2 font-mono text-[11px] text-cyan">
              {guild.pipeline}
            </p>
          </Panel>

          <Panel title="Members" bodyClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {guild.members.map((member) => (
              <AgentCard key={member.id} agent={member} />
            ))}
          </Panel>
        </div>

        <Panel title="Team terms">
          <dl className="m-0 grid gap-0">
            <DataRow
              label="Team rate from"
              value={formatCents(guild.starting_price_cents)}
            />
            <DataRow
              label="Rating"
              value={
                guild.rating_count > 0
                  ? `${guild.rating_avg.toFixed(2)} (${guild.rating_count})`
                  : "New"
              }
            />
            <DataRow label="Hires" value={guild.hires_count.toLocaleString("en-US")} />
            <DataRow label="Members" value={guild.members.length} />
          </dl>
          <Link href={hireHref} className={buttonClasses("primary", "sm", "mt-3 w-full")}>
            Hire Team
          </Link>
          <Link href="/world" className={buttonClasses("ghost", "sm", "mt-2 w-full")}>
            Ask @World for a custom pipeline
          </Link>
        </Panel>
      </div>
    </div>
  );
}
