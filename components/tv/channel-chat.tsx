"use client";

import * as React from "react";
import { AlertTriangle, Send } from "lucide-react";
import type { ChatMessage } from "@/lib/data/types";
import { ambientChatLine } from "@/lib/data/ext/lounge";
import { useChannelChat } from "@/lib/realtime/use-channel-chat";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiveDot } from "@/components/ui/live-dot";
import { postChannelChatAction, type ActionState } from "@/app/actions";
import { fetchChannelChatAction } from "@/app/(app)/tv/actions";

export type ChannelChatProps = {
  slug: string;
  channelId: string;
  /** Seeded transcript, oldest → newest. */
  messages: ChatMessage[];
  now: number;
  nowIso: string;
  authorName: string;
  /** Only a live channel gets rotating viewer chatter. */
  isLive: boolean;
  className?: string;
};

/** How often an ambient viewer line drops into a live channel. */
const AMBIENT_MS = 7000;
const AMBIENT_MAX = 8;

/** What an ambient line is, for its tag's tooltip and screen readers. */
const AMBIENT_NOTE =
  "Ambient line — generated in your browser to keep a live room company. Nobody posted it, it is not stored, and other viewers see their own.";

/** A transcript row, and whether this browser made it up. */
type ChatRow = ChatMessage & { ambient?: true };

/**
 * District TV live chat.
 *
 * Real lines come through `lib/realtime/use-channel-chat` — Supabase Realtime
 * on `channel_chat` when configured, a four-second poll of a Server Action in
 * demo mode. On a **live** channel the room also fills with viewer chatter: a
 * deterministic rotation (`ambientChatLine(slug, tick)`), advanced by a timer
 * rather than picked at random, so the server render and the first client
 * render always agree and screenshots stay stable.
 *
 * That chatter is scenery, and it is labelled as scenery: each ambient line
 * wears an "ambient" tag (and `data-ambient`) in place of a timestamp and is
 * set in a quieter style, and the footer says the room is a mix — posted
 * lines over the transport it names, ambient lines from this browser.
 */
export function ChannelChat({
  slug,
  channelId,
  messages,
  now,
  nowIso,
  authorName,
  isLive,
  className,
}: ChannelChatProps) {
  const feed = useChannelChat({
    initial: messages,
    slug,
    channelId,
    fetcher: fetchChannelChatAction,
  });

  const [tick, setTick] = React.useState(0);
  const [optimistic, setOptimistic] = React.useState<ChatMessage[]>([]);
  const listRef = React.useRef<HTMLUListElement>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(() => {
      setTick((value) => (value >= AMBIENT_MAX ? value : value + 1));
    }, AMBIENT_MS);
    return () => clearInterval(timer);
  }, [isLive]);

  const { refresh } = feed;
  const [state, formAction, pending] = React.useActionState(
    async (previous: ActionState, form: FormData): Promise<ActionState> => {
      const body = String(form.get("body") ?? "").trim();
      if (body.length === 0) return { ok: false as const, message: "Say something first." };
      setOptimistic((current) => [
        ...current,
        {
          id: `optimistic-${current.length}-${body.length}`,
          channel_id: channelId,
          author_name: authorName,
          body,
          created_at: nowIso,
        },
      ]);
      const result = await postChannelChatAction(previous, form);
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

  const ambient = React.useMemo(
    () =>
      Array.from({ length: tick }, (_, index) => {
        const line = ambientChatLine(slug, index);
        return {
          id: `ambient-${slug}-${index}`,
          channel_id: channelId,
          author_name: line.author,
          body: line.body,
          created_at: nowIso,
          ambient: true,
        } satisfies ChatRow;
      }),
    [tick, slug, channelId, nowIso],
  );

  const rows = React.useMemo((): ChatRow[] => {
    const stored = feed.rows;
    const pendingRows = optimistic.filter(
      (row) =>
        !stored.some(
          (saved) => saved.body === row.body && saved.author_name === row.author_name,
        ),
    );
    return [...stored, ...ambient, ...pendingRows];
  }, [feed.rows, ambient, optimistic]);

  React.useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [rows.length]);

  return (
    <div className={cn("grid min-h-0 gap-3", className)}>
      <ul
        ref={listRef}
        data-testid="channel-chat"
        aria-label="Live chat"
        aria-live="polite"
        className="no-scrollbar m-0 grid max-h-[340px] min-h-[160px] list-none content-start gap-2 overflow-y-auto p-0"
      >
        {rows.map((message) => (
          <li
            key={message.id}
            data-ambient={message.ambient ? "true" : undefined}
            className={cn("flex gap-2", message.ambient && "opacity-75")}
          >
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
                <b
                  className={cn(
                    "truncate text-[11.5px]",
                    message.ambient ? "font-semibold text-muted" : "font-extrabold",
                  )}
                >
                  {message.author_name}
                </b>
                {message.ambient ? (
                  <AmbientTag />
                ) : (
                  <small className="shrink-0 text-[10px] text-muted">
                    {timeAgo(message.created_at, now)}
                  </small>
                )}
              </div>
              <p
                className={cn(
                  "m-0 text-[11.5px] leading-[1.45]",
                  message.ambient ? "text-muted italic" : "text-ink",
                )}
              >
                {message.body}
              </p>
            </div>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="text-[12px] text-muted">Chat is quiet. Say something.</li>
        ) : null}
      </ul>

      <form ref={formRef} action={formAction} className="grid gap-2">
        <input type="hidden" name="slug" value={slug} />
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
          <label htmlFor={`tv-say-${slug}`} className="sr-only">
            Say something
          </label>
          <Input
            id={`tv-say-${slug}`}
            name="body"
            placeholder="Say something…"
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
            aria-label="Send to chat"
            loading={pending}
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <p
          data-testid="chat-transport"
          className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted"
        >
          <LiveDot color={feed.transport === "realtime" ? "bg-green" : "bg-blue"} size="sm" />
          <span>
            {feed.transport === "realtime"
              ? "Posted lines: live over Supabase Realtime"
              : "Posted lines: polling every 4s (demo mode)"}
          </span>
        </p>
        {/* Only a live channel rotates ambient lines in, so only a live
            channel's footer has a mix to own up to. */}
        {isLive ? (
          <p data-testid="chat-ambient-note" className="m-0 text-[10px] text-muted">
            Lines tagged <AmbientTag described={false} /> are generated in your browser,
            not posted by viewers.
          </p>
        ) : null}
      </form>
    </div>
  );
}

/**
 * The tag an ambient line wears instead of a timestamp. `described` adds the
 * full note for screen readers — off in the footer, which already says it.
 */
function AmbientTag({ described = true }: { described?: boolean }) {
  return (
    <small
      title={AMBIENT_NOTE}
      className="shrink-0 rounded-full border border-[#26324b] bg-[#0c1321] px-1.5 py-px text-[9px] font-extrabold tracking-[0.06em] text-[#8f9bb3] uppercase not-italic"
    >
      ambient
      {described ? <span className="sr-only"> — {AMBIENT_NOTE}</span> : null}
    </small>
  );
}
