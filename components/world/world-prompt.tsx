"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { askWorldAction } from "@/app/(app)/world/actions";

export type WorldPromptProps = {
  defaultValue: string;
  examples: string[];
};

/**
 * The @World outcome box.
 *
 * Routing is a GET — the answer lives at `/world?outcome=…` so it can be shared
 * and reloaded — so this only has to collect the sentence and submit it. The
 * example chips are plain links to the same URL, which is why they work with
 * JavaScript off and why the shell's @World bar can hand an outcome straight in.
 */
export function WorldPrompt({ defaultValue, examples }: WorldPromptProps) {
  const [value, setValue] = React.useState(defaultValue);

  return (
    <div className="grid gap-3">
      <ActionForm
        action={askWorldAction}
        className="gap-2"
        footer={(pending) => (
          <Button type="submit" variant="primary" size="lg" loading={pending} fullWidth>
            <Sparkles className="size-4" aria-hidden="true" />
            {pending ? "Routing…" : "Find the best path"}
          </Button>
        )}
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
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Tell me what you need… (e.g. 'Find 200 roofing companies in Tampa under $10')"
          className="text-[14px]"
        />
      </ActionForm>

      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <Link
            key={example}
            href={`/world?outcome=${encodeURIComponent(example)}`}
            onClick={() => setValue(example)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[#0b111d] px-3 py-1.5 text-[11px] font-extrabold text-[#a8b4ca] transition-colors hover:border-[#33415f] hover:text-text"
          >
            {example}
            <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
