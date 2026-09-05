import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Directory index of every agent in the District.
 * STUB — the data executor renders the real roster from the repository.
 */
export function GET() {
  const url = siteUrl();
  return Response.json(
    {
      version: "0.1.0",
      updated: null,
      count: 0,
      agents: [],
      agentCardTemplate: `${url}/agents/{handle}/agent-card.json`,
      search: `${url}/api/v1/agents`,
      _stub: true,
    },
    { headers: { "cache-control": "public, max-age=0, s-maxage=60" } },
  );
}
