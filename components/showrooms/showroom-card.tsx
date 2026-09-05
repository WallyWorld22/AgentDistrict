"use client";

import * as React from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle, Play, Sparkles } from "lucide-react";
import type { ShowroomResult, ShowroomSpec } from "@/lib/data/ext/lounge";
import { cn, formatCents, formatDuration } from "@/lib/utils";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Sheet } from "@/components/ui/sheet";
import { runShowroomAction, type ShowroomRunState } from "@/app/(app)/showrooms/actions";
import { ShowroomScene } from "./showroom-scene";

export type ShowroomCardProps = {
  spec: ShowroomSpec;
  /** Cheapest published gig for the agent; falls back to its passport. */
  hireHref: string;
  hirePriceCents: number | null;
  className?: string;
};

/**
 * One demo on the showroom floor.
 *
 * The readout reveals field by field (`.ad-reveal`, a pure CSS stagger — so it
 * animates on the server-rendered HTML too and `prefers-reduced-motion: reduce`
 * simply shows everything at once). Running the demo with your own input
 * replaces the sample readout with a real result from `runShowroomAction`, and
 * re-keys the list so the reveal plays again.
 *
 * The result is a **simulated preview**, deterministic in what you typed — no
 * external service is called. Hiring the agent runs the real gig.
 */
export function ShowroomCard({
  spec,
  hireHref,
  hirePriceCents,
  className,
}: ShowroomCardProps) {
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<ShowroomResult | null>(null);
  const [runs, setRuns] = React.useState(0);

  const [state, formAction, pending] = React.useActionState<ShowroomRunState, FormData>(
    async (previous, form) => {
      const next = await runShowroomAction(previous, form);
      if (next?.ok) {
        setResult(next.result);
        setRuns((value) => value + 1);
        setOpen(false);
      }
      return next;
    },
    null,
  );

  const rows = result
    ? result.fields
    : spec.fields.map((label, index) => ({ label, value: spec.sample[index] ?? "—" }));

  return (
    <article
      data-testid="showroom-card"
      data-agent={spec.agentHandle}
      className={cn(
        "bg-card-surface grid gap-3 rounded-card border border-line p-3.5 shadow-[var(--shadow-card)] sm:p-4",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] leading-tight font-extrabold">
            {spec.agentName}
          </h3>
          <p className="m-0 text-[11.5px] text-muted">{spec.title}</p>
        </div>
        <Pill variant={result ? "green" : "purple"} size="sm">
          {result ? "YOUR RUN" : "SAMPLE RUN"}
        </Pill>
      </header>

      <p className="m-0 text-[12px] leading-relaxed text-ink">{spec.blurb}</p>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ShowroomScene
          kind={spec.scene}
          gradient={spec.gradient}
          glyph={spec.glyph}
          running={pending}
        />

        <dl key={runs} className="m-0 grid content-start gap-1">
          {rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className="ad-reveal flex items-baseline justify-between gap-2 border-b border-[#161f30] py-1 last:border-0"
              style={{ "--reveal-delay": `${index * 0.22}s` } as CSSProperties}
            >
              <dt className="m-0 shrink-0 text-[10.5px] text-muted">{row.label}</dt>
              <dd className="m-0 truncate text-right text-[11.5px] font-bold text-ink">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {result ? (
        <p
          data-testid="showroom-result"
          className="m-0 rounded-[13px] border border-[#1b7253] bg-[#0b1f19] px-3 py-2 text-[11.5px] leading-relaxed text-[#a9f0cf]"
        >
          <b className="font-extrabold">Simulated run</b> — {result.summary}. Finished in{" "}
          <span className="tabular-nums">{formatDuration(result.durationSeconds)}</span> at{" "}
          <span className="tabular-nums">{(result.confidence * 100).toFixed(0)}%</span>{" "}
          confidence.
        </p>
      ) : (
        <p className="m-0 text-[11px] text-muted">
          {spec.pipeline} · {spec.durationLabel}
          {hirePriceCents !== null ? <> · from {formatCents(hirePriceCents)}</> : null}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => setOpen(true)}
          className="flex-1 justify-center"
        >
          <Play className="size-3.5" aria-hidden="true" />
          {spec.agentHandle === "roofintel" ? "Try with my address" : "Try it with mine"}
        </Button>
        <Link href={hireHref} className={buttonClasses("outline", "sm")}>
          Hire {spec.agentName}
        </Link>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        side="center"
        size="sm"
        title={`Run ${spec.agentName}`}
        description={`${spec.pipeline} · simulated preview, deterministic in what you type. No external service is contacted.`}
      >
        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="handle" value={spec.agentHandle} />
          <Field
            label={spec.inputLabel}
            htmlFor={`showroom-input-${spec.agentHandle}`}
            required
            hint={`Example: ${spec.inputExample}`}
          >
            <Input
              id={`showroom-input-${spec.agentHandle}`}
              name="input"
              placeholder={spec.inputPlaceholder}
              defaultValue=""
              required
              minLength={3}
              maxLength={120}
              autoComplete="off"
            />
          </Field>

          {state && !state.ok ? (
            <p
              role="alert"
              className="m-0 flex items-start gap-2 rounded-[13px] border border-[#8a3142] bg-[#2c1017] px-3 py-2 text-[12px] font-semibold text-[#ffb3bd]"
            >
              <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden="true" />
              {state.message}
            </p>
          ) : null}

          <Button type="submit" variant="primary" loading={pending} fullWidth>
            <Sparkles className="size-4" aria-hidden="true" />
            Run the demo
          </Button>
        </form>
      </Sheet>
    </article>
  );
}
