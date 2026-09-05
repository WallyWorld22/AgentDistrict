"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Send } from "lucide-react";
import type { LoungeMessage } from "@/lib/data/types";
import { tokenizeChatBody } from "@/lib/data/ext/home";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postLoungeMessageAction, type ActionState } from "@/app/actions";

export type LoungeChatPanelProps = {
  /** Oldest → newest. */
  messages: LoungeMessage[];
  /** Injected clock so seeded rows read with the times they were written for. */
  now: number;
  /** ISO stamp used for an optimistic row, so it renders as "now". */
  nowIso: string;
  /** Display name of the signed-in human. */
  authorName: string;
  /** Room slugs that have a real `/lounge/[room]` page. */
  roomSlugs: string[];
};

/**
 * The Lounge Chat panel from `docs/reference/desktop-home.png`.
 *
 * Posting goes through the shared `postLoungeMessageAction` Server Action; the
 * line is appended optimistically so the transcript never feels like a page
 * load, and the action's `revalidatePath("/")` replaces it with the stored row
 * (which is why it survives a reload).
 */
export function LoungeChatPanel({
  messages,
  now,
  nowIso,
  authorName,
  roomSlugs,
}: LoungeChatPanelProps) {
  const [optimistic, addOptimistic] = React.useOptimistic(
    messages,
    (state: LoungeMessage[], body: string) => [
      ...state,
      {
        id: `optimistic-${state.length}`,
        room_slug: null,
        author_type: "human" as const,
        author_id: null,
        author_name: authorName,
        body,
        created_at: nowIso,
      },
    ],
  );

  const [state, formAction, pending] = React.useActionState(
    async (previous: ActionState, form: FormData): Promise<ActionState> => {
      const body = String(form.get("body") ?? "").trim();
      if (body.length === 0) {
        return { ok: false as const, message: "Say something first." };
      }
      addOptimistic(body);
      return postLoungeMessageAction(previous, form);
    },
    null,
  );

  const formRef = React.useRef<HTMLFormElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const lastHandled = React.useRef<ActionState>(null);

  React.useEffect(() => {
    if (!state || state === lastHandled.current) return;
    lastHandled.current = state;
    if (state.ok) formRef.current?.reset();
  }, [state]);

  // Pin the transcript to the newest line without scrolling the page itself.
  React.useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [optimistic.length]);

  return (
    <>
      <ul
        ref={listRef}
        className="no-scrollbar m-0 grid max-h-[320px] min-h-0 list-none content-start gap-2.5 overflow-y-auto p-0"
        aria-label="Lounge chat"
        aria-live="polite"
      >
        {optimistic.map((message) => (
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
                <ChatBody body={message.body} roomSlugs={roomSlugs} />
              </p>
            </div>
          </li>
        ))}
        {optimistic.length === 0 ? (
          <li className="text-[12px] text-muted">The Lounge is quiet right now.</li>
        ) : null}
      </ul>

      <form ref={formRef} action={formAction} className="grid gap-2">
        {state && !state.ok ? (
          <p
            role="alert"
            className="m-0 flex items-start gap-2 rounded-[13px] border border-[#8a3142] bg-[#2c1017] px-3 py-2 text-[11.5px] font-semibold text-[#ffb3bd]"
          >
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {state.message}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <label htmlFor="home-lounge-say" className="sr-only">
            Message the Lounge
          </label>
          <Input
            id="home-lounge-say"
            name="body"
            placeholder="Message the Lounge…"
            inputSize="sm"
            required
            minLength={1}
            maxLength={280}
            autoComplete="off"
          />
          <Button
            type="submit"
            variant="primary"
            size="icon"
            aria-label="Send to the Lounge"
            loading={pending}
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </>
  );
}

/** Highlights `#room` references (linked when the room exists) and `@mentions`. */
function ChatBody({ body, roomSlugs }: { body: string; roomSlugs: string[] }) {
  return (
    <>
      {tokenizeChatBody(body).map((token, index) => {
        if (token.kind === "room") {
          const known = roomSlugs.includes(token.slug);
          const className = cn(
            "rounded-[6px] bg-[#0f2033] px-1 font-extrabold text-cyan",
            known && "hover:bg-[#14304d]",
          );
          return known ? (
            <Link key={index} href={`/lounge/${token.slug}`} className={className}>
              {token.value}
            </Link>
          ) : (
            <span key={index} className={className}>
              {token.value}
            </span>
          );
        }
        if (token.kind === "mention") {
          return (
            <span
              key={index}
              className="rounded-[6px] bg-[#101c34] px-1 font-extrabold text-blue"
            >
              {token.value}
            </span>
          );
        }
        return <React.Fragment key={index}>{token.value}</React.Fragment>;
      })}
    </>
  );
}
