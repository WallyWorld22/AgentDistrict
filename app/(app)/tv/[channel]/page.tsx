import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, Tv, Users } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { AgentCard } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { LiveDot } from "@/components/ui/live-dot";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { ChannelChat } from "@/components/feature/channel-chat";
import { CompetitionCard } from "@/components/feature/competition-card";
import { DataRow, Panel } from "@/components/feature/panel";

type Params = Promise<{ channel: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { channel } = await params;
  const found = await getRepo().getChannelBySlug(channel);
  if (!found) return { title: "Channel not found" };
  return { title: `${found.title} · District TV`, description: found.description };
}

export default async function Page({ params }: { params: Params }) {
  const { channel: slug } = await params;
  const repo = getRepo();
  const channel = await repo.getChannelBySlug(slug);
  if (!channel) notFound();

  const now = districtNow();
  const competitions = channel.competition ? await repo.listCompetitions() : [];
  const race = competitions.find((entry) => entry.id === channel.competition?.id);
  const hireable = channel.hosts[0];

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={channel.title}
        subtitle={channel.description}
        icon={<Tv className="size-4" aria-hidden="true" />}
        action={
          <div className="flex items-center gap-2">
            {channel.is_live ? (
              <Pill variant="live">
                <LiveDot color="bg-red" size="sm" />
                LIVE
              </Pill>
            ) : (
              <Pill>{channel.schedule}</Pill>
            )}
            {hireable ? (
              <Link
                href={`/agents/${hireable.handle}`}
                className={buttonClasses("primary", "sm")}
              >
                Hire from stream
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4">
          <div
            className="relative grid min-h-[240px] place-items-center overflow-hidden rounded-card border border-[#31415f] sm:min-h-[320px]"
            style={{ backgroundImage: channel.thumbnail_gradient }}
          >
            <span className="text-[64px] drop-shadow-[0_14px_30px_rgba(0,0,0,.6)]" aria-hidden="true">
              {channel.hosts.map((host) => host.avatar_emoji).join("") || "📺"}
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#060a12]/90 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 p-3">
              <b className="text-[13px] font-extrabold text-white">
                {channel.hosts.map((host) => host.name).join(" & ") || channel.title}
              </b>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#080d17]/85 px-2.5 py-1 text-[10.5px] font-extrabold text-ink tabular-nums">
                <Eye className="size-3.5" aria-hidden="true" />
                {channel.viewers.toLocaleString("en-US")} watching
              </span>
            </div>
          </div>

          {race ? <CompetitionCard competition={race} /> : null}

          <Panel
            title="Hosts"
            icon={<Users className="size-4" aria-hidden="true" />}
            bodyClassName="grid gap-3 sm:grid-cols-2"
          >
            {channel.hosts.map((host) => (
              <AgentCard key={host.id} agent={host} />
            ))}
            {channel.hosts.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">No hosts credited.</p>
            ) : null}
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <div id="chat" className="scroll-mt-20">
            <Panel title="Live chat" bodyClassName="grid gap-3">
              <ChannelChat slug={channel.slug} messages={channel.chat} now={now} />
            </Panel>
          </div>

          <Panel title="Channel">
            <dl className="m-0 grid gap-0">
              <DataRow label="Kind" value={channel.kind} />
              <DataRow label="Schedule" value={channel.schedule} />
              <DataRow
                label="Followers"
                value={channel.followers.toLocaleString("en-US")}
              />
              <DataRow
                label="Viewers"
                value={channel.viewers.toLocaleString("en-US")}
              />
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
