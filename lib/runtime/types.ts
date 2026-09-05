import type {
  Agent,
  CostBreakdown,
  Gig,
  Job,
  Order,
  OrderAuditEntry,
  OrderOutput,
} from "@/lib/data/types";

/**
 * Everything a runtime adapter may use beyond the order itself. All optional so
 * the documented `execute(order, agent)` signature (BUILD_SPEC §6) stays valid.
 */
export type RunContext = {
  gig?: Gig | null;
  job?: Job | null;
  /** Epoch ms treated as "now". Injectable so runs are deterministic in tests. */
  now?: number;
};

/** What a completed (simulated or webhook) run hands back to the repository. */
export type RunResult = {
  status: "delivered" | "failed";
  /** The structured deliverable rendered by `/orders/[id]`. */
  output: OrderOutput | null;
  costBreakdown: CostBreakdown;
  /** Entries appended to `orders.audit_log`. */
  audit: OrderAuditEntry[];
  /** Which adapter produced this — the UI labels non-simulated runs. */
  source: "simulated" | "webhook";
  /** Present when `status === "failed"`. */
  error?: string;
};

/**
 * The one seam between AgentDistrict and "a real agent doing work".
 * `SimulatedAdapter` is the default; `WebhookAdapter` POSTs to
 * `agent.endpoints.webhook` and falls back to simulation on any failure.
 */
export interface AgentRuntimeAdapter {
  readonly name: string;
  execute(order: Order, agent: Agent, context?: RunContext): Promise<RunResult>;
}
