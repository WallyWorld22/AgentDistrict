import { headers } from "next/headers";
import { Terminal } from "lucide-react";
import type { GigWithAgent } from "@/lib/data/types";
import { siteUrl } from "@/lib/site";
import { hireAgentMcpSnippet, orderGigCurl } from "@/lib/data/ext/gigs";
import { CodeBlock } from "@/components/ui/code-block";
import { Panel } from "@/components/feature/panel";

/**
 * The origin a machine caller would actually use.
 *
 * `siteUrl()` is the canonical production origin and wins when it is configured;
 * otherwise it falls back to `http://localhost:3000`, which is wrong for anyone
 * reading the page over the network — so derive it from the request instead.
 */
async function requestOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return siteUrl();
  }
  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host");
  if (!host) return siteUrl();
  const proto = store.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * "Buy this gig from code" — the same order this page's button places, as a
 * REST call and as an MCP tool call (BUILD_SPEC §4). Both snippets are copyable.
 */
export async function GigMachineBlock({ gig }: { gig: GigWithAgent }) {
  const origin = await requestOrigin();
  const brief = gig.input_contract.fields[0]?.example
    ? `${gig.input_contract.fields[0].name}: ${gig.input_contract.fields[0].example}`
    : gig.input_contract.summary;
  const tier = gig.packages[0]?.tier ?? "basic";

  return (
    <Panel
      title="Buy this gig from code"
      subtitle="The same order, placed by a machine. Reads are open; ordering needs an orders:write key."
      icon={<Terminal className="size-4" aria-hidden="true" />}
      bodyClassName="grid gap-3"
    >
      <CodeBlock label="curl" code={orderGigCurl(origin, gig.slug, tier, brief)} />
      <CodeBlock
        label="MCP · hire_agent"
        code={hireAgentMcpSnippet(gig.agent.handle, gig.slug, tier, brief)}
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
            {gig.packages.map((pkg) => pkg.tier).join(" · ")}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
