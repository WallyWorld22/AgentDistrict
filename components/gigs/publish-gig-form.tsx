"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  CONTRACT_FIELD_TYPES,
  emptyContractField,
  type ContractFieldDraft,
  type ContractFieldType,
} from "@/lib/data/ext/gigs";
import { PACKAGE_TIERS } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { Inset } from "@/components/feature/panel";
import { publishGigAction } from "@/app/(app)/gigs/actions";

export type PublishGigFormProps = {
  agents: Array<{ handle: string; name: string; category: string }>;
  categories: Array<{ value: string; label: string }>;
  formats: string[];
};

const TIER_DEFAULTS = {
  basic: {
    name: "Starter",
    description: "The core run.",
    price: "0.79",
    delivery: "300",
    features: "Machine-readable output\nDelivery SLA",
  },
  standard: {
    name: "Standard",
    description: "More volume and a QA pass.",
    price: "2.40",
    delivery: "480",
    features: "Everything in Starter\nQA pass\nPriority queue",
  },
  premium: {
    name: "Premium",
    description: "Everything, with a written summary.",
    price: "6.00",
    delivery: "720",
    features: "Everything in Standard\nWritten summary\nOne revision",
  },
} as const;

/**
 * The creator publish flow (BUILD_SPEC §4 `/gigs/new`).
 *
 * The two contract builders are the only real client state: each row is edited
 * in place and the whole array is serialised into one hidden input, so the
 * Server Action gets a shape it can zod-parse without index-aligned FormData
 * (an unchecked "required" box would otherwise shift every later column).
 */
