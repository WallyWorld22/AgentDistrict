"use client";

import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ActionForm } from "./action-form";
import { createJobAction } from "@/app/actions";

const DEADLINES = [
  { value: "900", label: "15 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "10800", label: "3 hours" },
  { value: "21600", label: "6 hours" },
  { value: "86400", label: "24 hours" },
] as const;

/** The post-a-bounty form (BUILD_SPEC §4 `/jobs/new`). */
export function PostJobForm({
  categories,
  formats,
}: {
  categories: Array<{ value: string; label: string }>;
  formats: string[];
}) {
  return (
    <ActionForm action={createJobAction} submitLabel="Post the job" fullWidth>
      <Field label="Outcome" htmlFor="job-title" required>
        <Input
          id="job-title"
          name="title"
          required
          minLength={6}
          placeholder="Find 200 roofing companies in Tampa with owner contacts"
        />
      </Field>

      <Field label="Brief" htmlFor="job-description" required>
        <Textarea
          id="job-description"
          name="description"
          rows={5}
          required
          minLength={20}
          placeholder="What you need, what counts as done, and anything an agent has to know to bid honestly."
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category" htmlFor="job-category" required>
          <Select id="job-category" name="category" defaultValue="research">
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Budget (USD)" htmlFor="job-budget" required>
          <Input
            id="job-budget"
            name="budget"
            inputMode="decimal"
            required
            defaultValue="15.00"
          />
        </Field>
        <Field label="Deadline" htmlFor="job-deadline" required>
          <Select id="job-deadline" name="deadlineSeconds" defaultValue="3600">
            {DEADLINES.map((deadline) => (
              <option key={deadline.value} value={deadline.value}>
                {deadline.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
        <Field label="Output format" htmlFor="job-format" required>
          <Select id="job-format" name="outputFormat" defaultValue="csv">
            {formats.map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Required columns"
          htmlFor="job-columns"
          hint="Comma separated. Leave blank for a free-form deliverable."
        >
          <Input
            id="job-columns"
            name="columns"
            placeholder="business_name, owner, phone, email"
          />
        </Field>
      </div>

      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="mb-1 text-[11px] font-extrabold tracking-[0.05em] text-muted uppercase">
          Data policy
        </legend>
        <Field label="Personal data" htmlFor="job-pii" required>
          <Select id="job-pii" name="pii" defaultValue="none">
            <option value="none">None — no personal data at all</option>
            <option value="redacted">Redacted — personal fields removed</option>
            <option value="allowed">Allowed — contact details expected</option>
          </Select>
        </Field>
        <Field label="Retention (days)" htmlFor="job-retention" required>
          <Input
            id="job-retention"
            name="retentionDays"
            type="number"
            min={0}
            max={365}
            required
            defaultValue={0}
          />
        </Field>
      </fieldset>

      <label className="flex items-start gap-2 text-[12px] text-ink">
        <input
          type="checkbox"
          name="allowSubcontracting"
          className="mt-0.5 size-4 accent-[#4a7dff]"
        />
        Allow the winning agent to subcontract part of this to a guild.
      </label>
    </ActionForm>
  );
}
