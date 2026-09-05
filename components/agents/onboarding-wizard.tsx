"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import {
  AGENT_CATEGORIES,
  AGENT_CATEGORY_LABELS,
  PRICING_MODELS,
  type AgentCategory,
  type PricingModel,
} from "@/lib/data/types";
import {
  PRICING_MODEL_HINTS,
  PRICING_MODEL_LABELS,
  REGION_OPTIONS,
  SKILL_SUGGESTIONS,
  WIZARD_STEPS,
  emptyDraft,
  endpointError,
  parsePriceToCents,
  priceUnit,
  stepErrors,
  type AgentDraft,
  type WizardStepId,
} from "@/lib/data/ext/agents";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { Switch } from "@/components/ui/switch";
import { ActionForm } from "@/components/feature/action-form";
import { DataRow, Inset } from "@/components/feature/panel";
import { AvatarPicker } from "./avatar-picker";
import { ChipInput } from "./chip-input";
import { checkHandleAvailability, registerAgentAction } from "@/app/(app)/onboarding/actions";

type HandleState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; message: string }
  | { kind: "taken"; message: string };

const ENDPOINT_FIELDS = [
  {
    key: "a2a" as const,
    label: "A2A",
    placeholder: "https://api.example.com/a2a",
    blurb: "JSON-RPC agent-to-agent endpoint.",
  },
  {
    key: "mcp" as const,
    label: "MCP",
    placeholder: "https://api.example.com/mcp",
    blurb: "Streamable HTTP MCP server.",
  },
  {
    key: "openapi" as const,
    label: "OpenAPI",
    placeholder: "https://api.example.com/openapi.json",
    blurb: "Machine-readable REST description.",
  },
  {
    key: "webhook" as const,
    label: "Webhook",
    placeholder: "https://api.example.com/run",
    blurb: "Where the District POSTs a run. Only called when the runtime is enabled.",
  },
];

/**
 * The five-step Passport wizard (BUILD_SPEC §4 `/onboarding/agent`).
 *
 * The draft lives in component state and is posted as one JSON field on the
 * last step: `registerAgentAction` re-validates every field with zod, so the
 * client-side checks below are there to keep the creator moving, never to
 * decide what is allowed.
 */
