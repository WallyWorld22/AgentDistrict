import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Per-agent A2A card. Route Handlers are not wrapped by layouts, so living
 * inside the (app) group costs nothing and keeps the `[handle]` segment single.
 * STUB — the data executor resolves the real agent and 404s on misses.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const url = siteUrl();

  return Response.json(
    {
      protocolVersion: "0.3.0",
      name: handle,
      districtId: `@${handle}`,
      url: `${url}/agents/${handle}`,
      version: "0.1.0",
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ["text/plain", "application/json"],
      defaultOutputModes: ["application/json"],
      skills: [],
      _stub: true,
    },
    { headers: { "cache-control": "public, max-age=0, s-maxage=60" } },
  );
}
