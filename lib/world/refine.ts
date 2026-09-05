import { z } from "zod";
import { AGENT_CATEGORIES } from "@/lib/data/types";
import type { WorldIntent } from "./intent";

/**
 * Optional Claude refinement of a heuristic intent (BUILD_SPEC §5).
 *
 * Runs **only** when `ANTHROPIC_API_KEY` is set, uses `claude-sonnet-5` with a
 * single forced tool call whose schema is derived from the zod schema below,
 * and falls back to the heuristic intent on *any* failure — missing key, network
 * error, refusal, malformed arguments. AgentDistrict must build and run with
 * zero env vars, so this path is never on the critical path.
 */

export const WORLD_MODEL = "claude-sonnet-5";

const IntentToolSchema = z.object({
  categories: z
    .array(z.enum(AGENT_CATEGORIES))
    .describe("Marketplace categories that could deliver this outcome, best first."),
  skills: z
    .array(z.string())
    .describe("Concrete capabilities the work needs, e.g. 'Lead research', 'Roof scoring'."),
  region: z
    .string()
    .optional()
    .describe("Two-letter US state code for the work's location, or 'US'/'GLOBAL'."),
  locations: z.array(z.string()).describe("Place names mentioned, e.g. ['Tampa']."),
  quantity: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("How many records/items the buyer asked for, if they said."),
  budget_cents: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Total budget in integer US cents, if the buyer named one."),
  deadline_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("How long the buyer is willing to wait, in seconds."),
  keywords: z.array(z.string()).describe("Content words for text matching, lowercase."),
});

const SYSTEM_PROMPT = `You route buyer outcomes to AI agents in the AgentDistrict marketplace.
Read the outcome and record the structured intent behind it. Be literal: only
record a budget, quantity, deadline or region the buyer actually implied. Prefer
the marketplace's own vocabulary for skills. Always call the record_intent tool.`;

function toolInputSchema(): { type: "object"; [key: string]: unknown } {
  const schema = z.toJSONSchema(IntentToolSchema, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return { ...schema, type: "object" };
}

/**
 * @returns the refined intent, or `heuristic` unchanged when Claude is
 * unavailable or unhelpful.
 */
export async function refineIntent(
  outcome: string,
  heuristic: WorldIntent,
): Promise<WorldIntent> {
  if (!process.env.ANTHROPIC_API_KEY) return heuristic;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();

    const response = await client.messages.create({
      model: WORLD_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: "record_intent",
          description: "Record the structured intent behind a buyer's outcome.",
          input_schema: toolInputSchema(),
          strict: true,
        },
      ],
      tool_choice: { type: "tool", name: "record_intent" },
      messages: [
        {
          role: "user",
          content: [
            `Outcome: ${outcome}`,
            "",
            "Heuristic first pass (correct it where it is wrong):",
            JSON.stringify(
              {
                categories: heuristic.categories,
                skills: heuristic.skills,
                region: heuristic.region,
                locations: heuristic.locations,
                quantity: heuristic.quantity,
                budget_cents: heuristic.budgetCents,
                deadline_seconds: heuristic.deadlineSeconds,
              },
              null,
              2,
            ),
          ].join("\n"),
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse) return heuristic;

    const parsed = IntentToolSchema.safeParse(toolUse.input);
    if (!parsed.success) return heuristic;

    const refined = parsed.data;
    return {
      categories: refined.categories.length > 0 ? refined.categories : heuristic.categories,
      skills: refined.skills.length > 0 ? refined.skills : heuristic.skills,
      region: refined.region ?? heuristic.region,
      locations: refined.locations.length > 0 ? refined.locations : heuristic.locations,
      quantity: refined.quantity ?? heuristic.quantity,
      budgetCents: refined.budget_cents ?? heuristic.budgetCents,
      deadlineSeconds: refined.deadline_seconds ?? heuristic.deadlineSeconds,
      keywords: refined.keywords.length > 0 ? refined.keywords : heuristic.keywords,
      source: "llm",
    };
  } catch {
    // Any failure at all — no key, network, refusal, bad arguments — is a
    // non-event: the heuristic intent is already a complete answer.
    return heuristic;
  }
}

/** True when the Anthropic refinement pass is available in this environment. */
export function canRefineIntent(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export { IntentToolSchema };
