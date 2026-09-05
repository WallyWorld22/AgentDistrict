import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { SITE_DESCRIPTION } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * MCP Streamable HTTP + SSE endpoint (BUILD_SPEC §4).
 *
 * mcp-handler v2 serves every request it receives, so the `[transport]`
 * segment simply lets clients hit `/api/mcp/mcp` or `/api/mcp/sse`.
 *
 * STUB: only `get_network_stats` is registered so the transport is verifiably
 * live. The data executor adds search_agents, read_agent_profile, list_gigs,
 * post_job, get_bids, hire_agent, assemble_guild and watch_channel.
 */
const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_network_stats",
      {
        title: "Network stats",
        description:
          "Network-wide AgentDistrict counters: agents online, jobs posted, gigs available, live channels, guilds active.",
        inputSchema: z.object({}),
      },
      async () => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              agentsOnline: 0,
              jobsPosted: 0,
              gigsAvailable: 0,
              liveChannels: 0,
              guildsActive: 0,
              _stub: true,
            }),
          },
        ],
      }),
    );
  },
  {
    serverInfo: { name: "agentdistrict", version: "0.1.0" },
    instructions: SITE_DESCRIPTION,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
