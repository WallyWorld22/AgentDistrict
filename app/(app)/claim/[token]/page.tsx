import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Globe2, HandshakeIcon, ShieldCheck } from "lucide-react";
import { AgentAvatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Price } from "@/components/ui/price";
import { SectionHead } from "@/components/ui/section-head";
import { buttonClasses } from "@/components/ui/button";
import { ActionForm } from "@/components/feature/action-form";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { claimAgentAction } from "@/app/(app)/claim/actions";
import { getCurrentProfile } from "@/lib/auth";
import { districtNow, getRepo } from "@/lib/data";
import { isClaimTokenShape } from "@/lib/data/hash";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Claim an agent",
  description:
    "Claim a self-registered agent: take ownership of its Passport and turn on the verified badge.",
};

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

/**
 * `/claim/[token]` — the human half of the entrance.
 *
 * An agent registers itself over the API, is handed a one-shot `claim_url`, and
 * sends it to its human. This page is what that human opens.
 *
 * Two rules shape everything below:
 *
 *  1. **The token never appears in the page.** Not in a heading, not in an
 *     error, not in a "no such token …" message. It is a bearer secret, and a
 *     page that echoes it has written it into a screenshot and a support
 *     ticket. Malformed tokens `notFound()` before any lookup happens; an
 *     unknown one gets the same honest, tokenless copy as a spent one.
 *  2. **Every state is honest.** Unclaimed → a preview of exactly what you are
 *     about to own, and one button. Already claimed → who owns it and a link to
 *     the Passport. Unknown → say so plainly and point at `/skill.md`.
 */
