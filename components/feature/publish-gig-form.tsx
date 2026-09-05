"use client";

import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ActionForm } from "./action-form";
import { createGigAction } from "@/app/actions";

export type PublishGigFormProps = {
  agents: Array<{ handle: string; name: string; category: string }>;
  categories: Array<{ value: string; label: string }>;
  formats: string[];
};

/** The creator publish flow (BUILD_SPEC §4 `/gigs/new`). */
export function PublishGigForm({ agents, categories, formats }: PublishGigFormProps) {
  return (
    <ActionForm action={createGigAction} submitLabel="Publish gig" fullWidth>
      <Field label="Agent" htmlFor="gig-agent" required hint="The Passport that delivers it.">
        <Select id="gig-agent" name="agentHandle" defaultValue={agents[0]?.handle}>
          {agents.map((agent) => (
            <option key={agent.handle} value={agent.handle}>
              {agent.name} (@{agent.handle})
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Title" htmlFor="gig-title" required>
        <Input
          id="gig-title"
          name="title"
          required
          minLength={6}
          placeholder="I'll find 100 qualified local businesses"
        />
      </Field>

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
        <Field label="Tags" htmlFor="gig-tags" hint="Comma separated.">
          <Input id="gig-tags" name="tags" placeholder="leads, local, csv" />
        </Field>
      </div>

      <Field
        label="Input contract"
        htmlFor="gig-input"
        required
        hint="Exactly what the buyer must send."
      >
        <Input
          id="gig-input"
          name="inputSummary"
          required
          minLength={4}
          placeholder="City or county, industry, and how many records you need."
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
        <Field
          label="Output contract"
          htmlFor="gig-output"
          required
          hint="Exactly what you return."
        >
          <Input
            id="gig-output"
            name="outputSummary"
            required
            minLength={4}
            placeholder="A CSV with business name, owner, phone, email and website."
          />
        </Field>
        <Field label="Format" htmlFor="gig-format" required>
          <Select id="gig-format" name="outputFormat" defaultValue="csv">
            {formats.map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-3">
        <legend className="mb-1 text-[11px] font-extrabold tracking-[0.05em] text-muted uppercase">
          Package prices (USD)
        </legend>
        <Field label="Basic" htmlFor="gig-basic" required>
          <Input
            id="gig-basic"
            name="basicPrice"
            inputMode="decimal"
            required
            defaultValue="0.79"
          />
        </Field>
        <Field label="Standard" htmlFor="gig-standard" required>
          <Input
            id="gig-standard"
            name="standardPrice"
            inputMode="decimal"
            required
            defaultValue="2.40"
          />
        </Field>
        <Field label="Premium" htmlFor="gig-premium" required>
          <Input
            id="gig-premium"
            name="premiumPrice"
            inputMode="decimal"
            required
            defaultValue="6.00"
          />
        </Field>
      </fieldset>

      <Field
        label="Basic delivery time"
        htmlFor="gig-delivery"
        required
        hint="Seconds. Standard and Premium scale from this."
      >
        <Input
          id="gig-delivery"
          name="deliverySeconds"
          type="number"
          min={30}
          step={30}
          required
          defaultValue={300}
        />
      </Field>
    </ActionForm>
  );
}
