import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Timer } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import {
  counterpartName,
  isAgentCounterpart,
  replyLatencyLabel,
} from "@/lib/data/ext/economy";
import { cn, timeAgo } from "@/lib/utils";
import { AgentAvatar, Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel } from "@/components/feature/panel";
import { ThreadComposer } from "@/components/inbox/composer";
import { ThreadList } from "@/components/inbox/thread-list";

type Params = Promise<{ thread: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { thread } = await params;
  const found = await getRepo().getThread(thread);
  if (!found) return { title: "Thread not found" };
  return { title: `${found.subject} · Inbox` };
}

export default async function Page({ params }: { params: Params }) {
  const { thread: id } = await params;
  const repo = getRepo();
  const thread = await repo.getThread(id);
  if (!thread) notFound();

  const now = districtNow();
  const profile = await getCurrentProfile(repo);
  const threads = profile ? await repo.listThreads(profile.id) : [];

  const counterpart = thread.counterpart;
  const agent = isAgentCounterpart(counterpart) ? counterpart : null;
  const name = counterpartName(counterpart);
  const latency = agent ? replyLatencyLabel(agent.avg_latency_sec) : null;
  const unread = Math.min(thread.unread_count, thread.messages.length);
  const firstUnreadIndex = unread > 0 ? thread.messages.length - unread : -1;

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={thread.subject}
        subtitle={`With ${name}${latency ? ` · ${latency}` : ""}`}
        icon={<Mail className="size-4" aria-hidden="true" />}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/inbox" className={buttonClasses("ghost", "sm")}>
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              All threads
            </Link>
            {agent ? (
              <Link
                href={`/agents/${agent.handle}`}
                className={buttonClasses("outline", "sm")}
              >
                View Passport
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
        <Panel
          title="Conversations"
          subtitle={`${threads.length} total`}
          className="hidden lg:block"
          bodyClassName="grid gap-2"
        >
          <ThreadList threads={threads} activeId={thread.id} now={now} />
        </Panel>

        <div className="grid gap-4">
          <Panel bodyClassName="grid gap-3">
            <div className="flex flex-wrap items-center gap-3 border-b border-[#161f30] pb-3">
              {agent ? (
                <AgentAvatar
                  emoji={agent.avatar_emoji}
                  handle={agent.handle}
                  gradient={agent.avatar_gradient}
                  name={name}
                  size="md"
                  status={agent.status}
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
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[13px] font-extrabold">{name}</b>
                  {agent ? <StatusPill status={agent.status} size="sm" /> : null}
                  {unread > 0 ? (
                    <Pill variant="red" size="sm">
                      {unread} new
                    </Pill>
                  ) : null}
                </div>
                <small className="mt-0.5 block truncate text-[11px] text-muted">
                  {agent ? agent.tagline : "District participant"}
                </small>
              </div>
              {latency ? (
                <small className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[#0b111d] px-2.5 py-1 text-[10.5px] font-bold text-[#a8b4ca]">
                  <Timer className="size-3" aria-hidden="true" />
                  {latency}
                </small>
              ) : null}
            </div>

            <ul className="m-0 grid list-none gap-2.5 p-0">
              {thread.messages.map((message, index) => {
                const mine = message.sender_id === profile?.id;
                return (
                  <li key={message.id} className="grid gap-2.5">
                    {index === firstUnreadIndex ? (
                      <div className="flex items-center gap-2" role="separator">
                        <span className="h-px flex-1 bg-[#3a1c26]" />
                        <span className="text-[9.5px] font-extrabold tracking-[0.1em] text-red uppercase">
                          {unread} new
                        </span>
                        <span className="h-px flex-1 bg-[#3a1c26]" />
                      </div>
                    ) : null}
                    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[min(560px,86%)] rounded-[16px] border px-3 py-2",
                          mine
                            ? "border-[#2c4a86] bg-[#111c33]"
                            : "border-[#1c2638] bg-[#0c1321]",
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <b className="text-[11px] font-extrabold">{message.sender_name}</b>
                          <small className="text-[10px] text-muted">
                            {timeAgo(message.created_at, now)}
                          </small>
                        </div>
                        <p className="m-0 mt-1 text-[12.5px] leading-relaxed whitespace-pre-line text-ink">
                          {message.body}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
              {thread.messages.length === 0 ? (
                <li className="text-[12px] text-muted">No messages yet.</li>
              ) : null}
            </ul>

            <ThreadComposer threadId={thread.id} hint={latency} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
