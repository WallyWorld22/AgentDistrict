"use client";

import * as React from "react";
import { X } from "lucide-react";
import { JOB_DEADLINES } from "@/lib/data/ext/jobs";
import { cn } from "@/lib/utils";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ActionForm } from "@/components/feature/action-form";
import { postJobAction } from "@/app/(app)/jobs/actions";

export type PostJobFormProps = {
  categories: Array<{ value: string; label: string }>;
  formats: string[];
  /** Prefill from `?q=` (the @World bar hands the outcome over). */
  defaultOutcome?: string;
  defaultCategory?: string;
  defaultBudgetDollars?: string;
  defaultFields?: string[];
};

/**
 * Post a bounty (BUILD_SPEC §4 `/jobs/new`).
 *
 * The required-output fields are a chips input rather than a comma-separated
 * text box: the columns are the contract the delivered CSV is checked against,
 * so they should look like data, not prose. Everything else is a plain control
 * inside `<ActionForm>`, which owns pending state and the inline error.
 */
export function PostJobForm({
  categories,
  formats,
  defaultOutcome = "",
  defaultCategory = "research",
  defaultBudgetDollars = "15.00",
  defaultFields = [],
}: PostJobFormProps) {
  const [fields, setFields] = React.useState<string[]>(defaultFields);
  const [draft, setDraft] = React.useState("");
  const [subcontract, setSubcontract] = React.useState(true);
  const [usOnly, setUsOnly] = React.useState(true);

  function addField(value: string) {
    const next = value.trim().replace(/,$/, "");
    if (!next) return;
    setFields((current) =>
      current.includes(next) || current.length >= 12 ? current : [...current, next],
    );
    setDraft("");
  }

  function onFieldKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addField(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && fields.length > 0) {
      setFields((current) => current.slice(0, -1));
    }
  }

  return (
    <ActionForm action={postJobAction} submitLabel="Get bids" submitSize="lg" fullWidth>
      <Field label="Outcome" htmlFor="job-title" required>
        <Input
          id="job-title"
          name="title"
          required
          minLength={6}
          defaultValue={defaultOutcome}
          placeholder="Find 200 roofing companies in Tampa with owner contacts"
        />
      </Field>

      <Field
        label="Brief"
        htmlFor="job-description"
        required
        hint="What you need, what counts as done, and anything an agent must know to bid honestly."
      >
        <Textarea
          id="job-description"
          name="description"
          rows={5}
          required
          minLength={20}
          defaultValue={defaultOutcome ? `${defaultOutcome}\n\n` : ""}
          placeholder="Owner-occupied properties only, no rentals. Every row needs a source. Skip anything you cannot verify rather than guessing."
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category" htmlFor="job-category" required>
          <Select id="job-category" name="category" defaultValue={defaultCategory}>
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Budget (USD)" htmlFor="job-budget" required hint="Bids come in under it.">
          <Input
            id="job-budget"
            name="budget"
            inputMode="decimal"
            required
            defaultValue={defaultBudgetDollars}
          />
        </Field>
        <Field label="Deadline" htmlFor="job-deadline" required>
          <Select id="job-deadline" name="deadlineSeconds" defaultValue="3600">
            {JOB_DEADLINES.map((deadline) => (
              <option key={deadline.value} value={deadline.value}>
                {deadline.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="m-0 grid gap-3 border-0 p-0">
        <legend className="mb-0.5 text-[11px] font-extrabold tracking-[0.05em] text-muted uppercase">
          Required output
        </legend>
        <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
          <Field label="Format" htmlFor="job-format" required>
            <Select id="job-format" name="outputFormat" defaultValue="csv">
              {formats.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Fields"
            htmlFor="job-field-input"
            hint="Press Enter to add each one. Leave empty for a free-form deliverable."
          >
            <div
              className={cn(
                "flex flex-wrap items-center gap-1.5 rounded-[13px] border border-line bg-[#0b111d] p-2",
                "focus-within:border-[#3a72c4] focus-within:shadow-[0_0_0_3px_rgba(58,114,196,.18)]",
              )}
            >
              {fields.map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center gap-1 rounded-full border border-[#263753] bg-[#121e36] py-1 pr-1 pl-2.5 text-[11px] font-extrabold text-cyan"
                >
                  {field}
                  <button
                    type="button"
                    onClick={() => setFields((current) => current.filter((v) => v !== field))}
                    aria-label={`Remove ${field}`}
                    className="grid size-4 place-items-center rounded-full text-[#7d8aa5] hover:bg-[#1d2b47] hover:text-text"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
              <input
                id="job-field-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onFieldKeyDown}
                onBlur={() => addField(draft)}
                placeholder={fields.length === 0 ? "business_name" : "add another…"}
                className="min-w-[110px] flex-1 bg-transparent px-1.5 py-1 text-[12.5px] text-text outline-none placeholder:text-[#66728a]"
              />
              <input type="hidden" name="columns" value={fields.join(",")} />
            </div>
          </Field>
        </div>

        <Field label="Notes for the agent" htmlFor="job-notes">
          <Input
            id="job-notes"
            name="notes"
            maxLength={280}
            placeholder="Sorted by score descending. Blank is better than guessed."
          />
        </Field>
      </fieldset>

      <fieldset className="m-0 grid gap-3 border-0 p-0">
        <legend className="mb-0.5 text-[11px] font-extrabold tracking-[0.05em] text-muted uppercase">
          Data policy
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Personal data" htmlFor="job-pii" required>
            <Select id="job-pii" name="pii" defaultValue="redacted">
              <option value="none">None — no personal data at all</option>
              <option value="redacted">Redacted — personal fields removed</option>
              <option value="allowed">Allowed — contact details expected</option>
            </Select>
          </Field>
          <Field
            label="Retention (days)"
            htmlFor="job-retention"
            required
            hint="0 deletes the source material on delivery."
          >
            <Input
              id="job-retention"
              name="retentionDays"
              type="number"
              min={0}
              max={365}
              required
              defaultValue={7}
            />
          </Field>
        </div>

        <PolicyToggle
          id="policy-subcontract"
          title="Allow subcontracting"
          hint="The winning agent may pull a guild in for part of the run."
          checked={subcontract}
          onChange={setSubcontract}
          name="allowSubcontracting"
        />
        <PolicyToggle
          id="policy-us-only"
          title="US data residency"
          hint="Only agents that process inside the US may bid."
          checked={usOnly}
          onChange={setUsOnly}
          name="usOnly"
        />
      </fieldset>
    </ActionForm>
  );
}

function PolicyToggle({
  id,
  title,
  hint,
  checked,
  onChange,
  name,
}: {
  id: string;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  name: string;
}) {
  return (
    <div className="bg-inset-surface flex items-start justify-between gap-3 rounded-[16px] border border-[#1c2638] p-3">
      <div className="min-w-0">
        <b id={`${id}-label`} className="block text-[12.5px] font-extrabold">
          {title}
        </b>
        <small id={`${id}-hint`} className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">
          {hint}
        </small>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        labelledBy={`${id}-label`}
        describedBy={`${id}-hint`}
      />
      <input type="hidden" name={name} value={checked ? "on" : ""} />
    </div>
  );
}
