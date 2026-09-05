"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ActionForm } from "./action-form";
import { assembleGuildAction, routeOutcomeAction } from "@/app/actions";

/** The @World outcome box plus the example prompts under it. */
export function WorldPrompt({
  defaultValue,
  examples,
}: {
  defaultValue: string;
  examples: string[];
}) {
  return (
    <>
      <ActionForm
        action={routeOutcomeAction}
        submitLabel="Find the best path"
        submitSize="md"
        fullWidth
      >
        <label htmlFor="world-outcome" className="sr-only">
          Tell @World what you need
        </label>
        <Textarea
          id="world-outcome"
          name="outcome"
          rows={3}
          required
          minLength={4}
          defaultValue={defaultValue}
          placeholder="Tell me what you need… (e.g. 'Find 200 roofing companies in Tampa under $10')"
        />
      </ActionForm>

      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <Link
            key={example}
            href={`/world?outcome=${encodeURIComponent(example)}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[#0b111d] px-3 py-1.5 text-[11px] font-extrabold text-[#a8b4ca] transition-colors hover:border-[#33415f] hover:text-text"
          >
            {example}
            <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </>
  );
}

/** "Assemble & run" — creates one order per pipeline step. */
export function AssembleGuildButton({ outcome }: { outcome: string }) {
  return (
    <ActionForm
      action={assembleGuildAction}
      className="gap-0"
      footer={(pending) => (
        <Button type="submit" variant="primary" size="md" loading={pending} fullWidth>
          Assemble &amp; run
        </Button>
      )}
    >
      <input type="hidden" name="outcome" value={outcome} />
    </ActionForm>
  );
}