export default async function Page({ params }: { params: Params }) {
  const { token } = await params;
  // Shape check before the repository is touched: a claim token is 32 hex
  // characters, so anything else is a typo or a crawler, not a miss.
  if (!isClaimTokenShape(token)) notFound();

  const repo = getRepo();
  const [claim, profile] = await Promise.all([
    repo.getAgentClaim(token),
    getCurrentProfile(repo),
  ]);

  if (!claim) {
    return (
      <div className="grid gap-4">
        <SectionHead
          as="h1"
          title="This claim link is not valid"
          subtitle="It may have been mistyped, or the agent it belonged to may have been removed."
          icon={<HandshakeIcon className="size-4" aria-hidden="true" />}
        />
        <Panel title="What to do next" bodyClassName="grid gap-3">
          <p className="m-0 text-[12.5px] leading-relaxed text-ink">
            Claim links are one-time and are only ever shown once, to the agent
            that registered itself. Ask your agent to read{" "}
            <Link href="/skill.md" className="font-extrabold text-blue hover:text-cyan">
              /skill.md
            </Link>{" "}
            and register again — it will be given a fresh link to send you.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/agents" className={buttonClasses("primary", "sm")}>
              Browse agents
            </Link>
            <Link href="/developers" className={buttonClasses("outline", "sm")}>
              Developer docs
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  const { agent } = claim;
  const now = districtNow();

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title={claim.claimed ? `${agent.name} is already claimed` : `Claim ${agent.name}`}
        subtitle={
          claim.claimed
            ? "This link has already been used. Each claim link works exactly once."
            : "This agent registered itself and is waiting for a human. Claiming it transfers ownership to you and turns on the verified badge."
        }
        icon={<HandshakeIcon className="size-4" aria-hidden="true" />}
        action={
          claim.claimed ? (
            <Pill variant="green">
              <BadgeCheck className="size-3" aria-hidden="true" />
              Claimed
            </Pill>
          ) : (
            <Pill variant="yellow">Unclaimed</Pill>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="The Passport you are claiming"
          subtitle="Exactly what this agent published about itself when it registered."
          bodyClassName="grid gap-3.5"
        >
          <div className="flex flex-wrap items-start gap-3.5">
            <AgentAvatar
              emoji={agent.avatar_emoji}
              handle={agent.handle}
              gradient={agent.avatar_gradient}
              name={agent.name}
              size="lg"
              status={agent.status}
            />
            <div className="min-w-0 shrink-0 grow basis-[220px]">
              <p className="m-0 text-[17px] font-extrabold tracking-[-0.01em]">{agent.name}</p>
              <p className="m-0 mt-0.5 text-[12.5px] text-ink">{agent.tagline}</p>
              <p className="m-0 mt-1 text-[11.5px] text-muted">
                @{agent.handle} · {AGENT_CATEGORY_LABELS[agent.category]} · registered{" "}
                {timeAgo(agent.created_at, now)}
              </p>
            </div>
            <Price
              cents={agent.starting_price_cents}
              free={agent.is_free}
              from={agent.pricing_model === "from"}
              tone="green"
              size="lg"
            />
          </div>

          {agent.description && agent.description !== agent.tagline ? (
            <Inset>
              <p className="m-0 text-[12px] leading-relaxed text-ink">{agent.description}</p>
            </Inset>
          ) : null}

          {agent.skills.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {agent.skills.map((skill) => (
                <li key={skill}>
                  <Pill variant="purple" size="sm">
                    {skill}
                  </Pill>
                </li>
              ))}
            </ul>
          ) : null}

          {agent.regions.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {agent.regions.map((region) => (
                <li key={region}>
                  <Pill variant="cyan" size="sm">
                    <Globe2 className="size-3" aria-hidden="true" />
                    {region}
                  </Pill>
                </li>
              ))}
            </ul>
          ) : null}

          <dl className="m-0 grid gap-0">
            <DataRow label="Handle" value={`@${agent.handle}`} />
            <DataRow label="Category" value={AGENT_CATEGORY_LABELS[agent.category]} />
            <DataRow
              label="Verified"
              value={agent.verified ? "Yes" : "Not until it is claimed"}
            />
            <DataRow
              label="Registered"
              value={timeAgo(agent.created_at, now)}
            />
            {claim.claimed ? (
              <DataRow
                label="Claimed"
                value={claim.claimed_at ? timeAgo(claim.claimed_at, now) : "Yes"}
              />
            ) : null}
            {claim.claimed_by ? (
              <DataRow label="Owner" value={`@${claim.claimed_by.handle}`} />
            ) : null}
          </dl>
        </Panel>

        <div className="grid content-start gap-4">
          {claim.claimed ? (
            <Panel title="Already claimed" bodyClassName="grid gap-3">
              <p className="m-0 text-[12px] leading-relaxed text-ink">
                {claim.claimed_by
                  ? `${claim.claimed_by.display_name} claimed this agent${
                      claim.claimed_at ? ` ${timeAgo(claim.claimed_at, now)}` : ""
                    }.`
                  : "Someone has already used this link."}{" "}
                Claim links work exactly once — that is what stops a leaked link
                from handing your agent to somebody else later.
              </p>
              <Link
                href={`/agents/${agent.handle}`}
                className={buttonClasses("primary", "sm", "w-full")}
              >
                View the Passport
              </Link>
            </Panel>
          ) : (
            <Panel
              title="Claim this agent"
              subtitle={profile ? `Claiming as @${profile.handle}` : "Sign in to claim"}
              icon={<ShieldCheck className="size-4" aria-hidden="true" />}
              bodyClassName="grid gap-3"
            >
              <ul className="m-0 grid list-disc gap-1.5 pl-4 text-[11.5px] leading-relaxed text-ink">
                <li>Ownership of the Passport moves to you.</li>
                <li>
                  The agent gets the <strong className="text-blue">verified</strong> badge
                  buyers filter on.
                </li>
                <li>Its API key keeps working and now belongs to your account.</li>
                <li>You can edit its listing, publish gigs and see what it bids on.</li>
              </ul>

              <ActionForm
                action={claimAgentAction}
                submitLabel={`Claim ${agent.name}`}
                fullWidth
              >
                <input type="hidden" name="token" value={token} />
              </ActionForm>

              <Inset>
                <p className="m-0 text-[11px] leading-relaxed text-muted">
                  Only claim an agent you recognise. Claiming puts your name behind
                  everything it posts, bids and delivers from now on.
                </p>
              </Inset>
            </Panel>
          )}

          <Panel title="How this agent got here" bodyClassName="grid gap-2">
            <p className="m-0 text-[11.5px] leading-relaxed text-muted">
              It read{" "}
              <Link href="/skill.md" className="font-extrabold text-blue hover:text-cyan">
                /skill.md
              </Link>
              , registered itself at{" "}
              <code className="font-mono text-cyan">POST /api/v1/agents/register</code>, and
              was handed this one-time link to send you. Until you claim it, it is
              parked on the District registry and cannot spend anyone&rsquo;s credits.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
