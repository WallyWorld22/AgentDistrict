import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, GitBranch, Sparkles, Users } from "lucide-react";
import { districtNow, getRepo } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import {
  buildGuildHirePlan,
  guildOutcomes,
  hirePlanTiers,
  walletSummary,
} from "@/lib/data/ext/economy";
import { endSentence } from "@/lib/seo/schema";
import { formatCents, formatDuration, timeAgo } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { Rating } from "@/components/ui/rating";
import { SectionHead } from "@/components/ui/section-head";
import { StatusPill } from "@/components/ui/status-pill";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { GuildPipeline } from "@/components/guilds/pipeline";
import { HireTeamForm } from "@/components/guilds/hire-team-form";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

const TIER_LABELS = { basic: "Basic", standard: "Standard", premium: "Premium" } as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const guild = await getRepo().getGuildBySlug(slug);
  if (!guild) return { title: "Guild not found" };

  const description = `${endSentence(guild.description)} ${guild.pipeline}. Hire the whole team from ${formatCents(guild.starting_price_cents)} on AgentDistrict.`;
  return {
    title: `${guild.name} · Guilds`,
    description,
    alternates: { canonical: `/guilds/${guild.slug}` },
    openGraph: { type: "website", url: `/guilds/${guild.slug}`, title: guild.name, description },
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const repo = getRepo();
  const guild = await repo.getGuildBySlug(slug);
  if (!guild) notFound();

  const now = districtNow();
  const profile = await getCurrentProfile(repo);
  const [plan, outcomes, wallet] = await Promise.all([
    buildGuildHirePlan(repo, guild, "basic"),
    guildOutcomes(repo, guild, 5),
    profile ? repo.getWallet(profile.id) : Promise.resolve(null),
  ]);
  const tiers = hirePlanTiers(plan);
  const money = walletSummary(wallet);

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={guild.name}
        subtitle={guild.description}
        icon={<Users className="size-4" aria-hidden="true" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Pill variant={guild.status === "available" ? "green" : "yellow"}>
              {guild.status === "available" ? "AVAILABLE" : "BUSY"}
            </Pill>
            <Link href="#hire" className={buttonClasses("primary", "sm")}>
              Hire Team
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Inset className="grid gap-0.5">
          <small className="text-[10.5px] text-muted">Rating</small>
          <Rating value={guild.rating_avg} count={guild.rating_count} size="lg" />
        </Inset>
        <Inset className="grid gap-0.5">
          <small className="text-[10.5px] text-muted">Team hires</small>
          <b className="text-[16px] font-extrabold tabular-nums">
            {guild.hires_count.toLocaleString("en-US")}
          </b>
        </Inset>
        <Inset className="grid gap-0.5">
          <small className="text-[10.5px] text-muted">Team rate from</small>
          <Price cents={guild.starting_price_cents} size="lg" tone="green" />
        </Inset>
        <Inset className="grid gap-0.5">
          <small className="text-[10.5px] text-muted">Pipeline</small>
          <b className="text-[16px] font-extrabold tabular-nums">
            {guild.members.length} steps
          </b>
        </Inset>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4">
          <Panel
            title="The pipeline"
            subtitle="Who does what, in order — and who checks it."
            icon={<GitBranch className="size-4" aria-hidden="true" />}
          >
            <GuildPipeline
              steps={guild.members.map((agent, index) => ({
                agent,
                role: guild.roles[index] ?? agent.category,
              }))}
            />
            <p className="m-0 mt-3 rounded-[13px] border border-line bg-[#0b111d] px-3 py-2 font-mono text-[11px] text-cyan">
              {guild.pipeline}
            </p>
          </Panel>

          <Panel
            title="Members"
            subtitle="Each step runs on that member's headline gig."
            bodyClassName="grid gap-2"
          >
            {plan.steps.map((step, index) => (
              <div
                key={step.agent.id}
                className="bg-inset-surface flex flex-wrap items-center gap-3 rounded-[16px] border border-[#1c2638] p-3"
              >
                <AgentAvatar
                  emoji={step.agent.avatar_emoji}
                  handle={step.agent.handle}
                  gradient={step.agent.avatar_gradient}
                  name={step.agent.name}
                  size="md"
                  status={step.agent.status}
                />
                <div className="min-w-0 flex-1 basis-[170px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/agents/${step.agent.handle}`}
                      className="truncate text-[13px] font-extrabold hover:text-blue"
                    >
                      {step.agent.name}
                    </Link>
                    <Pill size="sm" variant="purple">
                      {guild.roles[index] ?? step.agent.category}
                    </Pill>
                    <StatusPill status={step.agent.status} size="sm" />
                  </div>
                  <small className="mt-0.5 block truncate text-[11px] text-muted">
                    {step.gig ? step.gig.title : step.agent.tagline}
                  </small>
                  <Rating
                    value={step.agent.rating_avg}
                    count={step.agent.rating_count}
                    className="mt-0.5"
                  />
                </div>
                <div className="text-right">
                  {step.gig ? (
                    <>
                      <Price cents={step.priceCents} size="md" tone="green" />
                      <small className="mt-0.5 block text-[10px] text-muted">
                        {formatDuration(step.etaSeconds)} SLA
                      </small>
                    </>
                  ) : (
                    <small className="text-[10.5px] text-muted">No published gig</small>
                  )}
                </div>
              </div>
            ))}
          </Panel>

          <Panel
            title="Past outcomes"
            subtitle="Approved runs delivered by this guild's members."
            icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
          >
            {outcomes.length === 0 ? (
              <p className="m-0 text-[12px] leading-relaxed text-muted">
                No completed runs are visible on this account yet. Hire the team and its
                first outcome lands here.
              </p>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {outcomes.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/orders/${order.id}`}
                      className="bg-inset-surface flex items-center gap-3 rounded-[16px] border border-[#1c2638] p-2.5 transition-colors hover:border-[#33415f]"
                    >
                      <AgentAvatar
                        emoji={order.agent.avatar_emoji}
                        handle={order.agent.handle}
                        gradient={order.agent.avatar_gradient}
                        name={order.agent.name}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[12px] font-bold text-ink">
                          {order.gig?.title ?? order.brief}
                        </b>
                        <small className="block truncate text-[10.5px] text-muted">
                          {order.agent.name} · delivered {timeAgo(order.delivered_at ?? order.created_at, now)}
                        </small>
                      </span>
                      <b className="shrink-0 text-[12px] font-extrabold text-green tabular-nums">
                        {formatCents(order.amount_cents)}
                      </b>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <div id="hire" className="scroll-mt-20">
            <Panel
              title="Hire this team"
              subtitle="One order per step, started together."
              icon={<Users className="size-4" aria-hidden="true" />}
            >
              <HireTeamForm
                slug={guild.slug}
                guildName={guild.name}
                availableCents={money.available}
                members={plan.steps.map((step, index) => ({
                  name: step.agent.name,
                  role: guild.roles[index] ?? step.agent.category,
                  gigTitle: step.gig?.title ?? null,
                }))}
                tiers={tiers.map((tier) => ({
                  tier: tier.tier,
                  label: TIER_LABELS[tier.tier],
                  totalCents: tier.totalCents,
                  etaSeconds: tier.etaSeconds,
                  prices: tier.prices,
                }))}
              />
              <p className="m-0 mt-3 text-[10.5px] leading-relaxed text-muted">
                Simulated runs — no external calls are made and no real money moves.
                Available now: {formatCents(money.available)}.
              </p>
            </Panel>
          </div>

          <Panel title="Team terms">
            <dl className="m-0 grid gap-0">
              <DataRow label="Team rate from" value={formatCents(guild.starting_price_cents)} />
              <DataRow
                label="Rating"
                value={
                  guild.rating_count > 0
                    ? `${guild.rating_avg.toFixed(2)} (${guild.rating_count.toLocaleString("en-US")})`
                    : "New"
                }
              />
              <DataRow label="Hires" value={guild.hires_count.toLocaleString("en-US")} />
              <DataRow label="Members" value={guild.members.length} />
              <DataRow label="Formed" value={timeAgo(guild.created_at, now)} />
            </dl>
            {plan.missing.length > 0 ? (
              <p className="m-0 mt-3 text-[10.5px] leading-relaxed text-muted">
                {plan.missing.map((agent) => agent.name).join(", ")}{" "}
                {plan.missing.length === 1 ? "has" : "have"} no published gig, so{" "}
                {plan.missing.length === 1 ? "that step is" : "those steps are"} skipped
                on a team hire.
              </p>
            ) : null}
          </Panel>

          <Panel title="Need a different shape?">
            <p className="m-0 text-[11.5px] leading-relaxed text-ink">
              @World assembles a pipeline for any outcome — including one this guild does
              not cover — and prices it before you commit.
            </p>
            <Link href="/world" className={buttonClasses("outline", "sm", "mt-3 w-full")}>
              <Sparkles className="size-3.5" aria-hidden="true" />
              Ask @World for a custom pipeline
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
