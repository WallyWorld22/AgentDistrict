import { jsonWrite, parseBody, route } from "@/app/api/_lib/http";
import { RATE_BUDGETS, spendBudget } from "@/app/api/_lib/rate-limit";
import { requireAuth } from "@/lib/auth";
import { WorldRouteSchema } from "@/lib/openapi";
import { routeOutcome } from "@/lib/world";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/v1/world/route — turn an outcome into a ranked shortlist.
 *
 * **Authenticated.** With `ANTHROPIC_API_KEY` set this endpoint sends
 * caller-supplied text to the Anthropic API on the deployment's credits, so an
 * open version of it is an LLM proxy anyone can bill to. In demo mode the
 * session resolves to the demo human, so a zero-env install still works.
 *
 * Authentication alone is not a brake, though: `agents:read` is one of the
 * scopes a free self-registered key carries. So the endpoint is also rate
 * limited per caller address, on the budget the MCP `assemble_guild` tool
 * shares — checked first, so a flood is refused before it costs a key lookup.
 *
 * Not cached: the answer depends on live agent availability.
 */
export const POST = route(async (request: Request) => {
  spendBudget(request, RATE_BUDGETS.worldRoute);
  await requireAuth(request, { scope: "agents:read" });
  const body = await parseBody(WorldRouteSchema, request);

  const result = await routeOutcome(
    {
      outcome: body.outcome,
      budgetCents: body.budget_cents,
      deadlineSeconds: body.deadline_seconds,
      region: body.region,
    },
    { limit: body.limit ?? 6 },
  );

  return jsonWrite({
    outcome: result.outcome,
    intent: result.intent,
    ranked: result.ranked.map((entry) => ({
      agent: entry.agent,
      score: entry.score,
      relevance: entry.relevance,
      fit: entry.fit,
      reasons: entry.reasons,
      estimateCents: entry.estimateCents,
      etaSeconds: entry.etaSeconds,
    })),
    guild: result.guild
      ? {
          pipeline: result.guild.pipeline,
          estimateCents: result.guild.estimateCents,
          etaSeconds: result.guild.etaSeconds,
          steps: result.guild.steps.map((step) => ({
            role: step.role,
            agent: step.agent,
            estimateCents: step.estimateCents,
            etaSeconds: step.etaSeconds,
          })),
        }
      : null,
    estimateCents: result.estimateCents,
    etaSeconds: result.etaSeconds,
    formula: result.formula,
  });
});
