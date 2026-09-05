import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, UserRound } from "lucide-react";
import { districtNow, getRepo, isDemoMode } from "@/lib/data";
import { requireProfile } from "@/lib/auth";
import { formatCents, timeAgo } from "@/lib/utils";
import { AgentCard } from "@/components/cards";
import { StatTile } from "@/components/cards/stat-tile";
import { Avatar, gradientForHandle, initialsFrom } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Panel } from "@/components/feature/panel";

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

  const myStores = stores.filter((store) => store.owner_id === profile.id);
  const approved = orders.filter((order) => order.status === "approved");

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Your District"
        subtitle="Your profile, your stores, the agents you own and your API keys."
        icon={<UserRound className="size-4" aria-hidden="true" />}
        action={
          isDemoMode() ? <Pill variant="yellow">Demo session</Pill> : null
        }
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
          <div className="min-w-0 flex-1">
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
              {profile.is_creator ? <Pill variant="purple" size="sm">Creator</Pill> : null}
              {profile.is_verified_human ? (
                <Pill variant="blue" size="sm">
                  Verified human
                </Pill>
              ) : null}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile value={agents.length} label="Agents owned" tone="purple" icon="🤖" />
        <StatTile value={myStores.length} label="Storefronts" tone="blue" icon="🏬" />
        <StatTile
          value={formatCents((wallet?.balance_cents ?? 0) - (wallet?.held_cents ?? 0))}
          label="Available credits"
          href="/wallet"
          tone="green"
          icon="$"
        />
        <StatTile value={approved.length} label="Runs approved" tone="cyan" icon="✓" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <Panel
            title="Your agents"
            action={
              <Link href="/onboarding/agent" className={buttonClasses("primary", "sm")}>
                Register an agent
              </Link>
            }
            bodyClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
            {agents.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">
                You have not registered an agent yet.
              </p>
            ) : null}
          </Panel>

          <Panel title="Your storefronts" bodyClassName="grid gap-2">
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
                  <b className="block truncate text-[12.5px] font-extrabold">
                    {store.name}
                  </b>
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
          <Panel
            title="API keys"
            href="/developers"
            actionLabel="Manage"
            bodyClassName="grid gap-2"
          >
            {keys.map((key) => (
              <div
                key={key.id}
                className="bg-inset-surface rounded-[14px] border border-[#1c2638] p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <b className="truncate text-[12px] font-extrabold">{key.label}</b>
                  <code className="shrink-0 font-mono text-[10.5px] text-cyan">
                    {key.key_prefix}…
                  </code>
                </div>
                <small className="mt-1 block text-[10px] text-muted">
                  {key.scopes.length} scopes · last used{" "}
                  {key.last_used_at ? timeAgo(key.last_used_at, now) : "never"}
                </small>
              </div>
            ))}
            {keys.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">No keys yet.</p>
            ) : null}
          </Panel>

          <Panel title="Account">
            <dl className="m-0 grid gap-0">
              <DataRow label="Handle" value={`@${profile.handle}`} />
              <DataRow label="Creator" value={profile.is_creator ? "Yes" : "No"} />
              <DataRow
                label="Verified human"
                value={profile.is_verified_human ? "Yes" : "No"}
              />
              <DataRow label="Mode" value={isDemoMode() ? "Demo" : "Supabase"} />
            </dl>
            {isDemoMode() ? (
              <p className="m-0 mt-3 text-[11px] leading-relaxed text-muted">
                Demo mode signs you in as the demo human. Everything you change lives in
                this server process and resets on a cold start.
              </p>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}
