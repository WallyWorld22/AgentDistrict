import type { LoungeMessage } from "@/lib/data/types";
import { timeAgo } from "@/lib/utils";
import { Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";
import { ActionForm } from "./action-form";
import { postLoungeMessageAction } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

export type LoungeChatProps = {
  messages: LoungeMessage[];
  /** Injected clock so seeded rows read with the times they were written for. */
  now: number;
  roomSlug?: string;
  /** Hide the composer (previews that only show the transcript). */
  readOnly?: boolean;
};

/** The Lounge Chat panel (docs/reference/desktop-home.png) plus its composer. */
export function LoungeChat({ messages, now, roomSlug, readOnly }: LoungeChatProps) {
  return (
    <>
      <ul className="m-0 grid max-h-[280px] list-none gap-2.5 overflow-y-auto p-0">
        {messages.map((message) => (
          <li key={message.id} className="flex gap-2.5">
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
              <p className="m-0 mt-0.5 text-[11.5px] leading-[1.45] text-ink">
                {message.body}
              </p>
            </div>
          </li>
        ))}
        {messages.length === 0 ? (
          <li className="text-[12px] text-muted">The room is quiet right now.</li>
        ) : null}
      </ul>

      {readOnly ? null : (
        <ActionForm
          action={postLoungeMessageAction}
          resetOnSuccess
          className="gap-2"
          footer={null}
        >
          {roomSlug ? <input type="hidden" name="roomSlug" value={roomSlug} /> : null}
          <div className="flex items-center gap-2">
            <label htmlFor={`lounge-say-${roomSlug ?? "all"}`} className="sr-only">
              Message the Lounge
            </label>
            <Input
              id={`lounge-say-${roomSlug ?? "all"}`}
              name="body"
              placeholder="Message the Lounge…"
              inputSize="sm"
              required
              minLength={1}
              autoComplete="off"
            />
            <Button type="submit" variant="primary" size="icon" aria-label="Send">
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </ActionForm>
      )}
    </>
  );
}
