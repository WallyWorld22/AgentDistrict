// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server Actions turn a form into `{ ok: false, message }`, and the message is
 * shown verbatim. These pin that a mistyped number comes back as a sentence
 * naming the field, never zod's own "Invalid input: expected number, received
 * NaN" or "Too big: expected number to be <=10000000" (audit findings
 * gigs-orders-09, jobs-07, economy-11, agents-identity-08).
 */
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { publishGigAction } from "@/app/(app)/gigs/actions";
import { placeBidAction, postJobAction } from "@/app/(app)/jobs/actions";
import { registerAgentAction } from "@/app/(app)/onboarding/actions";
import { updateSpendPolicyAction } from "@/app/(app)/wallet/actions";
import { topUpAction } from "@/app/actions";
import { resetRepoForTests } from "@/lib/data";
import {
  MAX_STARTING_PRICE_CENTS,
  emptyDraft,
  parsePriceToCents,
  stepErrors,
} from "@/lib/data/ext/agents";
import { parseDollarsToCents } from "@/lib/utils";

beforeEach(() => resetRepoForTests());
afterEach(() => resetRepoForTests());

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** Zod's default wording, which must never reach a visitor. */
const RAW_ZOD = /Invalid input|expected number|received NaN|Too big|Too small|expected int/i;

function message(result: unknown): string {
  expect(result).toMatchObject({ ok: false });
  const text = (result as { message: string }).message;
  expect(text).not.toMatch(RAW_ZOD);
  return text;
}

describe("parseDollarsToCents", () => {
  it("reads plain dollar amounts", () => {
    expect(parseDollarsToCents("0.79")).toBe(79);
    expect(parseDollarsToCents("$1,250.50")).toBe(125050);
    expect(parseDollarsToCents(" 12 ")).toBe(1200);
    expect(parseDollarsToCents(".5")).toBe(50);
    expect(parseDollarsToCents("7.")).toBe(700);
    expect(parseDollarsToCents("1.10")).toBe(110);
    expect(parseDollarsToCents("-3")).toBe(-300);
    expect(Object.is(parseDollarsToCents("-0"), 0)).toBe(true);
  });

  it("refuses what parseFloat used to wave through", () => {
    for (const bad of ["", "abc", "12abc", "1e9", "1.234", "0x10", "Infinity", "1.2.3", "--1"]) {
      expect(parseDollarsToCents(bad), bad).toBeNull();
    }
    expect(parseDollarsToCents("9".repeat(30))).toBeNull();
  });
});

describe("the onboarding wizard's starting price (agents-identity-08)", () => {
  it("rejects loose input instead of reading a number out of it", () => {
    expect(parsePriceToCents("12abc")).toBeNull();
    expect(parsePriceToCents("1e9")).toBeNull();
    expect(parsePriceToCents("1.234")).toBeNull();
    expect(parsePriceToCents("-1")).toBeNull();
    expect(parsePriceToCents("0.25")).toBe(25);
  });

  it("blocks the pricing step with a plain message, including over the ceiling", () => {
    const draft = emptyDraft();
    expect(stepErrors("pricing", { ...draft, price: "12abc" })).toEqual([
      "Enter the starting price in dollars, like 0.25, or 0.00 for a free agent.",
    ]);
    expect(stepErrors("pricing", { ...draft, price: "100000.01" })).toEqual([
      "Keep the starting price at or under $100,000.00.",
    ]);
    expect(stepErrors("pricing", { ...draft, price: "100000" })).toEqual([]);
  });

  it("words the server's ceiling the same way", async () => {
    const draft = {
      handle: "price-ceiling-bot",
      name: "Ceiling Bot",
      tagline: "Tests the price ceiling",
      category: "research",
      skills: ["tests"],
      regions: ["US"],
      pricingModel: "per_run",
      priceCents: MAX_STARTING_PRICE_CENTS + 1,
    };
    const result = await registerAgentAction(null, form({ draft: JSON.stringify(draft) }));
    expect(message(result)).toBe("Keep the starting price at or under $100,000.00.");

    const nan = await registerAgentAction(
      null,
      form({ draft: JSON.stringify({ ...draft, priceCents: "abc" }) }),
    );
    expect(message(nan)).toBe("Enter the starting price in dollars, like 0.25.");
  });
});

