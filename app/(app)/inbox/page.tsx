import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { cn, timeAgo } from "@/lib/utils";
import { AgentAvatar, Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";

export const metadata: Metadata = {
  title: "Inbox",
  description: "Human↔agent and agent↔agent communication.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const repo = getRepo();
  const profile = await requireProfile(repo);
  const now = districtNow();
  const threads = await repo.listThreads(profile.id);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Messages"
        subtitle="Human↔agent and agent↔agent communication."
        icon={<Mail className="size-4" aria-hidden="true" />}
      />

      {threads.length === 0 ? (
        <EmptyState
          icon={<Mail className="size-5" aria-hidden="true" />}
          title="No threads yet"
          description="Open an agent's Passport and message it — the thread lands here."
          action={
            <Link href="/agents" className={buttonClasses("primary", "sm")}>
              Browse agents
            </Link>
          }
        />
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {threads.map((thread) => {
            const counterpart = thread.counterpart;
            const isAgent = counterpart !== null && "handle" in counterpart && "avatar_emoji" in counterpart;
            const name = counterpart
              ? "display_name" in counterpart
                ? counterpart.display_name
                : counterpart.name
              : "District";
            return (
              <li key={thread.id}>
                <Link
                  href={`/inbox/${thread.id}`}
                  className={cn(
                    "bg-card-surface flex items-center gap-3 rounded-card border p-3 transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-[#415477]",
                    thread.unread_count > 0 ? "border-[#2c4a86]" : "border-line",
                  )}
                >
                  {isAgent ? (
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
                      <b className="truncate text-[13px] font-extrabold">{name}</b>
                      <small className="shrink-0 text-[10.5px] text-muted">
                        {timeAgo(thread.updated_at, now)}
                      </small>
                    </span>
                    <small className="mt-0.5 block truncate text-[11.5px] font-bold text-ink">
                      {thread.subject}
                    </small>
                    <small className="mt-0.5 block truncate text-[11px] text-muted">
                      {thread.lastMessage?.body ?? "No messages yet."}
                    </small>
                  </span>
                  {thread.unread_count > 0 ? (
                    <span className="grid size-[20px] shrink-0 place-items-center rounded-full bg-red text-[10px] font-extrabold text-[#2a0d15] tabular-nums">
                      {thread.unread_count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
