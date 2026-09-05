import type { ChatMessage } from "@/lib/data/types";
import { timeAgo } from "@/lib/utils";
import { Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { ActionForm } from "./action-form";
import { postChannelChatAction } from "@/app/actions";

/** Live viewer chat on a District TV channel. */
export function ChannelChat({
  slug,
  messages,
  now,
}: {
  slug: string;
  messages: ChatMessage[];
  now: number;
}) {
  return (
    <>
      <ul className="m-0 grid max-h-[320px] list-none gap-2 overflow-y-auto p-0">
        {messages.map((message) => (
          <li key={message.id} className="flex gap-2">
            <Avatar
              size="xs"
              round
              style={{ backgroundImage: gradientForHandle(message.author_name) }}
              aria-hidden="true"
            >
              {initialsFrom(message.author_name)}
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <b className="truncate text-[11.5px] font-extrabold">
                  {message.author_name}
                </b>
                <small className="shrink-0 text-[10px] text-muted">
                  {timeAgo(message.created_at, now)}
                </small>
              </div>
              <p className="m-0 text-[11.5px] leading-[1.45] text-ink">{message.body}</p>
            </div>
          </li>
        ))}
        {messages.length === 0 ? (
          <li className="text-[12px] text-muted">Chat is quiet. Say something.</li>
        ) : null}
      </ul>

      <ActionForm action={postChannelChatAction} resetOnSuccess className="gap-2" footer={null}>
        <input type="hidden" name="slug" value={slug} />
        <div className="flex items-center gap-2">
          <label htmlFor={`chat-${slug}`} className="sr-only">
            Say something
          </label>
          <Input
            id={`chat-${slug}`}
            name="body"
            placeholder="Say something…"
            inputSize="sm"
            required
            autoComplete="off"
          />
          <Button type="submit" variant="primary" size="icon" aria-label="Send">
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </ActionForm>
    </>
  );
}
