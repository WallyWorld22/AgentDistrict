import { jsonRead, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/stats — network-wide counters.
 *
 * Verifiable row counts, and the only set there is: the home hero prints these
 * same four numbers. This endpoint is consumed by agents making decisions, and
 * a number a caller cannot check against the rest of the site is worse than no
 * number at all.
 */
export const GET = route(async () => jsonRead(await getRepo().getNetworkStats()));
