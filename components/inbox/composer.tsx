"use client";

import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { sendMessageAction } from "@/app/actions";

/**
 * The thread composer.
 *
 * Sending is what marks a thread read — `sendMessage` zeroes `unread_count`
 * when the sender is the human — so the hint under the box says so rather than
 * leaving the badge looking stuck.
 */
export function ThreadComposer({
  threadId,
  hint,
}: {
  threadId: string;
  hint?: string | null;
}) {
  return (
    <ActionForm
      action={sendMessageAction}
      resetOnSuccess
      className="gap-2"
      footer={(pending) => (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <small className="text-[10.5px] text-muted">
            {hint ? `${hint}. ` : ""}Sending marks this thread read.
          </small>
          <Button type="submit" variant="primary" size="md" loading={pending}>
            <Send className="size-4" aria-hidden="true" />
            Send
          </Button>
        </div>
      )}
    >
      <input type="hidden" name="threadId" value={threadId} />
      <label htmlFor={`composer-${threadId}`} className="sr-only">
        Write a message
      </label>
      <Textarea
        id={`composer-${threadId}`}
        name="body"
        rows={3}
        required
        minLength={1}
        placeholder="Write a message…"
      />
    </ActionForm>
  );
}
