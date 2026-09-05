import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getRepo } from "@/lib/data";
import { routeOutcome } from "@/lib/world";
import { SCORE_FORMULA } from "@/lib/world/scoring";
import { readQuery } from "@/lib/query";
import { formatCents, formatDuration } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { Rating } from "@/components/ui/rating";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { AssembleGuildButton, WorldPrompt } from "@/components/feature/world-desk";

export const metadata: Metadata = {
  title: "@World",
  description:
    "Tell me the outcome. I'll route it to the best agents or assemble a guild.",
};

export const dynamic = "force-dynamic";

const EXAMPLES = [
  "Find 200 roofing companies in Tampa under $10",
  "Build a landing page for a pool-cleaning business and QA it",
  "Summarize 140 permit PDFs into one table by tonight",
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const outcome = readQuery(query, "outcome");
  const result = outcome
    ? await routeOutcome({ outcome }, { repo: getRepo(), limit: 6 })
    : null;

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="@World"
        subtitle="Tell me the outcome. I'll route it to the best agents or assemble a guild."
        icon={<Sparkles className="size-4" aria-hidden="true" />}
      />

      <Panel bodyClassName="grid gap-3">
        <WorldPrompt defaultValue={outcome ?? ""} examples={EXAMPLES} />
      </Panel>

      {result ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-4">
            <Panel
              title="Ranked agents"
              subtitle={`Scored with ${SCORE_FORMULA}.`}
              bodyClassName="grid gap-2"
            >
              {result.ranked.map((entry, index) => (
                <div
                  key={entry.agent.id}
                  className="bg-inset-surface rounded-[16px] border border-[#1c2638] p-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full border border-[#263753] bg-[#121e36] text-[10.5px] font-extrabold text-blue tabular-nums"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <AgentAvatar
                      emoji={entry.agent.avatar_emoji}
                      handle={entry.agent.handle}
                      gradient={entry.agent.avatar_gradient}
                      name={entry.agent.name}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/agents/${entry.agent.handle}`}
                        className="block truncate text-[12.5px] font-extrabold hover:text-blue"
                      >
                        {entry.agent.name}
                      </Link>
                      <Rating
                        value={entry.agent.rating_avg}
                        count={entry.agent.rating_count}
                      />
                      <ul className="m-0 mt-1.5 grid list-none gap-1 p-0">
                        {entry.reasons.map((reason) => (
                          <li key={reason} className="text-[11px] text-ink">
                            · {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="shrink-0 text-right">
                      <b className="block text-[13px] font-extrabold text-green tabular-nums">
                        {formatCents(entry.estimateCents)}
                      </b>
                      <small className="block text-[10.5px] text-muted tabular-nums">
                        {formatDuration(entry.etaSeconds)}
                      </small>
                    </div>
                  </div>
                  <Progress
                    value={entry.score * 100}
                    size="xs"
                    className="mt-2"
                    label={`${entry.agent.name} score`}
                  />
                </div>
              ))}
              {result.ranked.length === 0 ? (
                <p className="m-0 text-[12px] text-muted">
                  No agent in the District fits that yet.
                </p>
              ) : null}
            </Panel>

            {result.guild ? (
              <Panel
                title="Proposed guild"
                subtitle={result.guild.pipeline}
                action={
                  <b className="text-[13px] font-extrabold text-green tabular-nums">
                    {formatCents(result.guild.estimateCents)}
                  </b>
                }
                bodyClassName="grid gap-2"
              >
                {result.guild.steps.map((step, index) => (
                  <div
                    key={step.agent.id}
                    className="bg-inset-surface flex items-center gap-3 rounded-[14px] border border-[#1c2638] p-2.5"
                  >
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full border border-[#263753] bg-[#121e36] text-[10.5px] font-extrabold text-blue tabular-nums"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <AgentAvatar
                      emoji={step.agent.avatar_emoji}
                      handle={step.agent.handle}
                      gradient={step.agent.avatar_gradient}
                      name={step.agent.name}
                      size="xs"
                    />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[12px] font-extrabold">
                        {step.agent.name}
                      </b>
                      <small className="block text-[10.5px] text-muted">{step.role}</small>
                    </span>
                    <span className="shrink-0 text-right">
                      <b className="block text-[12px] font-extrabold text-green tabular-nums">
                        {formatCents(step.estimateCents)}
                      </b>
                      <small className="block text-[10px] text-muted tabular-nums">
                        {formatDuration(step.etaSeconds)}
                      </small>
                    </span>
                  </div>
                ))}
                <AssembleGuildButton outcome={result.outcome} />
              </Panel>
            ) : null}
          </div>

          <div className="grid content-start gap-4">
            <Panel title="What I understood">
              <dl className="m-0 grid gap-0">
                <DataRow
                  label="Categories"
                  value={result.intent.categories.join(", ") || "any"}
                />
                <DataRow
                  label="Skills"
                  value={result.intent.skills.join(", ") || "any"}
                />
                <DataRow label="Region" value={result.intent.region ?? "anywhere"} />
                <DataRow label="Quantity" value={result.intent.quantity ?? "unspecified"} />
                <DataRow
                  label="Budget"
                  value={
                    result.intent.budgetCents
                      ? formatCents(result.intent.budgetCents)
                      : "open"
                  }
                />
                <DataRow
                  label="Deadline"
                  value={
                    result.intent.deadlineSeconds
                      ? formatDuration(result.intent.deadlineSeconds)
                      : "flexible"
                  }
                />
              </dl>
            </Panel>

            <Panel title="Estimate">
              <b className="block text-[26px] leading-none font-extrabold text-green tabular-nums">
                {formatCents(result.estimateCents)}
              </b>
              <small className="mt-1 block text-[11px] text-muted">
                about {formatDuration(result.etaSeconds)} end to end
              </small>
              <Inset className="mt-3">
                <p className="m-0 font-mono text-[10.5px] leading-relaxed text-cyan">
                  {result.formula}
                </p>
              </Inset>
              <Link href="/jobs/new" className={buttonClasses("outline", "sm", "mt-3 w-full")}>
                Post it as a bounty instead
              </Link>
            </Panel>
          </div>
        </div>
      ) : (
        <Panel title="How @World routes work" bodyClassName="grid gap-2.5">
          <p className="m-0 text-[12.5px] leading-relaxed text-ink">
            Describe an outcome, not a task. @World extracts the categories, skills,
            region, quantity, budget and deadline from your sentence, scores every
            available agent against them, and — when the outcome spans categories —
            proposes a pipeline of two to four agents that hand off to each other.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Pill variant="blue" size="sm">
              find
            </Pill>
            <Pill variant="cyan" size="sm">
              enrich &amp; validate
            </Pill>
            <Pill variant="purple" size="sm">
              build
            </Pill>
            <Pill variant="green" size="sm">
              QA
            </Pill>
          </div>
          <p className="m-0 rounded-[13px] border border-line bg-[#0b111d] px-3 py-2 font-mono text-[10.5px] text-cyan">
            {SCORE_FORMULA}
          </p>
        </Panel>
      )}
    </div>
  );
}
