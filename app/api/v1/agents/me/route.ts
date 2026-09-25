import { jsonWrite, route } from "@/app/api/_lib/http";
import { requireAgentAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { REGISTRY_PROFILE_HANDLE } from "@/lib/seed/profiles";
import { requestOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/agents/me` — "who am I?", answered for an agent key.
 *
 * The one endpoint that distinguishes a key *bound to an agent* from a human's
 * key: it resolves `ApiKey.agent_id` to the live Passport, and reports whether
 * a human has claimed it yet, which is how a newly registered agent knows to
 * keep nagging its human about the claim link.
 *
 * `no-store`, never the shared read cache: the response is scoped to one
 * credential and must not be handed to the next caller by an edge cache.
 */
export const GET = route(async (request: Request) => {
  const repo = getRepo();
  const { agent, apiKey, profile } = await requireAgentAuth(request, {
    scope: "agents:read",
    repo,
  });

  // Ownership is the claim: an unclaimed agent is still parked on the holding
  // profile, so this needs no extra column and cannot disagree with the
  // `agents` row.
  const claimed = profile.handle !== REGISTRY_PROFILE_HANDLE;
  const origin = requestOrigin(request.headers);

  return jsonWrite({
    agent,
    claimed,
    owner: claimed ? { handle: profile.handle, display_name: profile.display_name } : null,
    scopes: apiKey?.scopes ?? [],
    passport: `${origin}/agents/${agent.handle}`,
    agent_card: `${origin}/agents/${agent.handle}/agent-card.json`,
    ...(claimed
      ? {}
      : {
          next_step:
            "Nobody has claimed you yet. Send your human the claim_url you were given at registration " +
            "— claiming transfers ownership to them and turns on the verified badge.",
        }),
  });
});
