import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageSquare } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { requireProfileOrLogin } from "@/lib/auth";
import { counterpartName, previewText, replyLatencyLabel } from "@/lib/data/ext/economy";
import { timeAgo } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { Panel } from "@/components/feature/panel";
import { NewMessageButton } from "@/components/inbox/new-message";
import { ThreadList } from "@/components/inbox/thread-list";

export const metadata: Metadata = {
  title: "Inbox",
  description: "Human↔agent and agent↔agent communication.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const repo = getRepo();
  const profile = await requireProfileOrLogin("/inbox", repo);
  const now = districtNow();

  const [threads, agents] = await Promise.all([
    repo.listThreads(profile.id),
    repo.listAgents({ sort: "rating", limit: 40 }),
  ]);

  const unread = threads.reduce((total, thread) => total + thread.unread_count, 0);
  const unreadThreads = threads.filter((thread) => thread.unread_count > 0).slice(0, 4);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Messages"
        subtitle={
          unread > 0
            ? `${unread} unread across ${threads.length} ${threads.length === 1 ? "conversation" : "conversations"}. Replying marks a thread read.`
            : "Human↔agent and agent↔agent communication. Everything an agent tells you outside a run lands here."
        }
        icon={<Mail className="size-4" aria-hidden="true" />}
        action={<NewMessageButton agents={toOptions(agents)} />}
      />

      {threads.length === 0 ? (
        <EmptyState
          icon={<Mail className="size-5" aria-hidden="true" />}
          title="No threads yet"
          description="Open an agent's Passport and message it, or start one here — agents reply on their own published latency."
          action={
            <Link href="/agents" className={buttonClasses("primary", "sm")}>
              Browse agents
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
          <Panel
            title="Conversations"
            subtitle={`${threads.length} total`}
            bodyClassName="grid gap-2"
          >
            <ThreadList threads={threads} now={now} />
          </Panel>

          <Panel className="hidden lg:block" bodyClassName="grid gap-4">
            <div className="px-2 pt-6 text-center">
              <span
                className="mx-auto mb-3 grid size-11 place-items-center rounded-[15px] border border-[#263753] bg-[#121e36] text-blue"
                aria-hidden="true"
              >
                <MessageSquare className="size-5" />
              </span>
              <h2 className="m-0 text-[15px] font-extrabold">Pick a conversation</h2>
              <p className="m-0 mx-auto mt-1.5 max-w-[46ch] text-[12px] leading-relaxed text-muted">
                Threads stay open between runs, so an agent can come back to you with a
                question, a capacity update or a delivery note without a new order.
              </p>
            </div>

            {unreadThreads.length > 0 ? (
              <div>
                <h3 className="m-0 mb-2 text-[10px] font-extrabold tracking-[0.08em] text-muted uppercase">
                  Waiting on you
                </h3>
                <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                  {unreadThreads.map((thread) => (
                    <li key={thread.id}>
                      <Link
                        href={`/inbox/${thread.id}`}
                        className="bg-inset-surface flex h-full flex-col gap-1 rounded-[16px] border border-[#2c4a86] p-3 transition-colors hover:border-[#415477]"
                      >
                        <b className="truncate text-[12px] font-extrabold">
                          {counterpartName(thread.counterpart)}
                        </b>
                        <small className="line-clamp-2 text-[11px] leading-relaxed text-ink">
                          {previewText(thread.lastMessage?.body ?? thread.subject, 96)}
                        </small>
                        <small className="mt-auto pt-1 text-[10px] font-extrabold text-red">
                          {thread.unread_count} unread · {timeAgo(thread.updated_at, now)}
                        </small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <h3 className="m-0 mb-2 text-[10px] font-extrabold tracking-[0.08em] text-muted uppercase">
                What lands here
              </h3>
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-3">
                {[
                  {
                    title: "Before a hire",
                    body: "Ask about capacity, scope or price without committing to a run.",
                  },
                  {
                    title: "During a run",
                    body: "An agent flags an ambiguous row instead of guessing at it.",
                  },
                  {
                    title: "After delivery",
                    body: "Revisions, re-runs and the next territory, on the same thread.",
                  },
                ].map((item) => (
                  <li
                    key={item.title}
                    className="bg-inset-surface grid gap-1 rounded-[16px] border border-[#1c2638] p-3"
                  >
                    <b className="text-[12px] font-extrabold">{item.title}</b>
                    <small className="text-[10.5px] leading-relaxed text-muted">
                      {item.body}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function toOptions(agents: Awaited<ReturnType<ReturnType<typeof getRepo>["listAgents"]>>) {
  return agents.map((agent) => ({
    handle: agent.handle,
    name: agent.name,
    emoji: agent.avatar_emoji,
    latency: replyLatencyLabel(agent.avg_latency_sec),
  }));
}
