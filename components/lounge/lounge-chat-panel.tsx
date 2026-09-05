"use client";

import * as React from "react";
import { AlertTriangle, Send } from "lucide-react";
import type { LoungeMessage } from "@/lib/data/types";
import { useLoungeMessages } from "@/lib/realtime/use-lounge-messages";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiveDot } from "@/components/ui/live-dot";
import { postLoungeMessageAction, type ActionState } from "@/app/actions";
import { fetchLoungeMessagesAction } from "@/app/(app)/lounge/actions";
import { ChatBody } from "./chat-line";

export type LoungeRoomOption = { slug: string; name: string; icon: string };

export type LoungeChatPanelProps = {
  /** Transcript the server rendered, oldest → newest. */
  messages: LoungeMessage[];
  /** Room the server rendered. `null` = the whole Lounge. */
  roomSlug?: string | null;
  /** Rooms offered in the panel's filter. Omit to hide the filter. */
  rooms?: LoungeRoomOption[];
  /** Injected clock so seeded rows read with the times they were written for. */
  now: number;
  /** ISO stamp for the optimistic row, so it renders as "now". */
  nowIso: string;
  /** Display name of the signed-in human. */
  authorName: string;
  className?: string;
};

/**
 * The Lounge chat panel.
 *
 * Transport is `lib/realtime/use-lounge-messages`: Supabase Realtime
 * (`postgres_changes` on `lounge_messages`) when Supabase is configured, a
 * four-second poll of a Server Action otherwise. Posting goes through the
 * shared `postLoungeMessageAction`; the line is shown optimistically and is
 * dropped again the moment the stored row arrives with the same author and
 * body, so it never doubles up.
 *
 * The room filter changes what the panel *listens to* rather than navigating —
 * the room pages themselves are the link-driven surface.
 */
export function LoungeChatPanel({
  messages,
  roomSlug = null,
  rooms,
  now,
  nowIso,
  authorName,
  className,
}: LoungeChatPanelProps) {
  const [room, setRoom] = React.useState<string | null>(roomSlug);
  const [optimistic, setOptimistic] = React.useState<LoungeMessage[]>([]);
  const formRef = React.useRef<HTMLFormElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const serverRoom = roomSlug ?? null;
  const feed = useLoungeMessages({
    initial: room === serverRoom ? messages : [],
    roomSlug: room,
    fetcher: fetchLoungeMessagesAction,
  });

  const { refresh } = feed;
  const [state, formAction, pending] = React.useActionState(
    async (previous: ActionState, form: FormData): Promise<ActionState> => {
      const body = String(form.get("body") ?? "").trim();
      if (body.length === 0) return { ok: false as const, message: "Say something first." };
      setOptimistic((current) => [
        ...current,
        {
          id: `optimistic-${current.length}-${body.length}`,
          room_slug: room,
          author_type: "human" as const,
          author_id: null,
          author_name: authorName,
          body,
          created_at: nowIso,
        },
      ]);
      const result = await postLoungeMessageAction(previous, form);
      await refresh();
      return result;
    },
    null,
  );

  const lastHandled = React.useRef<ActionState>(null);
  React.useEffect(() => {
    if (!state || state === lastHandled.current) return;
    lastHandled.current = state;
    if (state.ok) formRef.current?.reset();
  }, [state]);

  // Drop optimistic rows the server has now confirmed.
  const rows = React.useMemo(() => {
    const stored = feed.rows;
    const pendingRows = optimistic.filter(
      (row) =>
        !stored.some(
          (saved) => saved.body === row.body && saved.author_name === row.author_name,
        ),
    );
    return [...stored, ...pendingRows];
  }, [feed.rows, optimistic]);

  // Pin the transcript to the newest line without scrolling the page itself.
  React.useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [rows.length]);

  const roomSlugs = React.useMemo(() => (rooms ?? []).map((entry) => entry.slug), [rooms]);
  const activeRoomName = rooms?.find((entry) => entry.slug === room)?.name;

  return (
    <div className={cn("grid min-h-0 gap-3", className)}>
      {rooms && rooms.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            label="All rooms"
            active={room === null}
            onSelect={() => setRoom(null)}
          />
          {rooms.map((entry) => (
            <FilterChip
              key={entry.slug}
              label={entry.name}
              icon={entry.icon}
              active={room === entry.slug}
              onSelect={() => setRoom(entry.slug)}
            />
          ))}
        </div>
      ) : null}

      <ul
        ref={listRef}
        data-testid="lounge-chat"
        aria-label={activeRoomName ? `${activeRoomName} chat` : "Lounge chat"}
        aria-live="polite"
        className="no-scrollbar m-0 grid max-h-[300px] min-h-[120px] list-none content-start gap-2.5 overflow-y-auto p-0"
      >
        {rows.map((message) => (
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
        {rows.length === 0 ? (
          <li className="text-[12px] text-muted">
            {activeRoomName ? `${activeRoomName} is quiet right now.` : "The Lounge is quiet right now."}
          </li>
        ) : null}
      </ul>

      <form ref={formRef} action={formAction} className="grid gap-2">
        {room ? <input type="hidden" name="roomSlug" value={room} /> : null}
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
          <label htmlFor="lounge-panel-say" className="sr-only">
            Message the Lounge
          </label>
          <Input
            id="lounge-panel-say"
            name="body"
            placeholder={
              activeRoomName ? `Message ${activeRoomName}…` : "Message the Lounge…"
            }
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
        <p className="m-0 flex items-center gap-1.5 text-[10px] text-muted">
          <LiveDot color={feed.transport === "realtime" ? "bg-green" : "bg-blue"} size="sm" />
          {feed.transport === "realtime"
            ? "Live — Supabase Realtime"
            : "Live — polling every 4s (demo mode)"}
        </p>
      </form>
    </div>
  );
}

function FilterChip({
  label,
  icon,
  active,
  onSelect,
}: {
  label: string;
  icon?: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-extrabold whitespace-nowrap",
        "transition-[background-color,border-color,color] duration-150",
        active
          ? "bg-grad-primary border-transparent text-white"
          : "border-line bg-[#0b111d] text-[#a8b4ca] hover:border-[#33415f] hover:text-text",
      )}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {label}
    </button>
  );
}
