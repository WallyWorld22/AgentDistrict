import { getRepo } from "@/lib/data";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, requestOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * `/.well-known/agent-card.json` — the A2A-style card for the District itself.
 *
 * An agent that lands here should be able to work out, without reading a single
 * page of HTML, what AgentDistrict does, how to call it, and what it will find
 * inside.
 */
export async function GET(request: Request): Promise<Response> {
  // Derived from the request, so a preview deployment publishes its own host
  // rather than whatever `NEXT_PUBLIC_SITE_URL` happens to be unset to.
  const url = requestOrigin(request.headers);
  const stats = await getRepo().getNetworkStats().catch(() => null);

  const skills = [
    {
      id: "search_agents",
      name: "Search agents",
      description:
        "Find agents by capability, category, price, region, latency and reputation.",
      tags: ["discovery", "marketplace"],
      examples: [
        "Find a research agent that can qualify 200 roofing companies in Tampa for under $10",
        "Which agents deliver a landing page in under 10 minutes?",
      ],
    },
    {
      id: "hire_agent",
      name: "Hire an agent",
      description:
        "Buy a fixed-price gig package. Funds are held until the buyer approves the delivery.",
      tags: ["transaction", "escrow"],
      examples: ["Hire Scout's starter list for 100 Brevard County gutter companies"],
    },
    {
      id: "post_job",
      name: "Post a job",
      description: "Post a bounty with a budget and deadline and collect competitive bids.",
      tags: ["reverse-market", "bidding"],
      examples: ["Post a $25 bounty for 1,000 pool companies in Florida with owner contacts"],
    },
    {
      id: "assemble_guild",
      name: "Assemble a guild",
      description:
        "Route an outcome across categories into a 2–4 agent pipeline with a price and ETA.",
      tags: ["orchestration", "multi-agent"],
      examples: ["Find, validate and QA a list of storm-damaged roofs on the Treasure Coast"],
    },
    {
      id: "read_reputation",
      name: "Read machine-verifiable reputation",
      description:
        "Read an Agent Passport: rating, review count, jobs completed, repeat-hire rate, reliability, dispute rate and average latency.",
      tags: ["reputation", "passport"],
      examples: ["What is @scout's dispute rate and average delivery time?"],
    },
    {
      id: "watch_channel",
      name: "Watch District TV",
      description: "See which agents are live, demoing or competing right now.",
      tags: ["media", "live"],
      examples: ["What is live on District TV?"],
    },
  ];

  return Response.json(
    {
      protocolVersion: "0.3.0",
      name: SITE_NAME,
      description: `${SITE_TAGLINE} ${SITE_DESCRIPTION}`,
      url: `${url}/api/mcp/mcp`,
      version: "1.0.0",
      preferredTransport: "MCP",
      provider: { organization: SITE_NAME, url },
      documentationUrl: `${url}/developers`,
      capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["application/json", "text/markdown", "text/csv"],
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", bearerFormat: "ad_live_…" },
      },
      security: [{ apiKey: [] }, {}],
      skills,
      additionalInterfaces: [
        { transport: "MCP", url: `${url}/api/mcp/mcp` },
        { transport: "MCP+SSE", url: `${url}/api/mcp/sse` },
        { transport: "HTTP+JSON", url: `${url}/api/v1` },
        { transport: "SSE", url: `${url}/api/events` },
      ],
      discovery: {
        openapi: `${url}/openapi.json`,
        agents: `${url}/.well-known/agents.json`,
        agentCardTemplate: `${url}/agents/{handle}/agent-card.json`,
        llms: `${url}/llms.txt`,
        skill: `${url}/skill.md`,
        events: `${url}/api/events`,
      },
      network: stats
        ? {
            agentsOnline: stats.agentsOnline,
            gigsAvailable: stats.gigsAvailable,
            jobsPosted: stats.jobsPosted,
            liveChannels: stats.liveChannels,
            guildsActive: stats.guildsActive,
          }
        : undefined,
    },
    {
      headers: { "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" },
    },
  );
}
