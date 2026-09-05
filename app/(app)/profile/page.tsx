import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, KeyRound, Plus, Store as StoreIcon, UserRound } from "lucide-react";
import { districtNow, getRepo, isDemoMode } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { supportsApiKeyRevocation, toApiKeyView } from "@/lib/data/ext/agents";
import { formatCents, timeAgo } from "@/lib/utils";
import { StatTile } from "@/components/cards/stat-tile";
import { Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { ApiKeyPanel } from "@/components/agents/api-key-panel";
import { OwnedAgentRow } from "@/components/agents/owned-agent-row";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = {
  title: "Your District",
  description: "Your profile, your stores, the agents you own and your API keys.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const repo = getRepo();
  const profile = await requireProfile(repo);
  const now = districtNow();

  const [agents, stores, wallet, keys, orders] = await Promise.all([
    repo.listAgentsByOwner(profile.id),
    repo.listStores(),
    repo.getWallet(profile.id),
    repo.listApiKeys(profile.id),
    repo.listOrders({ buyerId: profile.id, limit: 50 }),
  ]);

  // One read per owned Passport so each row can show how many gigs it has
  // published — the demo adapter answers from memory, Supabase from an index.
  const gigCounts = await Promise.all(
    agents.map((agent) => repo.listGigs({ agentHandle: agent.handle, limit: 50 })),
  );

  const myStores = stores.filter((store) => store.owner_id === profile.id);
  const approved = orders.filter((order) => order.status === "approved");
  const demo = isDemoMode();
  const keyViews = keys.map((key) => toApiKeyView(key, (iso) => timeAgo(iso, now)));

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Your District"
        subtitle="Your profile, your stores, the agents you own and your API keys."
        icon={<UserRound className="size-4" aria-hidden="true" />}
        action={demo ? <Pill variant="yellow">Demo session</Pill> : null}
      />

      <Panel>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            size="xl"
            round
            style={{ backgroundImage: gradientForHandle(profile.handle) }}
            aria-hidden="true"
          >
            {initialsFrom(profile.display_name)}
          </Avatar>
          {/*
           * `basis` rather than `min-w-*`: an unlayered `* { min-width: 0 }` in
           * app/globals.css beats every Tailwind `min-w-` utility, so a flex
           * child next to two wide buttons collapses to one word per line at
           * 390px. `shrink-0` on a 240px basis makes the buttons wrap instead.
           */}
          <div className="min-w-0 shrink-0 grow basis-[240px]">
            <b className="flex items-center gap-1.5 text-[20px] font-extrabold">
              {profile.display_name}
              {profile.is_verified_human ? (
                <BadgeCheck className="size-5 text-blue" aria-hidden="true" />
              ) : null}
            </b>
            <small className="block text-[12px] text-muted">
              @{profile.handle} · joined {timeAgo(profile.created_at, now)}
            </small>
            {profile.bio ? (
              <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-ink">
                {profile.bio}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.is_creator ? (
                <Pill variant="purple" size="sm">
                  Creator
                </Pill>
              ) : null}
              {profile.is_verified_human ? (
                <Pill variant="blue" size="sm">
                  Verified human
                </Pill>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/onboarding/agent" className={buttonClasses("primary", "sm")}>
              <Plus className="size-3.5" aria-hidden="true" />
              Register an agent
            </Link>
            <Link href="/wallet" className={buttonClasses("outline", "sm")}>
              Wallet
            </Link>
          </div>
        </div>

        {demo ? (
          <Inset className="mt-3.5">
            <p className="m-0 text-[11.5px] leading-relaxed text-muted">
              <b className="text-yellow">Demo session.</b> This deployment runs with no
              Supabase credentials, so every visitor is signed in as{" "}
              <b className="text-text">@{profile.handle}</b>. Everything you create lives
              in this server process and resets on a cold start.
            </p>
          </Inset>
        ) : null}
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          value={agents.length}
          label="Agents owned"
          href="/agents"
          tone="purple"
          icon="🤖"
        />
        <StatTile
          value={myStores.length}
          label="Storefronts"
          href="/stores"
          tone="blue"
          icon="🏬"
        />
        <StatTile
          value={formatCents((wallet?.balance_cents ?? 0) - (wallet?.held_cents ?? 0))}
          label="Available credits"
          href="/wallet"
          tone="green"
          icon="$"
        />
        <StatTile
          value={approved.length}
          label="Runs approved"
          href="/orders?status=approved"
          tone="cyan"
          icon="✓"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-4">
          <Panel
            title="Your agents"
            subtitle="Passports you own. Publish a gig so buyers can hire them in one click."
            action={
              <Link href="/onboarding/agent" className={buttonClasses("primary", "sm")}>
                <Plus className="size-3.5" aria-hidden="true" />
                Register an agent
              </Link>
            }
            bodyClassName="grid gap-2.5"
          >
            {agents.map((agent, index) => (
              <OwnedAgentRow
                key={agent.id}
                agent={agent}
                gigCount={gigCounts[index]?.length ?? 0}
              />
            ))}
            {agents.length === 0 ? (
              <EmptyState
                title="No Passports yet"
                description="Register an agent to give it an identity, a reputation record and a machine-readable agent card."
                action={
                  <Link href="/onboarding/agent" className={buttonClasses("primary", "sm")}>
                    Register your first agent
                  </Link>
                }
              />
            ) : null}
          </Panel>

          <Panel
            title="Your storefronts"
            subtitle="Where a buyer meets everything you build."
            icon={<StoreIcon className="size-4" aria-hidden="true" />}
            bodyClassName="grid gap-2"
          >
            {myStores.map((store) => (
              <Link
                key={store.id}
                href={`/stores/${store.slug}`}
                className="bg-inset-surface flex items-center gap-3 rounded-[16px] border border-[#1c2638] p-3 transition-colors hover:border-[#3d4d73]"
              >
                <span
                  className="size-10 shrink-0 rounded-[13px]"
                  style={{ backgroundImage: store.banner_gradient }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[12.5px] font-extrabold">{store.name}</b>
                  <small className="block truncate text-[11px] text-muted">
                    {store.tagline}
                  </small>
                </span>
                <small className="shrink-0 text-[11px] text-muted tabular-nums">
                  {store.agents.length} agents
                </small>
              </Link>
            ))}
            {myStores.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">No storefronts yet.</p>
            ) : null}
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Account" bodyClassName="grid gap-3">
            <dl className="m-0 grid gap-0">
              <DataRow label="Handle" value={`@${profile.handle}`} />
              <DataRow label="Creator" value={profile.is_creator ? "Yes" : "No"} />
              <DataRow
                label="Verified human"
                value={profile.is_verified_human ? "Yes" : "No"}
              />
              <DataRow label="Data mode" value={demo ? "Demo" : "Supabase"} />
              <DataRow label="API keys" value={keys.length} />
            </dl>
            <SignOutButton />
          </Panel>

          <Panel title="Shortcuts" bodyClassName="grid gap-2">
            {[
              { href: "/gigs/new", label: "Publish a gig" },
              { href: "/jobs/new", label: "Post a bounty" },
              { href: "/orders", label: "Your runs" },
              { href: "/developers", label: "API & MCP reference" },
              { href: "/workplace", label: "Workplace Gateway" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between gap-2 rounded-[13px] border border-[#1c2638] bg-[#0b111d] px-3 py-2 text-[12px] font-extrabold text-ink transition-colors hover:border-[#3d4d73] hover:text-text"
              >
                {link.label}
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </Panel>
        </div>
      </div>

      <div id="api-keys" className="scroll-mt-20">
        <Panel
          title="API keys"
          subtitle="Machine access for your agents, scripts and Workplace Gateway. The raw key is shown once."
          icon={<KeyRound className="size-4" aria-hidden="true" />}
          href="/developers"
          actionLabel="API docs"
        >
          <ApiKeyPanel keys={keyViews} canRevoke={supportsApiKeyRevocation(repo)} />
        </Panel>
      </div>
    </div>
  );
}
