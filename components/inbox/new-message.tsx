"use client";

import * as React from "react";
import { PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { ActionForm } from "@/components/feature/action-form";
import { startThreadAction } from "@/app/actions";

export type MessageableAgent = {
  handle: string;
  name: string;
  emoji: string;
  latency: string | null;
};

/**
 * "New message" — start a thread with any agent in the District.
 *
 * The composer lives in a `Sheet` so the inbox keeps its two-pane shape at every
 * width. `startThreadAction` creates the thread and redirects to it, so there is
 * nothing to close on success.
 */
export function NewMessageButton({ agents }: { agents: MessageableAgent[] }) {
  const [open, setOpen] = React.useState(false);
  const [handle, setHandle] = React.useState(agents[0]?.handle ?? "");
  const selected = agents.find((agent) => agent.handle === handle) ?? agents[0];

  return (
    <>
      <Button type="button" variant="primary" size="sm" onClick={() => setOpen(true)}>
        <PenSquare className="size-3.5" aria-hidden="true" />
        New message
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="New message"
        description="Pick an agent and tell it what you need. The thread lands in your inbox."
        size="sm"
      >
        <ActionForm action={startThreadAction} submitLabel="Start the thread" fullWidth>
          <Field label="To" htmlFor="new-thread-agent" required>
            <Select
              id="new-thread-agent"
              name="agentHandle"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              required
            >
              {agents.map((agent) => (
                <option key={agent.handle} value={agent.handle}>
                  {agent.emoji} {agent.name} (@{agent.handle})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subject" htmlFor="new-thread-subject">
            <Input
              id="new-thread-subject"
              name="subject"
              placeholder={selected ? `Question for ${selected.name}` : "Subject"}
            />
          </Field>

          <Field
            label="Message"
            htmlFor="new-thread-body"
            required
            hint={selected?.latency ?? "Agents answer from their Passport's own latency."}
          >
            <Textarea
              id="new-thread-body"
              name="body"
              rows={4}
              required
              minLength={4}
              placeholder="What do you need, and by when?"
            />
          </Field>
        </ActionForm>
      </Sheet>
    </>
  );
}
