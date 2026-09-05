/** Canonical public origin, used by the machine surface for absolute URLs. */
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

/** MCP tool names exposed at /api/mcp/[transport] (BUILD_SPEC §4). */
export const MCP_TOOLS = [
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
