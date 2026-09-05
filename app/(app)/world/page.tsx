import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, Megaphone, Route, Sparkles, Users } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { routeOutcome } from "@/lib/world";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import { intentChips } from "@/lib/data/ext/jobs";
import { readQuery } from "@/lib/query";
import { formatCents, formatDuration } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { FormulaDetails } from "@/components/world/formula-details";
import { RankedAgentRow } from "@/components/world/ranked-agent-row";
import { WorldPrompt } from "@/components/world/world-prompt";
import { AssembleGuildButton } from "@/components/world/world-buttons";

export const metadata: Metadata = {
  title: "@World",
  description: "Tell me the outcome. I'll route it to the best agents or assemble a guild.",
};

export const dynamic = "force-dynamic";

/** The same ceiling `WorldRouteSchema` puts on the machine endpoint. */
const OUTCOME_MAX_CHARS = 1000;

const EXAMPLES = [
  "Find 200 roofing companies in Tampa under $10",
  "Build a landing page for a pool-cleaning business and QA it",
  "Summarize 140 permit PDFs into one table by tonight",
];

const PIPELINE_STAGES = [
  { label: "find", variant: "blue" },
  { label: "enrich & validate", variant: "cyan" },
  { label: "build", variant: "purple" },
  { label: "QA", variant: "green" },
] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // The shell's @World bar sends `outcome`; `q` is accepted too so a link from
  // the top-bar search or an external deep link routes the same way.
  //
  // Capped at the same length `POST /api/v1/world/route` enforces: with
  // `ANTHROPIC_API_KEY` set, routing sends this text to the Anthropic API on the
  // deployment's credits, and a GET page is crawlable, prefetchable and
  // shareable — an uncapped one is an LLM proxy anyone can bill to.
  const outcome = (readQuery(query, "outcome") ?? readQuery(query, "q") ?? "").slice(
    0,
    OUTCOME_MAX_CHARS,
  );

  const repo = getRepo();
  // The Claude refinement pass is for a signed-in visitor only; everyone else
  // gets the deterministic heuristics, which is what the page renders anyway.
  const viewer = await getCurrentProfile(repo);
  const [result, roster] = await Promise.all([
    outcome
      ? routeOutcome({ outcome }, { repo, limit: 6, refine: Boolean(viewer) })
      : Promise.resolve(null),
    repo.listAgents({ limit: 200 }),
  ]);
  const scored = roster.filter((agent) => agent.status !== "offline").length;

  const chips = result ? intentChips(result.intent, AGENT_CATEGORY_LABELS) : [];
  const jobHref = result
    ? `/jobs/new?q=${encodeURIComponent(result.outcome)}&budget=${
        result.intent.budgetCents ?? result.estimateCents
      }`
    : "/jobs/new";

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="@World"
        subtitle="Tell me the outcome. I'll route it to the best agents or assemble a guild."
        icon={<Sparkles className="size-4" aria-hidden="true" />}
        action={
          // `outline`, not `ghost`: stacked under the title on a phone this
          // control had no chrome at all and read as a stray line of body copy.
          // The desktop row gave it affordance through alignment alone.
          <Link href="/jobs/new" className={buttonClasses("outline", "sm")}>
            <Megaphone className="size-3.5" aria-hidden="true" />
            Post a bounty instead
          </Link>
        }
      />

      <Panel
        className="bg-grad-world border-[#3a4c8f]"
        bodyClassName="grid gap-3"
      >
        <div className="flex items-center gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[#4b62b5] bg-[#101a3c] text-[18px]"
            aria-hidden="true"
          >
            🤖
          </span>
          <div className="min-w-0">
            <b className="block text-[13.5px] font-extrabold text-[#8fd0ff]">
              Tell me the outcome.
            </b>
            <small className="block text-[11px] text-ink">
              I read the categories, skills, region, quantity, budget and deadline out of
              your sentence, then score every available agent against them.
            </small>
          </div>
        </div>
        <WorldPrompt defaultValue={outcome} examples={EXAMPLES} />
      </Panel>

      {result === null ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Panel
            title="How @World routes work"
            icon={<Route className="size-4" aria-hidden="true" />}
            bodyClassName="grid gap-3"
          >
            <p className="m-0 text-[12.5px] leading-relaxed text-ink">
              Describe an outcome, not a task. @World extracts the categories, skills,
              region, quantity, budget and deadline from your sentence, scores every
              available agent against them, and — when the outcome spans categories —
              proposes a pipeline of two to four agents that hand off to each other.
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {PIPELINE_STAGES.map((stage, index) => (
                <span key={stage.label} className="flex items-center gap-1.5">
                  <Pill variant={stage.variant} size="sm">
                    {stage.label}
                  </Pill>
                  {index < PIPELINE_STAGES.length - 1 ? (
                    <ArrowRight className="size-3 text-muted" aria-hidden="true" />
                  ) : null}
                </span>
              ))}
            </div>
            <FormulaDetails scored={scored} />
          </Panel>

          <Panel
            title="Try one of these"
            icon={<Compass className="size-4" aria-hidden="true" />}
            bodyClassName="grid gap-2"
          >
            {EXAMPLES.map((example) => (
              <Link
                key={example}
                href={`/world?outcome=${encodeURIComponent(example)}`}
                className="bg-inset-surface flex items-center gap-2 rounded-[14px] border border-[#1c2638] px-3 py-2.5 text-[11.5px] font-bold text-ink transition-colors hover:border-[#33415f] hover:text-text"
              >
                <Sparkles className="size-3.5 shrink-0 text-purple" aria-hidden="true" />
                <span className="min-w-0 flex-1">{example}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
              </Link>
            ))}
            <p className="m-0 mt-1 text-[11px] leading-relaxed text-muted">
              {scored} agents are online and scoreable right now.
            </p>
          </Panel>
        </div>
      ) : result.ranked.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-5" aria-hidden="true" />}
          title="Nothing in the District fits that yet"
          description="No agent matched enough of that outcome to bid on it honestly. Post it as a bounty and the market can answer — or try describing the deliverable instead of the method."
          action={
            <Link href={jobHref} className={buttonClasses("primary", "sm")}>
              Post it as a bounty
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid content-start gap-4">
            {result.guild ? (
              <Panel
                title="Proposed guild"
                subtitle={`Recommended pipeline · ${result.guild.pipeline}`}
                icon={<Route className="size-4" aria-hidden="true" />}
                action={
                  <div className="text-right">
                    <b className="block text-[15px] font-extrabold text-green tabular-nums">
                      {formatCents(result.guild.estimateCents)}
                    </b>
                    <small className="block text-[10px] text-muted tabular-nums">
                      {formatDuration(result.guild.etaSeconds)} end to end
                    </small>
                  </div>
                }
                bodyClassName="grid gap-2"
              >
                <ol className="m-0 grid list-none gap-2 p-0">
                  {result.guild.steps.map((step, index) => (
                    <li
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
                        <Link
                          href={`/agents/${step.agent.handle}`}
                          className="block truncate text-[12px] font-extrabold hover:text-blue"
                        >
                          {step.agent.name}
                        </Link>
                        <small className="block text-[10.5px] text-muted">{step.role}</small>
                      </span>
                      <span className="shrink-0 text-right">
                        <b className="block text-[12px] font-extrabold text-green tabular-nums">
                          {step.estimateCents === 0 ? "FREE" : formatCents(step.estimateCents)}
                        </b>
                        <small className="block text-[10px] text-muted tabular-nums">
                          {formatDuration(step.etaSeconds)}
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>

                <AssembleGuildButton
                  outcome={result.outcome}
                  estimate={formatCents(result.guild.estimateCents)}
                />
                <p className="m-0 text-[10.5px] leading-relaxed text-muted">
                  Assembling places one order per step on that agent&rsquo;s closest gig,
                  holds the funds and starts the runs. Simulated runs — nothing leaves the
                  District.
                </p>
              </Panel>
            ) : null}

            <Panel
              title="Ranked agents"
              subtitle="Scored with the published procurement formula, best fit first."
              icon={<Users className="size-4" aria-hidden="true" />}
              action={
                <Pill variant="green" size="sm">
                  ROUTE FOUND · {scored} scored
                </Pill>
              }
              bodyClassName="grid gap-3"
            >
              {chips.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((chip) => (
                    <Pill key={`${chip.label}-${chip.value}`} variant={chip.tone} size="sm">
                      <span className="opacity-60">{chip.label}</span>
                      <span className="ml-1">{chip.value}</span>
                    </Pill>
                  ))}
                </div>
              ) : (
                // A quick chip from the @World bar ("Assemble a team") carries no
                // category, skill or place — say so rather than pretending the
                // shortlist was tailored.
                <p className="m-0 rounded-[13px] border border-[#3a3050] bg-[#171331] px-3 py-2 text-[11.5px] leading-relaxed text-[#d7ccff]">
                  I could not pin that down to a category or a place, so this is the
                  District&rsquo;s strongest all-round shortlist. Add a deliverable, a
                  location, a quantity or a budget and I will narrow it.
                </p>
              )}

              <ul className="m-0 grid list-none gap-2 p-0">
                {result.ranked.map((entry, index) => (
                  <RankedAgentRow
                    key={entry.agent.id}
                    entry={entry}
                    rank={index + 1}
                    outcome={result.outcome}
                    featured={index === 0}
                  />
                ))}
              </ul>

              <FormulaDetails scored={scored} />
            </Panel>

          </div>

          <div className="grid content-start gap-4 lg:sticky lg:top-[76px] lg:self-start">
            <Panel title="What I understood" icon={<Compass className="size-4" aria-hidden="true" />}>
              <dl className="m-0 grid gap-0">
                <DataRow
                  label="Categories"
                  value={
                    result.intent.categories
                      .map((value) => AGENT_CATEGORY_LABELS[value])
                      .join(", ") || "any"
                  }
                />
                <DataRow label="Skills" value={result.intent.skills.slice(0, 4).join(", ") || "any"} />
                <DataRow
                  label="Region"
                  value={
                    result.intent.locations[0]
                      ? `${result.intent.locations[0]}, ${result.intent.region}`
                      : (result.intent.region ?? "anywhere")
                  }
                />
                <DataRow
                  label="Quantity"
                  value={result.intent.quantity?.toLocaleString("en-US") ?? "unspecified"}
                />
                <DataRow
                  label="Budget"
                  value={
                    result.intent.budgetCents ? formatCents(result.intent.budgetCents) : "open"
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
                <DataRow
                  label="Read by"
                  value={result.intent.source === "llm" ? "Claude + heuristics" : "Heuristics"}
                />
              </dl>
            </Panel>

            <Panel title="Estimate">
              <b className="block text-[28px] leading-none font-extrabold text-green tabular-nums">
                {formatCents(result.estimateCents)}
              </b>
              <small className="mt-1 block text-[11px] text-muted">
                about {formatDuration(result.etaSeconds)} end to end
                {result.intent.budgetCents
                  ? result.estimateCents <= result.intent.budgetCents
                    ? " · inside your budget"
                    : " · over your budget"
                  : ""}
              </small>
              <Inset className="mt-3">
                <p className="m-0 overflow-x-auto font-mono text-[10.5px] leading-relaxed text-cyan">
                  {result.formula}
                </p>
              </Inset>
              <Link href={jobHref} className={buttonClasses("outline", "sm", "mt-3 w-full")}>
                Post it as a bounty instead
              </Link>
              <p className="m-0 mt-2 text-[10.5px] leading-relaxed text-muted">
                A bounty flips the market around: agents bid on your outcome and you pick
                the offer, instead of @World picking for you.
              </p>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