export function PublishGigForm({ agents, categories, formats }: PublishGigFormProps) {
  const [inputFields, setInputFields] = React.useState<ContractFieldDraft[]>([
    {
      name: "brief",
      type: "string",
      required: true,
      description: "What you need, in one paragraph.",
    },
  ]);
  const [outputFields, setOutputFields] = React.useState<ContractFieldDraft[]>([
    {
      name: "result",
      type: "string",
      required: false,
      description: "The delivered artefact.",
    },
  ]);

  return (
    <ActionForm
      action={publishGigAction}
      submitLabel="Publish gig"
      fullWidth
      successToast="Gig published — it is now machine-discoverable."
    >
      <Field label="Agent" htmlFor="gig-agent" required hint="The Passport that delivers it.">
        <Select id="gig-agent" name="agentHandle" defaultValue={agents[0]?.handle}>
          {agents.map((agent) => (
            <option key={agent.handle} value={agent.handle}>
              {agent.name} (@{agent.handle})
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Title"
        htmlFor="gig-title"
        required
        hint="Fiverr convention — start with “I will …”."
      >
        <Input
          id="gig-title"
          name="title"
          required
          minLength={6}
          placeholder="I will find 100 qualified local businesses"
          defaultValue="I will "
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" htmlFor="gig-category" required>
          <Select
            id="gig-category"
            name="category"
            defaultValue={agents[0]?.category ?? categories[0]?.value}
          >
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tags" htmlFor="gig-tags" hint="Comma separated, up to eight.">
          <Input id="gig-tags" name="tags" placeholder="leads, local, csv" />
        </Field>
      </div>

      <Field label="Description" htmlFor="gig-description" required>
        <Textarea
          id="gig-description"
          name="description"
          rows={4}
          required
          minLength={20}
          placeholder="What the buyer gets, how you do it, and what you need from them."
        />
      </Field>

      <fieldset className="m-0 grid gap-3 rounded-[16px] border border-line p-3.5">
        <legend className="px-1 text-[11px] font-extrabold tracking-[0.06em] text-cyan uppercase">
          Input contract
        </legend>
        <Field
          label="Summary"
          htmlFor="gig-input-summary"
          required
          hint="Exactly what the buyer must send."
        >
          <Input
            id="gig-input-summary"
            name="inputSummary"
            required
            minLength={4}
            placeholder="City or county, industry, and how many records you need."
          />
        </Field>
        <ContractBuilder
          legend="Input fields"
          noun="input field"
          fields={inputFields}
          onChange={setInputFields}
          showRequired
        />
        <input type="hidden" name="inputFields" value={JSON.stringify(inputFields)} />
      </fieldset>

      <fieldset className="m-0 grid gap-3 rounded-[16px] border border-line p-3.5">
        <legend className="px-1 text-[11px] font-extrabold tracking-[0.06em] text-cyan uppercase">
          Output contract
        </legend>
        <Field
          label="Summary"
          htmlFor="gig-output-summary"
          required
          hint="Exactly what you return."
        >
          <Input
            id="gig-output-summary"
            name="outputSummary"
            required
            minLength={4}
            placeholder="A CSV with business name, owner, phone, email and website."
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Format" htmlFor="gig-format" required>
            <Select id="gig-format" name="outputFormat" defaultValue="csv">
              {formats.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Volume" htmlFor="gig-volume" hint="Optional, e.g. “100 rows”.">
            <Input id="gig-volume" name="outputVolume" placeholder="100 rows" />
          </Field>
        </div>
        <ContractBuilder
          legend="Output fields"
          noun="output field"
          fields={outputFields}
          onChange={setOutputFields}
        />
        <input type="hidden" name="outputFields" value={JSON.stringify(outputFields)} />
      </fieldset>

      <fieldset className="m-0 grid gap-3 rounded-[16px] border border-line p-3.5">
        <legend className="px-1 text-[11px] font-extrabold tracking-[0.06em] text-cyan uppercase">
          Packages
        </legend>
        <div className="grid gap-3 lg:grid-cols-3">
          {PACKAGE_TIERS.map((tier) => {
            const defaults = TIER_DEFAULTS[tier];
            return (
              <Inset key={tier} className="grid gap-2.5">
                <b className="text-[12px] font-extrabold capitalize">{tier}</b>
                <Field label="Name" htmlFor={`pkg-${tier}-name`} required>
                  <Input
                    id={`pkg-${tier}-name`}
                    name={`${tier}Name`}
                    required
                    defaultValue={defaults.name}
                  />
                </Field>
                <Field label="What it includes" htmlFor={`pkg-${tier}-description`} required>
                  <Input
                    id={`pkg-${tier}-description`}
                    name={`${tier}Description`}
                    required
                    defaultValue={defaults.description}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Price (USD)" htmlFor={`pkg-${tier}-price`} required>
                    <Input
                      id={`pkg-${tier}-price`}
                      name={`${tier}Price`}
                      inputMode="decimal"
                      required
                      defaultValue={defaults.price}
                    />
                  </Field>
                  <Field label="Delivery (s)" htmlFor={`pkg-${tier}-delivery`} required>
                    <Input
                      id={`pkg-${tier}-delivery`}
                      name={`${tier}Delivery`}
                      type="number"
                      min={10}
                      step={10}
                      required
                      defaultValue={defaults.delivery}
                    />
                  </Field>
                </div>
                <Field
                  label="Features"
                  htmlFor={`pkg-${tier}-features`}
                  required
                  hint="One per line."
                >
                  <Textarea
                    id={`pkg-${tier}-features`}
                    name={`${tier}Features`}
                    rows={3}
                    required
                    defaultValue={defaults.features}
                  />
                </Field>
              </Inset>
            );
          })}
        </div>
      </fieldset>
    </ActionForm>
  );
}

/* ------------------------------------------------------------------ builder */

function ContractBuilder({
  legend,
  noun,
  fields,
  onChange,
  showRequired = false,
}: {
  legend: string;
  /** Singular row noun used for the per-control accessible names. */
  noun: string;
  fields: ContractFieldDraft[];
  onChange: (next: ContractFieldDraft[]) => void;
  showRequired?: boolean;
}) {
  function patch(index: number, next: Partial<ContractFieldDraft>) {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...next } : field)));
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-extrabold tracking-[0.08em] text-[#8c9ab2] uppercase">
          {legend}
        </span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-label={`Add ${noun}`}
          onClick={() => onChange([...fields, emptyContractField()])}
        >
          <Plus className="size-3" aria-hidden="true" />
          Add field
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="m-0 text-[11.5px] text-muted">
          No fields yet — a contract with no fields cannot be called by a machine.
        </p>
      ) : (
        <div
          className={cn(
            "hidden px-2.5 text-[10px] font-extrabold tracking-[0.08em] text-[#8c9ab2] uppercase",
            "sm:grid sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1.6fr)_auto] sm:gap-2",
          )}
          aria-hidden="true"
        >
          <span>Name</span>
          <span>Type</span>
          <span>Description</span>
          <span className="w-[104px]" />
        </div>
      )}

      <ul className="m-0 grid list-none gap-2 p-0">
        {fields.map((field, index) => (
          <li
            key={index}
            className={cn(
              "bg-inset-surface grid gap-2 rounded-[13px] border border-[#1c2638] p-2.5",
              "sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1.6fr)_auto] sm:items-center",
            )}
          >
            <Input
              value={field.name}
              inputSize="sm"
              placeholder="Field name"
              aria-label={`${noun} ${index + 1} name`}
              onChange={(event) => patch(index, { name: event.target.value })}
            />
            <Select
              value={field.type}
              aria-label={`${noun} ${index + 1} type`}
              onChange={(event) =>
                patch(index, { type: event.target.value as ContractFieldType })
              }
            >
              {CONTRACT_FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
            <Input
              value={field.description}
              inputSize="sm"
              placeholder="What this field means"
              aria-label={`${noun} ${index + 1} description`}
              onChange={(event) => patch(index, { description: event.target.value })}
            />
            <div className="flex items-center gap-2">
              {showRequired ? (
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => patch(index, { required: event.target.checked })}
                    className="size-4 accent-[#3ea5ff]"
                  />
                  Required
                </label>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${noun} ${index + 1}`}
                onClick={() => onChange(fields.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
