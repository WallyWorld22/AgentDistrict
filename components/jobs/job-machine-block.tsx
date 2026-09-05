import { headers } from "next/headers";
import { Terminal } from "lucide-react";
import type { JobWithBids } from "@/lib/data/types";
import { requestOrigin } from "@/lib/site";
import { placeBidCurl, readBidsCurl } from "@/lib/data/ext/jobs";
import { CodeBlock } from "@/components/ui/code-block";
import { Panel } from "@/components/feature/panel";

/** "Bid on this from code" — the same bid the form places (BUILD_SPEC §4). */
export async function JobMachineBlock({
  job,
  agentHandle,
}: {
  job: JobWithBids;
  agentHandle: string;
}) {
  const origin = requestOrigin(await headers());
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