describe("bounties and bids (jobs-07)", () => {
  const job = {
    title: "Find 50 roofers in Tampa",
    description: "A CSV of roofing companies with phone numbers and websites.",
    category: "research",
    deadlineSeconds: "3600",
    outputFormat: "csv",
    pii: "redacted",
    retentionDays: "7",
  };

  it("a non-numeric budget names the budget", async () => {
    for (const budget of ["abc", "12abc", "1e9"]) {
      const result = await postJobAction(null, form({ ...job, budget }));
      expect(message(result)).toBe("Enter the budget in dollars, like 25.00.");
    }
  });

  it("a bad retention says what is allowed", async () => {
    const result = await postJobAction(null, form({ ...job, budget: "25", retentionDays: "999" }));
    expect(message(result)).toBe("Retention tops out at 365 days.");
  });

  it("a non-numeric bid names the price", async () => {
    const result = await placeBidAction(
      null,
      form({
        jobId: "job-1",
        agentHandle: "scout",
        amount: "abc",
        etaSeconds: "900",
        note: "I would do it well.",
      }),
    );
    expect(message(result)).toBe("Enter your price in dollars, like 4.50.");
  });
});

describe("the spend policy and top-up (economy-11)", () => {
  it("a non-numeric threshold or limit names the field", async () => {
    expect(
      message(await updateSpendPolicyAction(null, form({ threshold: "abc", dailyLimit: "10" }))),
    ).toBe("Enter the approval threshold in dollars, like 5.00.");
    expect(
      message(await updateSpendPolicyAction(null, form({ threshold: "5", dailyLimit: "ten" }))),
    ).toBe("Enter the autonomous daily limit in dollars, like 25.00.");
  });

  it("a top-up of '12abc' is refused, not read as $12", async () => {
    expect(message(await topUpAction(null, form({ amount: "12abc" })))).toBe(
      "Enter an amount in dollars, like 10.00.",
    );
  });
});

describe("publishing a gig (gigs-orders-09)", () => {
  const tier = (prefix: string, price: string, delivery: string) => ({
    [`${prefix}Name`]: `${prefix} plan`,
    [`${prefix}Description`]: "The core run.",
    [`${prefix}Price`]: price,
    [`${prefix}Delivery`]: delivery,
    [`${prefix}Features`]: "CSV output",
  });
  const gig = (overrides: Record<string, string>) => ({
    agentHandle: "scout",
    title: "I will find 100 local businesses",
    description: "A clean CSV of local businesses with phone numbers and sites.",
    category: "research",
    tags: "leads",
    inputSummary: "The city and niche.",
    inputFields: JSON.stringify([
      { name: "brief", type: "string", required: true, description: "What you need." },
    ]),
    outputSummary: "A CSV of businesses.",
    outputFormat: "csv",
    outputFields: JSON.stringify([
      { name: "result", type: "string", required: false, description: "The rows." },
    ]),
    ...tier("basic", "0.79", "300"),
    ...tier("standard", "2.40", "480"),
    ...tier("premium", "6.00", "720"),
    ...overrides,
  });

  it("a non-numeric package price names the price", async () => {
    const result = await publishGigAction(null, form(gig({ standardPrice: "abc" })));
    expect(message(result)).toBe("Enter each package price in dollars, like 2.40.");
  });

  it("an over-long delivery time says the ceiling in words", async () => {
    const result = await publishGigAction(null, form(gig({ premiumDelivery: "99999999" })));
    expect(message(result)).toBe("Delivery times top out at 30 days (2,592,000 seconds).");
  });

  it("a non-numeric delivery time names the field", async () => {
    const result = await publishGigAction(null, form(gig({ basicDelivery: "soon" })));
    expect(message(result)).toBe("Enter each delivery time as a whole number of seconds.");
  });
});
