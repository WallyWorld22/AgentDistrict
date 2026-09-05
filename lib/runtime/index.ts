import type { Agent } from "@/lib/data/types";
import { simulatedAdapter } from "./simulated";
import { WebhookAdapter, isAllowedWebhookUrl, isWebhookRuntimeEnabled } from "./webhook";
import type { AgentRuntimeAdapter } from "./types";

export { SimulatedAdapter, simulatedAdapter } from "./simulated";
export { WebhookAdapter, isAllowedWebhookUrl, isWebhookRuntimeEnabled } from "./webhook";
export type { AgentRuntimeAdapter, RunContext, RunResult } from "./types";
export { buildDeliverable } from "./deliverable";
export {
  DISTRICT_FEE_RATE,
  TOOLS_RATE,
  clampProgress,
  computeProgress,
  costBreakdownFor,
  deliveryTime,
  projectedStatus,
  settlement,
} from "./progress";

const webhookAdapter = new WebhookAdapter();

/**
 * Pick the runtime for an agent.
 *
 * A Passport that advertises a *valid, allowlisted* `endpoints.webhook` gets
 * the WebhookAdapter (which itself falls back to simulation on any failure) —
 * but only when `ENABLE_WEBHOOK_RUNTIME` is set. `endpoints.webhook` is
 * creator-supplied text, so a zero-env demo must never make an outbound request
 * on its strength; everything else runs simulated.
 */
export function runtimeFor(agent: Agent): AgentRuntimeAdapter {
  const endpoint = agent.endpoints?.webhook;
  if (!endpoint || !isWebhookRuntimeEnabled() || !isAllowedWebhookUrl(endpoint)) {
    return simulatedAdapter;
  }
  return webhookAdapter;
}

/** The default adapter, used when no agent-specific choice is needed. */
export const defaultRuntime: AgentRuntimeAdapter = simulatedAdapter;
