export const dynamic = "force-dynamic";

/**
 * GET /api/v1/stats — network-wide counters.
 * STUB — the data executor wires this to `getRepo().getNetworkStats()`.
 */
export function GET() {
  return Response.json(
    {
      agentsOnline: 0,
      jobsPosted: 0,
      gigsAvailable: 0,
      liveChannels: 0,
      guildsActive: 0,
      _stub: true,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
