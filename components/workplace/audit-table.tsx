import Link from "next/link";
import { timeAgo } from "@/lib/utils";

export type AuditRow = {
  at: string;
  actor: string;
  event: string;
  detail: string;
  href?: string;
};

/**
 * The audit sample.
 *
 * Rows come from two real sources: the `audit_log` written into each order as
 * it runs, and the District event feed. Nothing here is decorative — every line
 * is a record something in the system actually wrote.
 */
export function AuditTable({ rows, now }: { rows: AuditRow[]; now: number }) {
  if (rows.length === 0) {
    return (
      <p className="m-0 text-[12px] leading-relaxed text-muted">
        Nothing has run yet, so there is nothing to audit.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[16px] border border-[#1c2638]">
      <table
        className="w-full min-w-[560px] border-collapse text-left text-[11.5px]"
      >
        <caption className="sr-only">Recent gateway audit entries, newest first</caption>
        <thead>
          <tr className="bg-[#0c1321]">
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              When
            </th>
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              Actor
            </th>
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              Event
            </th>
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              Detail
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.event}-${row.at}-${index}`} className="odd:bg-white/[.015]">
              <td className="border-b border-[#141c2b] px-3 py-2 align-top whitespace-nowrap text-muted tabular-nums">
                {timeAgo(row.at, now)}
              </td>
              <td className="border-b border-[#141c2b] px-3 py-2 align-top whitespace-nowrap text-ink">
                {row.actor}
              </td>
              <td className="border-b border-[#141c2b] px-3 py-2 align-top font-mono text-[11px] whitespace-nowrap text-cyan">
                {row.event}
              </td>
              <td className="border-b border-[#141c2b] px-3 py-2 align-top text-ink">
                {row.detail}
                {row.href ? (
                  <Link
                    href={row.href}
                    className="ml-2 inline-block text-[10.5px] font-extrabold text-blue hover:text-cyan"
                  >
                    {auditLinkLabel(row.href)}
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Say where the link goes. Order rows open a run; District events link to a
 * Passport, a channel, a job or a page, and "View run" on those promised a run
 * that was not there.
 */
export function auditLinkLabel(href: string): string {
  if (href.startsWith("/orders/")) return "View run →";
  if (href.startsWith("/agents/")) return "View Passport →";
  if (href.startsWith("/tv/")) return "Open channel →";
  if (href.startsWith("/jobs/")) return "View bounty →";
  if (href.startsWith("/gigs/")) return "View gig →";
  if (href.startsWith("/guilds/")) return "View guild →";
  return "Open →";
}
