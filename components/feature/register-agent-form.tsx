"use client";

import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ActionForm } from "./action-form";
import { createAgentAction } from "@/app/actions";

const PRICING_LABELS: Record<string, string> = {
  per_run: "Per run",
  per_job: "Per job",
  per_hour: "Per hour",
  from: "Starting from",
};

/** Creator onboarding (BUILD_SPEC §4 `/onboarding/agent`). */
export function RegisterAgentForm({
  categories,
  pricingModels,
}: {
  categories: Array<{ value: string; label: string }>;
  pricingModels: string[];
}) {
  return (
    <ActionForm action={createAgentAction} submitLabel="Create Passport" fullWidth>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px]">
        <Field label="Handle" htmlFor="agent-handle" required hint="Lowercase, no @.">
          <Input id="agent-handle" name="handle" required minLength={2} placeholder="parcelpro" />
        </Field>
        <Field label="Name" htmlFor="agent-name" required>
          <Input id="agent-name" name="name" required minLength={2} placeholder="ParcelPro" />
        </Field>
        <Field label="Emoji" htmlFor="agent-emoji">
          <Input id="agent-emoji" name="avatarEmoji" maxLength={4} placeholder="📍" />
        </Field>
      </div>

      <Field label="Tagline" htmlFor="agent-tagline" required>
        <Input
          id="agent-tagline"
          name="tagline"
          required
          minLength={6}
          placeholder="Property intelligence — ownership, comps, permits"
        />
      </Field>

      <Field label="Description" htmlFor="agent-description">
        <Textarea
          id="agent-description"
          name="description"
          rows={3}
          placeholder="What this agent does well, and what it will not take on."
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" htmlFor="agent-category" required>
          <Select id="agent-category" name="category" defaultValue="research">
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Regions" htmlFor="agent-regions" hint="Comma separated.">
          <Input id="agent-regions" name="regions" defaultValue="US" placeholder="FL, US" />
        </Field>
      </div>

      <Field label="Skills" htmlFor="agent-skills" required hint="Comma separated.">
        <Input
          id="agent-skills"
          name="skills"
          required
          placeholder="property data, permits, comps"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pricing model" htmlFor="agent-pricing" required>
          <Select id="agent-pricing" name="pricingModel" defaultValue="per_run">
            {pricingModels.map((model) => (
              <option key={model} value={model}>
                {PRICING_LABELS[model] ?? model}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Starting price (USD)" htmlFor="agent-price" required>
          <Input
            id="agent-price"
            name="price"
            inputMode="decimal"
            required
            defaultValue="0.42"
          />
        </Field>
      </div>

      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="mb-1 text-[11px] font-extrabold tracking-[0.05em] text-muted uppercase">
          Endpoints (optional, https only)
        </legend>
        <Field label="A2A" htmlFor="agent-a2a">
          <Input id="agent-a2a" name="a2a" type="url" placeholder="https://…/a2a" />
        </Field>
        <Field label="MCP" htmlFor="agent-mcp">
          <Input id="agent-mcp" name="mcp" type="url" placeholder="https://…/mcp" />
        </Field>
        <Field label="OpenAPI" htmlFor="agent-openapi">
          <Input
            id="agent-openapi"
            name="openapi"
            type="url"
            placeholder="https://…/openapi.json"
          />
        </Field>
        <Field label="Webhook" htmlFor="agent-webhook">
          <Input
            id="agent-webhook"
            name="webhook"
            type="url"
            placeholder="https://…/run"
          />
        </Field>
      </fieldset>
    </ActionForm>
  );
}
