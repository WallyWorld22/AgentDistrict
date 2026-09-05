import Link from "next/link";
import type { ThreadListItem } from "@/lib/data/types";
import { counterpartName, isAgentCounterpart, previewText } from "@/lib/data/ext/economy";
import { cn, timeAgo } from "@/lib/utils";
import { AgentAvatar, Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";

/**
 * The conversation rail.
 *
 * Rendered on both `/inbox` and `/inbox/[thread]` so the desktop layout is a
 * real two-pane inbox; below `lg` the rail is the whole of `/inbox` and the
 * thread page hides it, which is the mobile pattern in
 * docs/reference/mobile-screens.png.
 */
export function ThreadList({
  threads,
  activeId,
  now,
}: {
  threads: ThreadListItem[];
  activeId?: string;
  now: number;
}) {
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {threads.map((thread) => {
        const counterpart = thread.counterpart;
        const name = counterpartName(counterpart);
        const active = thread.id === activeId;
        const unread = thread.unread_count > 0;

        return (
          <li key={thread.id}>
            <Link
              href={`/inbox/${thread.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-[16px] border p-2.5 transition-[border-color,background-color]",
                active
                  ? "border-[#3a72c4] bg-[#101c33]"
                  : unread
                    ? "bg-inset-surface border-[#2c4a86] hover:border-[#415477]"
                    : "bg-inset-surface border-[#1c2638] hover:border-[#33415f]",
              )}
            >
              {isAgentCounterpart(counterpart) ? (
                <AgentAvatar
                  emoji={counterpart.avatar_emoji}
                  handle={counterpart.handle}
                  gradient={counterpart.avatar_gradient}
                  name={name}
                  size="md"
                />
              ) : (
                <Avatar
                  size="md"
                  style={{ backgroundImage: gradientForHandle(name) }}
                  aria-hidden="true"
                >
                  {initialsFrom(name)}
                </Avatar>
              )}

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <b
                    className={cn(
                      "truncate text-[12.5px] font-extrabold",
                      unread ? "text-text" : "text-ink",
                    )}
                  >
                    {name}
                  </b>
                  <small className="shrink-0 text-[10px] text-muted">
                    {timeAgo(thread.updated_at, now)}
                  </small>
                </span>
                <small className="mt-0.5 block truncate text-[11px] font-bold text-ink">
                  {previewText(thread.subject, 42)}
                </small>
                <small className="mt-0.5 block truncate text-[10.5px] text-muted">
                  {thread.lastMessage
                    ? previewText(thread.lastMessage.body)
                    : "No messages yet."}
                </small>
              </span>

              {unread ? (
                <span
                  className="grid size-[20px] shrink-0 place-items-center rounded-full bg-red text-[10px] font-extrabold text-[#2a0d15] tabular-nums"
                  aria-label={`${thread.unread_count} unread`}
                >
                  {thread.unread_count}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
      {threads.length === 0 ? (
        <li className="px-1 py-2 text-[11.5px] text-muted">No conversations yet.</li>
      ) : null}
    </ul>
  );
}
