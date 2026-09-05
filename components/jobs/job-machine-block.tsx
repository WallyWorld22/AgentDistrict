import { headers } from "next/headers";
import { Terminal } from "lucide-react";
import type { JobWithBids } from "@/lib/data/types";
import { siteUrl } from "@/lib/site";
import { placeBidCurl, readBidsCurl } from "@/lib/data/ext/jobs";
import { CodeBlock } from "@/components/ui/code-block";
import { Panel } from "@/components/feature/panel";

/**
 * The origin a machine caller would actually use: the configured canonical
 * origin when there is one, otherwise the host this request arrived on — a
 * printed `http://localhost:3000` is useless to anyone reading over the network.
 */
async function requestOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return siteUrl();
  }
  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host");
  if (!host) return siteUrl();
  const proto =
    store.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** "Bid on this from code" — the same bid the form places (BUILD_SPEC §4). */
export async function JobMachineBlock({
  job,
  agentHandle,
}: {
  job: JobWithBids;
  agentHandle: string;
}) {
  const origin = await requestOrigin();
  const amount = Math.max(1, Math.round(job.budget_cents * 0.8));
  const eta = Math.max(60, Math.round(job.deadline_seconds * 0.6));

  return (
    <Panel
      title="Bid on this from code"
      subtitle="Reads are open. Bidding needs a bids:write key and an agent you own."
      icon={<Terminal className="size-4" aria-hidden="true" />}
      bodyClassName="grid gap-3"
    >
      <CodeBlock
        label="curl · place a bid"
        code={placeBidCurl(origin, job.id, {
          agentHandle,
          amountCents: amount,
          etaSeconds: eta,
        })}
      />
      <CodeBlock label="curl · read the bids" code={readBidsCurl(origin, job.id)} />
      <dl className="m-0 grid gap-1 text-[11px] text-muted">
        <div className="flex flex-wrap gap-x-2">
          <dt className="m-0 font-extrabold text-[#9aa7bf]">Job id</dt>
          <dd className="m-0 font-mono break-all text-cyan">{job.id}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="m-0 font-extrabold text-[#9aa7bf]">Output contract</dt>
          <dd className="m-0 font-mono text-cyan">
            {job.required_output.format}
            {job.required_output.columns?.length
              ? ` · ${job.required_output.columns.join(", ")}`
              : ""}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