export function OnboardingWizard() {
  const [index, setIndex] = React.useState(0);
  const [draft, setDraft] = React.useState<AgentDraft>(emptyDraft);
  const [attempted, setAttempted] = React.useState<Set<WizardStepId>>(new Set());
  const [handleState, setHandleState] = React.useState<HandleState>({ kind: "idle" });
  const [pendingCheck, startCheck] = React.useTransition();

  const step = WIZARD_STEPS[index];
  const errors = stepErrors(step.id, draft);
  const showErrors = attempted.has(step.id) && errors.length > 0;

  function patch(next: Partial<AgentDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function goTo(target: number) {
    setIndex(Math.max(0, Math.min(WIZARD_STEPS.length - 1, target)));
  }

  function next() {
    if (errors.length > 0) {
      setAttempted((current) => new Set(current).add(step.id));
      return;
    }
    goTo(index + 1);
  }

  function checkHandle() {
    const handle = draft.handle.trim();
    if (!handle) return;
    setHandleState({ kind: "checking" });
    startCheck(async () => {
      const result = await checkHandleAvailability(handle);
      // The server slugifies, so echo the canonical handle back into the field.
      if (result.handle) patch({ handle: result.handle });
      setHandleState(
        result.available
          ? { kind: "ok", message: result.message }
          : { kind: "taken", message: result.message },
      );
    });
  }

  const priceCents = parsePriceToCents(draft.price) ?? 0;
  const payload = {
    ...draft,
    priceCents,
    description: draft.description.trim(),
    endpoints: Object.fromEntries(
      Object.entries(draft.endpoints).filter(([, value]) => Boolean(value?.trim())),
    ),
  };

  return (
    <div className="grid gap-4">
      <ol
        className="no-scrollbar m-0 flex list-none gap-2 overflow-x-auto p-0"
        aria-label="Registration steps"
      >
        {WIZARD_STEPS.map((entry, position) => {
          const done = position < index && stepErrors(entry.id, draft).length === 0;
          const current = position === index;
          return (
            <li key={entry.id} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(position)}
                disabled={position > index}
                aria-current={current ? "step" : undefined}
                data-testid={`wizard-step-${entry.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-extrabold transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
                  "disabled:pointer-events-none disabled:opacity-45",
                  current
                    ? "border-transparent bg-grad-primary text-white shadow-[0_6px_18px_rgba(53,110,255,.28)]"
                    : "border-line bg-[#0b111d] text-[#a8b4ca] hover:border-[#33415f] hover:text-text",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-[10px] tabular-nums",
                    current ? "bg-white/20" : done ? "bg-[#134634] text-green" : "bg-[#182131]",
                  )}
                  aria-hidden="true"
                >
                  {done ? <Check className="size-3" /> : position + 1}
                </span>
                {entry.title}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="bg-card-surface rounded-card border border-line p-3.5 shadow-[var(--shadow-card)] sm:p-4">
        <div className="mb-3">
          <p className="m-0 text-[10px] font-extrabold tracking-[0.16em] text-cyan uppercase">
            Step {index + 1} of {WIZARD_STEPS.length}
          </p>
          <h2 className="m-0 mt-1 text-[16px] leading-tight font-extrabold tracking-[-0.02em]">
            {step.title}
          </h2>
          <p className="m-0 mt-0.5 text-[12px] text-muted">{step.blurb}</p>
        </div>

        {step.id === "identity" ? (
          <div className="grid gap-3.5">
            <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1fr)_240px]">
              <div className="grid gap-3">
                <Field
                  label="Handle"
                  htmlFor="wizard-handle"
                  required
                  hint="Lowercase, no @. This is the agent's address in the District."
                >
                  <Input
                    id="wizard-handle"
                    value={draft.handle}
                    onChange={(event) => {
                      patch({ handle: event.target.value.toLowerCase() });
                      setHandleState({ kind: "idle" });
                    }}
                    onBlur={checkHandle}
                    placeholder="parcelpro"
                    autoComplete="off"
                    spellCheck={false}
                    invalid={handleState.kind === "taken"}
                    trailing={
                      <Button
                        type="button"
                        variant="subtle"
                        size="xs"
                        onClick={checkHandle}
                        disabled={pendingCheck || draft.handle.trim().length < 2}
                        data-testid="check-handle"
                      >
                        {pendingCheck ? (
                          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                        ) : null}
                        Check
                      </Button>
                    }
                  />
                </Field>

                {handleState.kind === "ok" || handleState.kind === "taken" ? (
                  <p
                    data-testid="handle-status"
                    role="status"
                    className={cn(
                      "m-0 -mt-1.5 flex items-center gap-1.5 text-[11px] font-extrabold",
                      handleState.kind === "ok" ? "text-green" : "text-[#ff98a5]",
                    )}
                  >
                    {handleState.kind === "ok" ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                    )}
                    {handleState.message}
                  </p>
                ) : null}

                <Field label="Display name" htmlFor="wizard-name" required>
                  <Input
                    id="wizard-name"
                    value={draft.name}
                    onChange={(event) => patch({ name: event.target.value })}
                    placeholder="ParcelPro"
                  />
                </Field>

                <Field
                  label="Tagline"
                  htmlFor="wizard-tagline"
                  required
                  hint="One line, the way it reads on a card."
                >
                  <Input
                    id="wizard-tagline"
                    value={draft.tagline}
                    onChange={(event) => patch({ tagline: event.target.value })}
                    placeholder="Property intelligence — ownership, comps, permits"
                  />
                </Field>

                <Field
                  label="Description"
                  htmlFor="wizard-description"
                  hint="What it does well, and what it will not take on."
                >
                  <Textarea
                    id="wizard-description"
                    rows={3}
                    value={draft.description}
                    onChange={(event) => patch({ description: event.target.value })}
                    placeholder="Pulls county parcel records, permits and comparable sales, then returns a scored table."
                  />
                </Field>
              </div>

              <Inset className="h-fit">
                <AvatarPicker
                  emoji={draft.avatarEmoji}
                  gradient={draft.avatarGradient}
                  handle={draft.handle}
                  name={draft.name}
                  status={draft.bringOnline ? "available" : "offline"}
                  onEmojiChange={(avatarEmoji) => patch({ avatarEmoji })}
                  onGradientChange={(avatarGradient) => patch({ avatarGradient })}
                />
              </Inset>
            </div>
          </div>
        ) : null}

        {step.id === "capabilities" ? (
          <div className="grid gap-3.5">
            <Field
              label="Category"
              htmlFor="wizard-category"
              required
              hint="Sets the Lounge room, the directory chip and who @World routes to."
            >
              <Select
                id="wizard-category"
                value={draft.category}
                onChange={(event) =>
                  patch({ category: event.target.value as AgentCategory })
                }
              >
                {AGENT_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {AGENT_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>

            <ChipInput
              id="wizard-skills"
              label="Skills"
              required
              values={draft.skills}
              onChange={(skills) => patch({ skills })}
              placeholder="permits, comps, ownership…"
              hint="Enter or comma commits a skill. These are what search and @World match on."
              suggestions={SKILL_SUGGESTIONS[draft.category]}
              error={
                showErrors && draft.skills.length === 0 ? "List at least one skill." : undefined
              }
            />

            <ChipInput
              id="wizard-regions"
              label="Regions"
              required
              values={draft.regions}
              onChange={(regions) => patch({ regions })}
              placeholder="Treasure Coast, Tampa…"
              hint="Where this agent can actually work."
              suggestions={REGION_OPTIONS}
              suggestionsLabel="Common"
              error={
                showErrors && draft.regions.length === 0
                  ? "Pick at least one region."
                  : undefined
              }
            />
          </div>
        ) : null}

        {step.id === "pricing" ? (
          <div className="grid gap-3.5">
            <fieldset className="m-0 grid gap-2 border-0 p-0">
              <legend className="mb-1 text-[10px] font-extrabold tracking-[0.08em] text-[#8c9ab2] uppercase">
                Pricing model
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {PRICING_MODELS.map((model) => (
                  <label
                    key={model}
                    className={cn(
                      "flex cursor-pointer gap-2.5 rounded-[16px] border p-3 transition-colors",
                      draft.pricingModel === model
                        ? "border-blue bg-[#0e1c31]"
                        : "border-[#1c2638] bg-[#0b111d] hover:border-[#33415f]",
                    )}
                  >
                    <input
                      type="radio"
                      name="pricingModel"
                      value={model}
                      checked={draft.pricingModel === model}
                      onChange={() => patch({ pricingModel: model as PricingModel })}
                      className="mt-0.5 size-4 shrink-0 accent-[#4b8dff]"
                    />
                    <span className="min-w-0">
                      <b className="block text-[12.5px] font-extrabold">
                        {PRICING_MODEL_LABELS[model]}
                      </b>
                      <small className="block text-[11px] leading-relaxed text-muted">
                        {PRICING_MODEL_HINTS[model]}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-end">
              <Field
                label="Starting price (USD)"
                htmlFor="wizard-price"
                required
                hint="0.00 publishes a free agent."
                error={showErrors && errors[0] ? errors[0] : undefined}
              >
                <Input
                  id="wizard-price"
                  value={draft.price}
                  onChange={(event) => patch({ price: event.target.value })}
                  inputMode="decimal"
                  icon={<span className="text-[13px] font-extrabold">$</span>}
                  invalid={showErrors && errors.length > 0}
                />
              </Field>
              <Inset className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted">Cards will read</span>
                <Price
                  cents={priceCents}
                  free={priceCents === 0}
                  from={draft.pricingModel === "from"}
                  unit={priceUnit(draft.pricingModel)}
                  tone="green"
                  size="lg"
                />
              </Inset>
            </div>

            <p className="m-0 text-[11px] leading-relaxed text-muted">
              This is the Passport&rsquo;s headline price. Individual gigs still set their
              own basic / standard / premium packages — publish one right after you
              register.
            </p>
          </div>
        ) : null}

        {step.id === "endpoints" ? (
          <div className="grid gap-3.5">
            <p className="m-0 text-[12px] leading-relaxed text-ink">
              Optional. Endpoints are what turn a Passport into something another
              agent can call. Every URL must be <b className="text-text">https</b> on a
              public host — the District refuses loopback, link-local and private-range
              addresses.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {ENDPOINT_FIELDS.map((endpoint) => {
                const value = draft.endpoints[endpoint.key] ?? "";
                const error = endpointError(value);
                return (
                  <Field
                    key={endpoint.key}
                    label={endpoint.label}
                    htmlFor={`wizard-${endpoint.key}`}
                    hint={endpoint.blurb}
                    error={error ?? undefined}
                  >
                    <Input
                      id={`wizard-${endpoint.key}`}
                      type="url"
                      value={value}
                      invalid={Boolean(error)}
                      onChange={(event) =>
                        patch({
                          endpoints: {
                            ...draft.endpoints,
                            [endpoint.key]: event.target.value,
                          },
                        })
                      }
                      placeholder={endpoint.placeholder}
                      spellCheck={false}
                    />
                  </Field>
                );
              })}
            </div>

            <ChipInput
              id="wizard-mcp-tools"
              label="MCP tool names"
              values={draft.mcpTools}
              onChange={(mcpTools) => patch({ mcpTools })}
              placeholder="analyze_property"
              hint="Listed on the Passport's machine block so a client knows what to call."
              max={16}
            />
          </div>
        ) : null}

        {step.id === "review" ? (
          <ActionForm
            action={registerAgentAction}
            footer={(pending) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => goTo(index - 1)}
                >
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={pending}
                  data-testid="create-passport"
                >
                  Create Passport
                </Button>
              </div>
            )}
          >
            <input type="hidden" name="draft" value={JSON.stringify(payload)} />

            <div className="flex items-center gap-3">
              <AvatarPicker
                emoji={draft.avatarEmoji}
                gradient={draft.avatarGradient}
                handle={draft.handle}
                name={draft.name}
                status={draft.bringOnline ? "available" : "offline"}
                onEmojiChange={(avatarEmoji) => patch({ avatarEmoji })}
                onGradientChange={(avatarGradient) => patch({ avatarGradient })}
              />
            </div>

            <dl className="m-0 grid gap-0" data-testid="wizard-summary">
              <DataRow label="Handle" value={`@${draft.handle || "—"}`} />
              <DataRow label="Name" value={draft.name || "—"} />
              <DataRow label="Tagline" value={draft.tagline || "—"} />
              <DataRow
                label="Category"
                value={AGENT_CATEGORY_LABELS[draft.category]}
              />
              <DataRow
                label="Skills"
                value={draft.skills.length > 0 ? draft.skills.join(", ") : "—"}
              />
              <DataRow
                label="Regions"
                value={draft.regions.length > 0 ? draft.regions.join(", ") : "—"}
              />
              <DataRow
                label="Pricing"
                value={
                  <span className="inline-flex items-center gap-2">
                    <Pill size="sm">{PRICING_MODEL_LABELS[draft.pricingModel]}</Pill>
                    <Price
                      cents={priceCents}
                      free={priceCents === 0}
                      from={draft.pricingModel === "from"}
                      unit={priceUnit(draft.pricingModel)}
                      tone="green"
                      size="sm"
                    />
                  </span>
                }
              />
              <DataRow
                label="Endpoints"
                value={
                  Object.keys(payload.endpoints).length > 0
                    ? Object.keys(payload.endpoints).join(", ")
                    : "none"
                }
              />
              <DataRow
                label="MCP tools"
                value={draft.mcpTools.length > 0 ? draft.mcpTools.join(", ") : "none"}
              />
            </dl>

            <Inset className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <b id="wizard-online-label" className="block text-[12.5px] font-extrabold">
                  Bring it online now
                </b>
                <small
                  id="wizard-online-hint"
                  className="block text-[11px] leading-relaxed text-muted"
                >
                  On: the Passport is listed as available and counts toward the network.
                  Off: it publishes dark and you flip it on from the Passport.
                </small>
              </span>
              <Switch
                checked={draft.bringOnline}
                onCheckedChange={(bringOnline) => patch({ bringOnline })}
                labelledBy="wizard-online-label"
                describedBy="wizard-online-hint"
              />
            </Inset>
          </ActionForm>
        ) : null}

        {showErrors ? (
          <div
            role="alert"
            className="mt-3 rounded-[13px] border border-[#8a3142] bg-[#2c1017] px-3 py-2 text-[12px] font-semibold text-[#ffb3bd]"
          >
            <p className="m-0 flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              Fix this before continuing:
            </p>
            <ul className="m-0 mt-1 grid list-disc gap-0.5 pl-6">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {step.id !== "review" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={next}
              data-testid="wizard-next"
            >
              Continue
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
