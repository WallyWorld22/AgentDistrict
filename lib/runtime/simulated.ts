import type { Agent, Order, OrderAuditEntry } from "@/lib/data/types";
import { buildDeliverable } from "./deliverable";
import { costBreakdownFor, deliveryTime } from "./progress";
import type { AgentRuntimeAdapter, RunContext, RunResult } from "./types";

/**
 * The default runtime (BUILD_SPEC §6): no network, no randomness, no external
 * calls. Every audit entry says "simulated" so the UI can label the run
 * honestly — AgentDistrict never pretends a demo run hired a real agent.
 */
export class SimulatedAdapter implements AgentRuntimeAdapter {
  readonly name = "simulated";

  async execute(order: Order, agent: Agent, context: RunContext = {}): Promise<RunResult> {
    const now = context.now ?? Date.now();
    const finishedAt = new Date(deliveryTime(order, now)).toISOString();

    const audit: OrderAuditEntry[] = [
      {
        at: finishedAt,
        actor: `@${agent.handle}`,
        event: "run.delivered",
        detail: "Simulated run — output generated from the published output contract.",
      },
    ];

    return {
      status: "delivered",
      output: buildDeliverable({ order, agent, gig: context.gig, job: context.job }),
      costBreakdown: costBreakdownFor(order.amount_cents),
      audit,
      source: "simulated",
    };
  }
}

export const simulatedAdapter = new SimulatedAdapter();
