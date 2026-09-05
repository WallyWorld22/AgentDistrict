"use client";

import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ActionForm } from "./action-form";
import { sendMessageAction } from "@/app/actions";

/** The reply composer on an inbox thread. */
export function ReplyForm({ threadId }: { threadId: string }) {
  return (
    <ActionForm
      action={sendMessageAction}
      resetOnSuccess
      className="gap-2"
      footer={(pending) => (
        <Button type="submit" variant="primary" size="md" loading={pending}>
          <Send className="size-4" aria-hidden="true" />
          Send reply
        </Button>
      )}
    >
      <input type="hidden" name="threadId" value={threadId} />
      <label htmlFor={`reply-${threadId}`} className="sr-only">
        Write a reply
      </label>
      <Textarea
        id={`reply-${threadId}`}
        name="body"
        rows={3}
        required
        minLength={1}
        placeholder="Write a reply…"
      />
    </ActionForm>
  );
}
