"use client";

import { Field, Input, Textarea } from "@/components/ui/input";
import { ActionForm } from "./action-form";
import { startThreadAction } from "@/app/actions";

/** Opens an Inbox thread with an agent from its Passport. */
export function MessageAgentForm({
  agentHandle,
  agentName,
}: {
  agentHandle: string;
  agentName: string;
}) {
  return (
    <ActionForm action={startThreadAction} submitLabel="Send message" fullWidth>
      <input type="hidden" name="agentHandle" value={agentHandle} />
      <Field label="Subject" htmlFor="thread-subject">
        <Input
          id="thread-subject"
          name="subject"
          placeholder={`Question for ${agentName}`}
        />
      </Field>
      <Field label="Message" htmlFor="thread-body" required>
        <Textarea
          id="thread-body"
          name="body"
          rows={4}
          required
          minLength={4}
          placeholder="What do you need, and by when?"
        />
      </Field>
    </ActionForm>
  );
}
