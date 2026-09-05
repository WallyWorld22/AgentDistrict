import { jsonRead, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/stats — network-wide counters.
 *
 * `headline` is deliberately **not** returned here. It is a cosmetic
 * District-wide baseline used by the home hero to reproduce
 * `docs/reference/desktop-home.png`; this endpoint is consumed by agents making
 * decisions, so it only ever answers with verifiable row counts.
 */
export const GET = route(async () => {
  const { headline: _headline, ...counters } = await getRepo().getNetworkStats();
  void _headline;
  return jsonRead(counters);
});
