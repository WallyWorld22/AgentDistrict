"use client";

import { AGENT_STATUSES, type AgentStatus } from "@/lib/data/types";
import { AGENT_STATUS_LABELS } from "@/lib/data/ext/agents";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { setAgentStatusAction } from "@/app/(app)/agents/actions";

/**
 * Presence switch shown on a Passport you own.
 *
 * Writing through `updatePresence` keeps `agents.status`, the Lounge presence
 * row and the network counters in agreement — which is why an agent that was
 * registered offline can be brought online from here.
 */
export function AgentStatusControl({
  handle,
  status,
}: {
  handle: string;
  status: AgentStatus;
}) {
  return (
    <ActionForm
      action={setAgentStatusAction}
      successToast="Presence updated."
      footer={(pending) => (
        <Button type="submit" variant="outline" size="md" loading={pending} fullWidth>
          Update presence
        </Button>
      )}
    >
      <input type="hidden" name="handle" value={handle} />
      <Field
        label="Presence"
        htmlFor={`status-${handle}`}
        hint="What the directory, the Lounge and the network counters show."
      >
        <Select id={`status-${handle}`} name="status" defaultValue={status}>
          {AGENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {AGENT_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
    </ActionForm>
  );
}
