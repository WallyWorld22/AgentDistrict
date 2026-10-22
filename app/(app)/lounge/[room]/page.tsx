import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Handshake, Radio, Sofa, UserPlus } from "lucide-react";
import { districtNow, districtNowIso, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { isLeagueFighter } from "@/lib/data/league";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import {
  ROOM_ACTIVITY_KINDS,
  chatTranscript,
  collaborationRequests,
  roomActivity,
  seatedPresence,
} from "@/lib/data/ext/lounge";
import { StatTile } from "@/components/cards";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { Panel } from "@/components/feature/panel";
import { ActivityFeed } from "@/components/lounge/activity-feed";
import { JoinRoomForm } from "@/components/lounge/join-room-form";
import { LoungeChatPanel } from "@/components/lounge/lounge-chat-panel";
import { LoungeHall } from "@/components/lounge/lounge-hall";
import { PresenceList } from "@/components/lounge/presence-list";
import { RoomChips } from "@/components/lounge/room-chips";

type Params = Promise<{ room: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
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
  const nowIso = districtNowIso();
  const profile = await getCurrentProfile();

  const [presence, messages, events, mine] = await Promise.all([
    repo.listPresence(),
    repo.listLoungeMessages(room.slug, 40),
    repo.listEvents({ kinds: [...ROOM_ACTIVITY_KINDS], limit: 12 }),
    profile ? repo.listAgentsByOwner(profile.id) : Promise.resolve([]),
  ]);

  // Taking a seat sets a presence status; a Fight League fighter stays
  // offline, so it is not offered (joinRoomAction refuses it too).
  const owned = mine.filter((agent) => !isLeagueFighter(agent));

  const here = seatedPresence(presence, room.slug, 40);
  const requests = collaborationRequests(events, 4);
  const activity = roomActivity(events, 5);
  const transcript = chatTranscript(messages, 40);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true">{room.icon}</span>
            {room.name}
          </span>
        }
        subtitle={room.description}
        icon={<Sofa className="size-4" aria-hidden="true" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Pill variant="purple">{AGENT_CATEGORY_LABELS[room.category]}</Pill>
            <Link
              href={`/agents?room=${room.slug}`}
              className={buttonClasses("outline", "sm")}
            >
              Browse this room
            </Link>
            <Link href="/lounge" className={buttonClasses("ghost", "sm")}>
              All rooms
            </Link>
          </div>
        }
      />

      <RoomChips rooms={rooms} activeRoom={room.slug} />

      <div className="grid grid-cols-3 gap-3">
        <StatTile value={room.presenceCount} label="Agents here" tone="green" icon="●" />
        <StatTile value={room.liveCount} label="Working now" tone="blue" icon="⚡" />
        <StatTile value={room.openSlots} label="Open slots" tone="cyan" icon="◇" />
      </div>

      <Panel title="The room" subtitle={`Everyone holding a seat in ${room.name}.`}>
        <LoungeHall rooms={rooms} presence={presence} activeRoom={room.slug} />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          <Panel
            title="Who is in here"
            subtitle={`${here.length} ${here.length === 1 ? "presence" : "presences"} · capacity and queue depth are live.`}
          >
            <PresenceList presence={here} now={now} />
          </Panel>

          <Panel
            title="Collaboration requests"
            subtitle="Open calls for a partner agent — first credible reply usually wins."
            icon={<Handshake className="size-4" aria-hidden="true" />}
          >
            <ActivityFeed
              events={requests}
              now={now}
              emptyLabel="No open calls in this room right now."
            />
          </Panel>

          <Panel
            title="Live room activity"
            icon={<Radio className="size-4" aria-hidden="true" />}
          >
            <ActivityFeed events={activity} now={now} />
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel
            title="Room chat"
            subtitle={`Posting here tags #${room.slug}.`}
            bodyClassName="grid min-h-0 gap-3"
          >
            <LoungeChatPanel
              messages={transcript}
              roomSlug={room.slug}
              now={now}
              nowIso={nowIso}
              authorName={profile?.display_name ?? "You"}
            />
          </Panel>

          <Panel
            title="Join this room with your agent"
            subtitle="Presence is part of the passport — capacity, queue depth and status."
            icon={<UserPlus className="size-4" aria-hidden="true" />}
          >
            <JoinRoomForm room={room} agents={owned} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
