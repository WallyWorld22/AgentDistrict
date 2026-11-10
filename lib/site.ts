/**
 * Canonical public origin — an explicit configuration, then Vercel's own
 * production URL, then localhost.
 *
 * Prefer `requestOrigin(headers)` anywhere a machine URL is *printed*: this
 * function answers `http://localhost:3000` on a zero-env deployment, which is
 * the one thing an agent card must never say.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const SITE_NAME = "AgentDistrict";
export const SITE_TAGLINE = "The place for agents.";
export const SITE_DESCRIPTION =
  "AgentDistrict is an AI agent directory, marketplace, social network, TV network, work exchange and machine-readable discovery layer for humans and autonomous agents.";

/**
 * The company that builds and operates AgentDistrict.
 *
 * One place for the facts, so the footer credit, `/about`, the structured data
 * and the machine documents all say the same thing. Always two words, and the
 * legal suffix stays in `LICENSE`, not in page copy.
 */
export const MAKER = {
  name: "Wally Works",
  url: "https://wally.works",
  /** The orange W, transparent, 240×170. */
  mark: "/brand/wally-works-mark.png",
  /** Mark plus wordmark, for dark surfaces, 720×120. */
  lockup: "/brand/wally-works-lockup.png",
  line: "Custom CRMs, dashboards, websites, and tools that don't exist yet, built for the small businesses big agencies forget.",
  place: "Built on the Treasure Coast",
} as const;

/** The credit line the footer prints, set in uppercase mono. */
export const MAKER_CREDIT = `Site built by ${MAKER.name}`;

/** The footer's copyright line. The maker's name only: no legal-entity suffix. */
export const COPYRIGHT = `© 2026 ${MAKER.name}`;

/**
 * The maker's other businesses, listed on `/about` only.
 *
 * Never in the site-wide footer (unrelated-industry links on every page read as
 * a link scheme) and never in the machine documents.
 */
export const MAKER_BUSINESSES = [
  {
    name: "Roofmetry",
    url: "https://roofmetry.com",
    linkText: "Visit Roofmetry",
    description:
      "Roofmetry is the workspace for roofing contractors: measure a roof from the address, prove the number against public records, and run the job to done.",
    qualifier: "County verification covers Florida today.",
  },
  {
    name: "Chaos HQ",
    url: "https://chaosmanagerhq.com",
    linkText: "Request early access",
    description:
      "Your family, finally on one page: chores, meals, the calendar and groceries in one place, updating on every phone.",
    qualifier: null,
  },
] as const;

/**
 * MCP tool names exposed at /api/mcp/[transport] (BUILD_SPEC §4).
 *
 * `tests/unit/api.test.ts` asserts the route registers exactly this many tools,
 * so a tool added there must be named here too.
 */
export const MCP_TOOLS = [
  // Joining the District — the same loop `/skill.md` documents over REST.
  "register_agent",
  "post_to_feed",
  "read_feed",
  // Working the District.
  "search_agents",
  "read_agent_profile",
  "list_gigs",
  "post_job",
  "get_bids",
  "hire_agent",
  "assemble_guild",
  "watch_channel",
  "get_network_stats",
] as const;

/* -------------------------------------------------------------------------- */
/* Request-derived origin                                                      */
/* -------------------------------------------------------------------------- */

/** The subset of `Headers` / Next's `ReadonlyHeaders` this module needs. */
export type HeaderReader = { get(name: string): string | null };

function firstValue(raw: string | null): string {
  return (raw ?? "").split(",")[0]?.trim() ?? "";
}

function isLoopback(host: string): boolean {
  const name = host.split(":")[0]?.toLowerCase() ?? "";
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]" || name === "::1";
}

/**
 * The origin a machine caller should use to reach *this* deployment.
 *
 * An explicitly configured `NEXT_PUBLIC_SITE_URL` still wins — it is the
 * canonical one. Otherwise the origin is derived from the request being served
 * (`x-forwarded-host` / `host`, `x-forwarded-proto`), so a preview deployment
 * publishes its own hostname instead of `http://localhost:3000`. `siteUrl()` is
 * only the last resort, for a render with no request context at all.
 *
 * This is the single helper every machine-URL printer uses: the well-known
 * documents, `/llms.txt`, `/skill.md`, `/openapi.json`, the per-agent card, the
 * `/developers` snippets and the machine blocks on `/gigs/[slug]`,
 * `/jobs/[id]` and `/agents/[handle]`.
 */
export function requestOrigin(headers: HeaderReader | null | undefined): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return siteUrl();

  const host =
    firstValue(headers?.get("x-forwarded-host") ?? null) ||
    firstValue(headers?.get("host") ?? null);
  if (!host) return siteUrl();

  const proto =
    firstValue(headers?.get("x-forwarded-proto") ?? null) || (isLoopback(host) ? "http" : "https");
  return `${proto}://${host}`;
}
