import { headers } from "next/headers";
import { Terminal } from "lucide-react";
import type { GigWithAgent } from "@/lib/data/types";
import { requestOrigin } from "@/lib/site";
import { formatCents } from "@/lib/utils";
import { hireAgentMcpSnippet, orderGigCurl } from "@/lib/data/ext/gigs";
import { CodeBlock } from "@/components/ui/code-block";
import { Panel } from "@/components/feature/panel";

/**
 * "Buy this gig from code" — the same order this page's button places, as a
 * REST call and as an MCP tool call (BUILD_SPEC §4). Both snippets are copyable.
 */
export async function GigMachineBlock({ gig }: { gig: GigWithAgent }) {
  const origin = requestOrigin(await headers());
  const brief = gig.input_contract.fields[0]?.example
    ? `${gig.input_contract.fields[0].name}: ${gig.input_contract.fields[0].example}`
    : gig.input_contract.summary;
  // These snippets are server-rendered while the package tabs are a client
  // island, so they cannot follow the buyer's selection. Rather than silently
  // showing `basic` while the button says "Continue — $6.40", they name the
  // tier they use and the block prints all three with their prices.
  const tier = gig.packages[0]?.tier ?? "basic";
  const tierPackage = gig.packages.find((pkg) => pkg.tier === tier);

  return (
    <Panel
      title="Buy this gig from code"
      subtitle="The same order, placed by a machine. Reads are open; ordering needs an orders:write key."
      icon={<Terminal className="size-4" aria-hidden="true" />}
      bodyClassName="grid gap-3"
    >
      <p className="m-0 text-[11px] leading-relaxed text-muted">
        Both snippets order the{" "}
        <b className="font-extrabold text-ink">
          {tier}
          {tierPackage ? ` — ${tierPackage.name}` : ""}
        </b>{" "}
        package. Swap <code className="font-mono text-cyan">tier</code> for any of the
        three below to buy a different one.
      </p>
      <CodeBlock label={`curl · ${tier} tier`} code={orderGigCurl(origin, gig.slug, tier, brief)} />
      <CodeBlock
        label={`MCP · hire_agent · ${tier} tier`}
        code={hireAgentMcpSnippet(gig.slug, tier, brief)}
      />
      <dl className="m-0 grid gap-1 text-[11px] text-muted">
        <div className="flex flex-wrap gap-x-2">
          <dt className="m-0 font-extrabold text-[#9aa7bf]">Gig slug</dt>
          <dd className="m-0 font-mono text-cyan">{gig.slug}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="m-0 font-extrabold text-[#9aa7bf]">District ID</dt>
          <dd className="m-0 font-mono text-cyan">@{gig.agent.handle}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="m-0 font-extrabold text-[#9aa7bf]">Tiers</dt>
          <dd className="m-0 font-mono text-cyan">
            {gig.packages
              .map((pkg) => `${pkg.tier} ${formatCents(pkg.price_cents)}`)
              .join(" · ")}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
