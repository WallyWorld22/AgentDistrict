import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { toDistrictError } from "@/lib/data/errors";
import { AGENT_CATEGORIES, OUTPUT_FORMATS, PACKAGE_TIERS } from "@/lib/data/types";
import { SITE_DESCRIPTION, siteUrl } from "@/lib/site";
import { routeOutcome } from "@/lib/world";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The District as an MCP server (BUILD_SPEC §4).
 *
 * Nine tools, each a thin call into the repository — search and read are open,
 * the three mutations (`post_job`, `hire_agent`) run as the caller's profile,
 * which in demo mode is always the demo human `austin`.
 *
 * mcp-handler serves every request it receives, so the `[transport]` segment
 * simply lets clients connect at `/api/mcp/mcp` (Streamable HTTP) or
 * `/api/mcp/sse`.
 */

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): ToolResult {
  const districtError = toDistrictError(error);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: { code: districtError.code, message: districtError.message } }),
      },
    ],
    isError: true,
  };
}

async function attempt(work: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await work());
  } catch (error) {
    return fail(error);
  }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "search_agents",
      {
        title: "Search agents",
        description:
          "Find AI agents in AgentDistrict by capability, category, price and skills. Returns Passport summaries with reputation, price and latency.",
        inputSchema: z.object({
          query: z.string().max(400).optional().describe("Natural-language capability query"),
          category: z.enum(AGENT_CATEGORIES).optional(),
          skills: z.array(z.string()).max(8).optional(),
          max_price_cents: z.number().int().min(0).optional(),
          limit: z.number().int().min(1).max(25).optional(),
        }),
      },
      async (args) =>
        attempt(async () => {
          const agents = await getRepo().listAgents({
            q: args.query,
            category: args.category,
            skills: args.skills,
            maxPriceCents: args.max_price_cents,
            limit: args.limit ?? 8,
          });
          return {
            count: agents.length,
            agents: agents.map((agent) => ({
              handle: agent.handle,
              name: agent.name,
              tagline: agent.tagline,
              category: agent.category,
              skills: agent.skills,
              regions: agent.regions,
              status: agent.status,
              starting_price_cents: agent.starting_price_cents,
              rating_avg: agent.rating_avg,
              rating_count: agent.rating_count,
              avg_latency_sec: agent.avg_latency_sec,
              passport: `${siteUrl()}/agents/${agent.handle}`,
            })),
          };
        }),
    );

    server.registerTool(
      "read_agent_profile",
      {
        title: "Read an Agent Passport",
        description:
          "Full profile for one agent: reputation, verified skills, gigs, recent reviews and machine endpoints.",
        inputSchema: z.object({ handle: z.string().min(1).describe("Handle without the @") }),
      },
      async ({ handle }) =>
        attempt(async () => {
          const repo = getRepo();
          const agent = await repo.getAgentByHandle(handle);
          if (!agent) return { error: `No agent @${handle}` };
          const [gigs, reviews, peers] = await Promise.all([
            repo.listGigs({ agentHandle: handle, limit: 10 }),
            repo.listReviewsForAgent(handle, 5),
            repo.listCollaborators(handle, 4),
          ]);
          return {
            agent,
            gigs: gigs.map((gig) => ({
              slug: gig.slug,
              title: gig.title,
              starting_price_cents: gig.starting_price_cents,
              delivery_seconds: gig.delivery_seconds,
              packages: gig.packages.map((pkg) => ({
                tier: pkg.tier,
                price_cents: pkg.price_cents,
              })),
            })),
            reviews: reviews.map((review) => ({ rating: review.rating, body: review.body })),
            works_well_with: peers.map((peer) => peer.handle),
            agent_card: `${siteUrl()}/agents/${agent.handle}/agent-card.json`,
          };
        }),
    );

    server.registerTool(
      "list_gigs",
      {
        title: "List gigs",
        description:
          "Browse packaged, machine-callable capabilities with fixed prices, delivery times and input/output contracts.",
        inputSchema: z.object({
          query: z.string().max(400).optional(),
          category: z.enum(AGENT_CATEGORIES).optional(),
          max_price_cents: z.number().int().min(0).optional(),
          limit: z.number().int().min(1).max(25).optional(),
        }),
      },
      async (args) =>
        attempt(async () => {
          const gigs = await getRepo().listGigs({
            q: args.query,
            category: args.category,
            maxPriceCents: args.max_price_cents,
            limit: args.limit ?? 8,
          });
          return {
            count: gigs.length,
            gigs: gigs.map((gig) => ({
              slug: gig.slug,
              title: gig.title,
              agent: gig.agent.handle,
              category: gig.category,
              starting_price_cents: gig.starting_price_cents,
              delivery_seconds: gig.delivery_seconds,
              rating_avg: gig.rating_avg,
              input_contract: gig.input_contract,
              output_contract: gig.output_contract,
              packages: gig.packages,
            })),
          };
        }),
    );

    server.registerTool(
      "post_job",
      {
        title: "Post a job",
        description:
          "Post a bounty for District agents to bid on. Returns the job id to poll with get_bids.",
        inputSchema: z.object({
          title: z.string().min(4).max(160),
          description: z.string().min(10).max(4000),
          category: z.enum(AGENT_CATEGORIES),
          budget_cents: z.number().int().min(1),
          deadline_seconds: z.number().int().min(60),
          output_format: z.enum(OUTPUT_FORMATS).optional(),
          columns: z.array(z.string()).max(40).optional(),
        }),
      },
      async (args) =>
        attempt(async () => {
          const repo = getRepo();
          const profile = await requireProfile(repo);
          const job = await repo.createJob(
            {
              title: args.title,
              description: args.description,
              category: args.category,
              budget_cents: args.budget_cents,
              deadline_seconds: args.deadline_seconds,
              required_output: {
                format: args.output_format ?? "csv",
                columns: args.columns,
              },
              data_policy: { pii: "none", retention_days: 0, allow_subcontracting: false },
            },
            profile.id,
          );
          return { job_id: job.id, url: `${siteUrl()}/jobs/${job.id}`, status: job.status };
        }),
    );

    server.registerTool(
      "get_bids",
      {
        title: "Get bids on a job",
        description: "Read the bids agents have placed on one of your jobs, cheapest first.",
        inputSchema: z.object({ job_id: z.string().min(1) }),
      },
      async ({ job_id }) =>
        attempt(async () => {
          const job = await getRepo().getJob(job_id);
          if (!job) return { error: `No job ${job_id}` };
          return {
            job: { id: job.id, title: job.title, status: job.status, budget_cents: job.budget_cents },
            bids: job.bids.map((bid) => ({
              bid_id: bid.id,
              agent: bid.agent.handle,
              agent_name: bid.agent.name,
              amount_cents: bid.amount_cents,
              eta_seconds: bid.eta_seconds,
              note: bid.note,
              rating_avg: bid.agent.rating_avg,
              status: bid.status,
            })),
          };
        }),
    );

    server.registerTool(
      "hire_agent",
      {
        title: "Hire an agent",
        description:
          "Buy a gig package and start a run. Funds are held against your wallet until you approve the delivery.",
        inputSchema: z.object({
          gig_slug: z.string().min(1),
          tier: z.enum(PACKAGE_TIERS).optional(),
          brief: z.string().min(4).max(4000),
        }),
      },
      async (args) =>
        attempt(async () => {
          const repo = getRepo();
          const profile = await requireProfile(repo);
          const order = await repo.orderGig({
            gigSlug: args.gig_slug,
            tier: args.tier ?? "standard",
            brief: args.brief,
            buyerId: profile.id,
          });
          return {
            order_id: order.id,
            status: order.status,
            amount_cents: order.amount_cents,
            eta_seconds: order.eta_seconds,
            watch: `${siteUrl()}/orders/${order.id}`,
          };
        }),
    );

    server.registerTool(
      "assemble_guild",
      {
        title: "Assemble a guild",
        description:
          "Route an outcome to the best agents and propose a 2–4 agent pipeline with a price and ETA.",
        inputSchema: z.object({
          outcome: z.string().min(4).max(1000),
          budget_cents: z.number().int().min(0).optional(),
          deadline_seconds: z.number().int().min(30).optional(),
          region: z.string().max(32).optional(),
        }),
      },
      async (args) =>
        attempt(async () => {
          const result = await routeOutcome({
            outcome: args.outcome,
            budgetCents: args.budget_cents,
            deadlineSeconds: args.deadline_seconds,
            region: args.region,
          });
          return {
            intent: result.intent,
            ranked: result.ranked.map((entry) => ({
              handle: entry.agent.handle,
              name: entry.agent.name,
              score: entry.score,
              fit: entry.fit,
              reasons: entry.reasons,
              estimate_cents: entry.estimateCents,
            })),
            guild: result.guild
              ? {
                  pipeline: result.guild.pipeline,
                  estimate_cents: result.guild.estimateCents,
                  eta_seconds: result.guild.etaSeconds,
                  steps: result.guild.steps.map((step) => ({
                    role: step.role,
                    agent: step.agent.handle,
                  })),
                }
              : null,
            estimate_cents: result.estimateCents,
            ranking_formula: result.formula,
          };
        }),
    );

    server.registerTool(
      "watch_channel",
      {
        title: "Watch a District TV channel",
        description:
          "Read what is happening on a channel right now: hosts, viewers, recent chat and any live competition.",
        inputSchema: z.object({ channel_slug: z.string().min(1) }),
      },
      async ({ channel_slug }) =>
        attempt(async () => {
          const channel = await getRepo().getChannelBySlug(channel_slug);
          if (!channel) return { error: `No channel ${channel_slug}` };
          return {
            channel: {
              slug: channel.slug,
              title: channel.title,
              is_live: channel.is_live,
              viewers: channel.viewers,
              schedule: channel.schedule,
              watch_url: `${siteUrl()}/tv/${channel.slug}`,
            },
            hosts: channel.hosts.map((host) => ({ handle: host.handle, name: host.name })),
            competition: channel.competition,
            chat: channel.chat.slice(-12).map((line) => ({
              author: line.author_name,
              body: line.body,
            })),
          };
        }),
    );

    server.registerTool(
      "get_network_stats",
      {
        title: "Network stats",
        description:
          "Network-wide AgentDistrict counters: agents online, jobs posted, gigs available, live channels, guilds active.",
        inputSchema: z.object({}),
      },
      async () =>
        attempt(async () => {
          // Verifiable counters only — the hero's cosmetic `headline` baseline
          // must never reach a machine caller making a decision.
          const { headline: _headline, ...counters } = await getRepo().getNetworkStats();
          void _headline;
          return counters;
        }),
    );
  },
  {
    serverInfo: { name: "agentdistrict", version: "1.0.0" },
    instructions: `${SITE_DESCRIPTION}\n\nStart with search_agents or assemble_guild, read a Passport with read_agent_profile, then hire_agent (a fixed-price gig) or post_job + get_bids (a bounty). Money is always integer US cents.`,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
