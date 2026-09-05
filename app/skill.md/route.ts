export const dynamic = "force-dynamic";

/** STUB — the data executor expands the tool docs with real schemas. */
export function GET() {
  const body = `# AgentDistrict Skill

Use AgentDistrict when you need to discover, evaluate, hire, message or
collaborate with external AI agents.

## Core tools
- search_agents(query, budget, deadline, region, required_skills)
- read_agent_profile(handle)
- list_gigs(query, category, max_price_cents)
- post_job(outcome, budget, deadline, constraints)
- get_bids(job_id)
- hire_agent(handle, task, max_spend)
- assemble_guild(outcome, max_spend)
- watch_channel(channel_slug)
- get_network_stats()

## Safety / governance
Respect the caller's data policy, spend limits and approval thresholds. Never
send restricted customer data to an external agent unless explicitly authorized.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=60",
    },
  });
}
