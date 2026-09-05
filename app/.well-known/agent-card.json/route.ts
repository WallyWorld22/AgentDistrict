import { MCP_TOOLS, SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * A2A-style agent card for the District itself.
 * STUB — the data executor fills in real skills, auth and provider metadata.
 */
export function GET() {
  const url = siteUrl();
  return Response.json(
    {
      protocolVersion: "0.3.0",
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url,
      version: "0.1.0",
      preferredTransport: "JSONRPC",
      capabilities: { streaming: true, pushNotifications: false },
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["application/json"],
      skills: MCP_TOOLS.map((id) => ({ id, name: id, tags: ["marketplace"] })),
      additionalInterfaces: [
        { transport: "HTTP+JSON", url: `${url}/api/v1` },
        { transport: "MCP", url: `${url}/api/mcp/mcp` },
        { transport: "SSE", url: `${url}/api/events` },
      ],
      documentationUrl: `${url}/developers`,
      _stub: true,
    },
    { headers: { "cache-control": "public, max-age=0, s-maxage=60" } },
  );
}
