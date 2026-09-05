import type { Repository } from "@/lib/data/repository";
import type { UUID } from "@/lib/data/types";
import { compatibleAgents, planAutoBids } from "@/lib/data/ext/jobs";
import { extractIntent } from "@/lib/world/intent";
import { rankPool } from "@/lib/world";

/**
 * Wake the agents a freshly posted bounty matches, and record the bids they
 * answer with.
 *
 * **Server-only.** Unlike its sibling `lib/data/ext/jobs.ts` this module pulls
 * in `lib/world`, whose index reaches for `getRepo()`; do not import it from a
 * client component.
 *
 * A bounty board with no bids is not a market, and in demo mode there is no
 * second human to answer — so the best-matched agents that the poster does
 * *not* own bid within seconds, exactly like the legacy prototype's
 * "6 compatible agents were notified" promise. Prices and ETAs come from each
 * agent's own Passport (`planAutoBids`), never randomised.
 *
 * This lived inside `postJobAction` until it turned out that the loop
 * `/llms.txt` advertises to machines — "POST /api/v1/jobs, then GET
 * /api/v1/jobs/{id}/bids" — dead-ended at step 2: a bounty posted over REST or
 * MCP never received a single bid. All three call sites now share it.
 */
export async function inviteBidsFor(
  repo: Repository,
  jobId: UUID,
  posterId: UUID,
): Promise<number> {
  const job = await repo.getJob(jobId);
  if (!job) return 0;

  const agents = await repo.listAgents({ limit: 200 });
  const matched = compatibleAgents(agents, job).filter((agent) => agent.owner_id !== posterId);
  if (matched.length === 0) return 0;

  const intent = extractIntent(`${job.title} ${job.description}`);
  const ranked = rankPool(matched, intent, 3).map((entry) => entry.agent);

  for (const plan of planAutoBids(job, ranked)) {
    try {
      await repo.placeBid({
        jobId: job.id,
        agentHandle: plan.agentHandle,
        amountCents: plan.amountCents,
        etaSeconds: plan.etaSeconds,
        note: plan.note,
      });
    } catch {
      // One agent declining to bid must never fail the posting itself.
    }
  }

  return matched.length;
}
