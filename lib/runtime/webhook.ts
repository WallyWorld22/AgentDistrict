import { z } from "zod";
import { OUTPUT_FORMATS, type Agent, type Json, type Order, type OrderOutput } from "@/lib/data/types";
import { costBreakdownFor, deliveryTime } from "./progress";
import { simulatedAdapter } from "./simulated";
import type { AgentRuntimeAdapter, RunContext, RunResult } from "./types";

/**
 * Calls a real agent over HTTP when its Passport advertises
 * `endpoints.webhook`, and falls back to the SimulatedAdapter on *any* failure
 * — bad URL, timeout, non-2xx, or a response that does not match the output
 * contract (BUILD_SPEC §6).
 *
 * No seeded agent carries a webhook endpoint, so a demo install never leaves
 * the process.
 */

const OutputSchema = z.object({
  format: z.enum(OUTPUT_FORMATS),
  summary: z.string().min(1),
  columns: z.array(z.string()).optional(),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).optional(),
  markdown: z.string().optional(),
  json: z.unknown().optional(),
  files: z
    .array(
      z.object({
        path: z.string(),
        language: z.string().optional(),
        bytes: z.number().int().nonnegative(),
        preview: z.string().optional(),
      }),
    )
    .optional(),
  links: z.array(z.object({ label: z.string(), href: z.string() })).optional(),
});

const ResponseSchema = z.object({
  status: z.enum(["delivered", "failed"]).default("delivered"),
  output: OutputSchema,
  error: z.string().optional(),
});

/** Read at most `MAX_RESPONSE_BYTES` of JSON. An unbounded body is a DoS. */
async function readBounded(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES) throw new Error("webhook response too large");

  const reader = response.body?.getReader();
  if (!reader) return JSON.parse(await response.text());

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("webhook response too large");
      }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

/**
 * Hosts an agent may never be pointed at. `endpoints.webhook` is a
 * creator-supplied string, so without this the District's own server can be
 * made to POST at the cloud metadata service, a loopback admin port or an
 * internal RFC1918 address — a textbook SSRF, made worse by the fact that the
 * failure path echoes the host and the error back into the order audit log.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

const BLOCKED_IPV4 =
  /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/** Response bodies above this are treated as hostile and the run falls back. */
const MAX_RESPONSE_BYTES = 512 * 1024;

/**
 * Is this a URL the District is willing to call? HTTPS only, no credentials in
 * the URL, no loopback / link-local / private-range / IPv6-literal host.
 *
 * Exported so `createAgent` / `updateAgent` can reject a bad endpoint at write
 * time rather than at run time.
 */
export function isAllowedWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host)) return false;
  if (host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return false;
  }
  // IPv6 literals (including ::1 and unique-local fc00::/7) are refused
  // outright — there is no legitimate reason for an agent endpoint to be one.
  if (host.includes(":")) return false;
  if (BLOCKED_IPV4.test(host)) return false;
  return true;
}

/**
 * Is the webhook runtime switched on at all? Off unless
 * `ENABLE_WEBHOOK_RUNTIME=1`, so a zero-env demo can never make an outbound
 * request no matter what a Passport advertises (BUILD_SPEC §1).
 */
export function isWebhookRuntimeEnabled(): boolean {
  const flag = process.env.ENABLE_WEBHOOK_RUNTIME;
  return flag === "1" || flag === "true";
}

export type WebhookAdapterOptions = {
  /** Abort the call after this many ms (default 10s). */
  timeoutMs?: number;
  /** Injectable for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Test seam: bypass the `ENABLE_WEBHOOK_RUNTIME` env flag. */
  enabled?: boolean;
};

export class WebhookAdapter implements AgentRuntimeAdapter {
  readonly name = "webhook";
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly forceEnabled?: boolean;

  constructor(options: WebhookAdapterOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.forceEnabled = options.enabled;
  }

  async execute(order: Order, agent: Agent, context: RunContext = {}): Promise<RunResult> {
    const endpoint = agent.endpoints?.webhook;
    const enabled = this.forceEnabled ?? isWebhookRuntimeEnabled();
    if (!endpoint || !enabled || !isAllowedWebhookUrl(endpoint)) {
      return simulatedAdapter.execute(order, agent, context);
    }

    const now = context.now ?? Date.now();
    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "AgentDistrict/1.0 (+https://agentdistrict.example)",
        },
        body: JSON.stringify({
          order_id: order.id,
          agent_handle: agent.handle,
          brief: order.brief,
          amount_cents: order.amount_cents,
          package_tier: order.package_tier,
          eta_seconds: order.eta_seconds,
          gig_slug: context.gig?.slug ?? null,
          job_id: order.job_id,
        }),
        // A redirect must not be allowed to walk out of the allowlist.
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) throw new Error(`webhook responded ${response.status}`);

      const parsed = ResponseSchema.parse(await readBounded(response));
      if (parsed.status === "failed") {
        throw new Error(parsed.error ?? "agent reported failure");
      }

      const output: OrderOutput = {
        ...parsed.output,
        json: (parsed.output.json ?? null) as Json,
      };

      return {
        status: "delivered",
        output,
        costBreakdown: costBreakdownFor(order.amount_cents),
        audit: [
          {
            at: new Date(deliveryTime(order, now)).toISOString(),
            actor: `@${agent.handle}`,
            event: "run.delivered",
            detail: `Delivered over webhook (${new URL(endpoint).host}).`,
          },
        ],
        source: "webhook",
      };
    } catch (error) {
      const fallback = await simulatedAdapter.execute(order, agent, context);
      return {
        ...fallback,
        audit: [
          {
            at: new Date(now).toISOString(),
            actor: "district",
            event: "runtime.fallback",
            detail: `Webhook unavailable (${
              error instanceof Error ? error.message : "unknown error"
            }); fell back to a simulated run.`,
          },
          ...fallback.audit,
        ],
      };
    }
  }
}
