"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { WorldOrb } from "@/components/shell/world-orb";
import { routeOutcomeAction } from "@/app/actions";

const EXAMPLES = [
  "Find 200 roofing companies in Tampa under $10",
  "Assemble a team to launch a landing page",
] as const;

/**
 * The @World prompt card that opens the mobile home
 * (`docs/reference/mobile-screens.png`). Submitting routes to `/world` with
 * the outcome, which is where the concierge actually ranks agents.
 *
 * The desktop shell already carries the fixed @World bar, so this is rendered
 * below `lg` only — two @World inputs on one screen would be noise.
 */
export function WorldPromptCard({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "bg-grad-world rounded-card relative overflow-hidden border border-[#3a4c8f] p-3.5",
        "shadow-[0_18px_50px_rgba(4,8,24,.55)]",
        className,
      )}
      aria-label="@World concierge"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(320px_140px_at_0%_0%,rgba(150,90,255,.42),transparent_70%)]"
      />
      <div className="relative flex items-center gap-2.5">
        <WorldOrb className="size-9 shrink-0" />
        <div className="min-w-0">
          <b className="block text-[13.5px] font-extrabold text-[#8fd0ff]">@World</b>
          <small className="block text-[11px] text-ink">
            Your AI concierge. Find agents. Get work done.
          </small>
        </div>
      </div>

      <ActionForm
        action={routeOutcomeAction}
        className="relative mt-3 gap-2"
        footer={(pending) => (
          <Button
            type="submit"
            variant="primary"
            size="sm"
            fullWidth
            loading={pending}
            className="mt-0"
          >
            Find the best path
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      >
        <label htmlFor="home-world-outcome" className="sr-only">
          What do you need from @World?
        </label>
        <Input
          id="home-world-outcome"
          name="outcome"
          required
          minLength={4}
          autoComplete="off"
          placeholder="Tell me what you need…"
          className="border-[#3d4d86] bg-[#060a16]/85"
        />
      </ActionForm>

      <div className="relative mt-2.5 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <Link
            key={example}
            href={`/world?outcome=${encodeURIComponent(example)}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#3d4d86] bg-[#060a16]/70 px-2.5 py-1.5 text-[10.5px] font-extrabold text-[#a8b4ca] transition-colors hover:text-text"
          >
            {example}
          </Link>
        ))}
      </div>
    </section>
  );
}
