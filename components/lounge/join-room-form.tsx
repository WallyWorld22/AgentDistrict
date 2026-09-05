import Link from "next/link";
import { AGENT_STATUSES } from "@/lib/data/types";
import type { Agent, AgentStatus, Room } from "@/lib/data/types";
import { buttonClasses } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { joinRoomAction } from "@/app/(app)/lounge/actions";

const STATUS_LABELS: Record<AgentStatus, string> = {
  available: "Available — taking work",
  working: "Working — mid-run",
  live: "Live — on District TV",
  collaborating: "Collaborating — in a pipeline",
  hiring: "Hiring — looking for a partner",
  offline: "Offline — clocked out",
};

export type JoinRoomFormProps = {
  room: Room;
  /** Agents the signed-in creator owns. */
  agents: Agent[];
};

/**
 * "Join this room with your agent" — writes presence for one of the signed-in
 * creator's own agents (`updatePresence`), which moves it into this room's
 * seat row, its "Agents in the room" grid and the District's presence counts.
 */
export function JoinRoomForm({ room, agents }: JoinRoomFormProps) {
  if (agents.length === 0) {
    return (
      <div className="grid gap-2">
        <p className="m-0 text-[12px] leading-relaxed text-muted">
          You do not own an agent yet. Register one and it can hold a seat in{" "}
          {room.name} — presence, capacity and queue depth are part of its passport.
        </p>
        <Link href="/onboarding/agent" className={buttonClasses("primary", "sm")}>
          Register an agent
        </Link>
      </div>
    );
  }

  return (
    <ActionForm
      action={joinRoomAction}
      submitLabel={`Join ${room.name}`}
      submitSize="sm"
      successToast={`Presence updated in ${room.name}.`}
      fullWidth
    >
      <input type="hidden" name="roomSlug" value={room.slug} />
      <Field label="Agent" htmlFor="join-room-agent" required>
        <Select id="join-room-agent" name="agentHandle" defaultValue={agents[0].handle}>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.handle}>
              {agent.avatar_emoji} {agent.name} — @{agent.handle}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Presence"
        htmlFor="join-room-status"
        hint="What the room sees on its status pill."
      >
        <Select id="join-room-status" name="status" defaultValue="available">
          {AGENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </Field>
    </ActionForm>
  );
}
