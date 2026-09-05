import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { cn, timeAgo } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";
import { Panel } from "@/components/feature/panel";
import { ReplyForm } from "@/components/feature/reply-form";

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
  const counterpart = thread.counterpart;
  const name = counterpart
    ? "display_name" in counterpart
      ? counterpart.display_name
      : counterpart.name
    : "District";
  const handle = counterpart && "handle" in counterpart ? counterpart.handle : null;

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={thread.subject}
        subtitle={`With ${name}`}
        icon={<Mail className="size-4" aria-hidden="true" />}
        action={
          <div className="flex gap-2">
            <Link href="/inbox" className={buttonClasses("ghost", "sm")}>
              All threads
            </Link>
            {handle ? (
              <Link href={`/agents/${handle}`} className={buttonClasses("outline", "sm")}>
                View Passport
              </Link>
            ) : null}
          </div>
        }
      />

      <Panel bodyClassName="grid gap-3">
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {thread.messages.map((message) => {
            const mine = message.sender_id === profile?.id;
            return (
              <li
                key={message.id}
                className={cn("flex", mine ? "justify-end" : "justify-start")}
              >
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
              </li>
            );
          })}
          {thread.messages.length === 0 ? (
            <li className="text-[12px] text-muted">No messages yet.</li>
          ) : null}
        </ul>

        <ReplyForm threadId={thread.id} />
      </Panel>
    </div>
  );
}
