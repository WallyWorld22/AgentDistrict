import { emptyDraft, type AgentDraft } from "@/lib/data/ext/agents";

/**
 * The wizard's draft, kept in this browser between visits.
 *
 * A creator whose session ran out mid-wizard used to lose all five steps the
 * moment they went off to sign in (agents-identity-01). The draft is saved
 * here as it changes and read back on the next visit, and cleared once the
 * Passport is created. It never leaves the browser and holds nothing secret:
 * the same fields the creator typed into a public listing.
 */
export const ONBOARDING_DRAFT_KEY = "agentdistrict:onboarding-draft";

type Stored = { draft: AgentDraft; step: number };

function sameShape(value: unknown, template: unknown): boolean {
  if (Array.isArray(template)) {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
  }
  if (template !== null && typeof template === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  return typeof value === typeof template;
}

/**
 * Read a stored draft back, or `null`.
 *
 * Whatever is in storage is treated as untrusted: unknown keys are dropped, a
 * field of the wrong type falls back to the empty draft's value, and the server
 * re-validates everything on submit anyway.
 */
export function parseStoredDraft(raw: string | null, stepCount: number): Stored | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { draft, step } = parsed as { draft?: unknown; step?: unknown };
  if (!draft || typeof draft !== "object") return null;

  const base = emptyDraft();
  const restored = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(base) as Array<keyof AgentDraft>) {
    const value = (draft as Record<string, unknown>)[key];
    if (value !== undefined && sameShape(value, base[key])) restored[key] = value;
  }
  if (restored.endpoints && typeof restored.endpoints === "object") {
    restored.endpoints = Object.fromEntries(
      Object.entries(restored.endpoints as Record<string, unknown>).filter(
        ([, value]) => typeof value === "string",
      ),
    );
  }
  const safeStep =
    typeof step === "number" && Number.isInteger(step)
      ? Math.max(0, Math.min(stepCount - 1, step))
      : 0;
  return { draft: restored as AgentDraft, step: safeStep };
}

export function loadDraft(stepCount: number): Stored | null {
  try {
    return parseStoredDraft(window.localStorage.getItem(ONBOARDING_DRAFT_KEY), stepCount);
  } catch {
    return null;
  }
}

export function saveDraft(draft: AgentDraft, step: number): void {
  try {
    window.localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ draft, step }));
  } catch {
    // Private mode or full storage: the wizard still works, it just forgets.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}
