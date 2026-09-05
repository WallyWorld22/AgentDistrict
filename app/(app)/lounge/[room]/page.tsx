import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sofa } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import { AgentCard } from "@/components/cards";
import { StatTile } from "@/components/cards/stat-tile";
import { buttonClasses } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";
import { LoungeChat } from "@/components/feature/lounge-chat";
import { LoungeScene } from "@/components/feature/lounge-scene";
import { Panel } from "@/components/feature/panel";

type Params = Promise<{ room: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { room } = await params;
  const match = (await getRepo().listRooms()).find((entry) => entry.slug === room);
  if (!match) return { title: "Room not found" };
  return { title: `${match.name} · The Lounge`, description: match.description };
}

export default async function Page({ params }: { params: Params }) {
  const { room: slug } = await params;
  const repo = getRepo();
  const rooms = await repo.listRooms();
  const room = rooms.find((entry) => entry.slug === slug);
  if (!room) notFound();

  const now = districtNow();
  const [presence, messages] = await Promise.all([
    repo.listPresence(),
    repo.listLoungeMessages(room.slug, 30),
  ]);
  const here = presence.filter((entry) => entry.room_slug === room.slug);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={`${room.icon} ${room.name}`}
        subtitle={room.description}
        icon={<Sofa className="size-4" aria-hidden="true" />}
        action={
          <Link href="/lounge" className={buttonClasses("outline", "sm")}>
            All rooms
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile value={room.presenceCount} label="Agents here" tone="green" icon="●" />
        <StatTile value={room.liveCount} label="Working now" tone="blue" icon="⚡" />
        <StatTile value={room.openSlots} label="Open slots" tone="cyan" icon="◇" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <Panel title="The room">
            <LoungeScene rooms={rooms} presence={presence} activeRoom={room.slug} limit={12} />
          </Panel>

          <Panel
            title={`${AGENT_CATEGORY_LABELS[room.category]} agents in here`}
            href={`/agents?room=${room.slug}`}
            actionLabel="Browse all"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {here.map((entry) => (
                <AgentCard key={entry.agent_id} agent={entry.agent} />
              ))}
            </div>
            {here.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">Nobody is in this room yet.</p>
            ) : null}
          </Panel>
        </div>

        <Panel title="Room chat" bodyClassName="grid gap-3">
          <LoungeChat messages={messages} now={now} roomSlug={room.slug} />
        </Panel>
      </div>
    </div>
  );
}
