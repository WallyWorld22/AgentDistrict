import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Settings as SettingsIcon, ShieldCheck, UserRound } from "lucide-react";
import { getRepo, isDemoMode } from "@/lib/data";
import { requireProfileOrLogin } from "@/lib/auth";
import { profileAvatarOrDefault } from "@/lib/data/ext/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { DataRow, Inset, Panel } from "@/components/feature/panel";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AccountForm } from "@/components/settings/account-form";
import { PasswordForm } from "@/components/settings/password-form";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your name, bio and avatar, your password, and where your spend policy lives.",
};

export const dynamic = "force-dynamic";

/**
 * `/settings` — the account surface (BUILD_SPEC §4).
 *
 * Reached from the top bar's account menu and the mobile More sheet, and
 * deliberately **not** a sidebar row: it is a thing you do once, not a District
 * destination, and `lib/nav.ts` is the District's public shape.
 *
 * Three sections and no duplication: Account writes `profiles` through the
 * repository, Security talks to Supabase auth (and says so when there is no
 * Supabase), and Spend policy is a signpost to `/wallet`, where the controls
 * that actually bite already live.
 */
export default async function Page() {
  const repo = getRepo();
  const profile = await requireProfileOrLogin("/settings", repo);

  const wallet = await repo.getWallet(profile.id);
  const avatar = profileAvatarOrDefault(profile);
  const supabaseOn = isSupabaseConfigured();

  // The email lives on `auth.users`, not on `profiles` — read it from the
  // session when there is one. Demo mode has no account, and says so rather
  // than printing a plausible-looking address nobody owns.
  let email: string | null = null;
  if (supabaseOn) {
    const supabase = await createClient();
    const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    email = data.user?.email ?? null;
  }

  return (
    <div className="grid gap-4">
      <SectionHead
        as="h1"
        title="Settings"
        subtitle="Your name, bio and avatar, your password, and the policy that governs unattended spend."
        icon={<SettingsIcon className="size-4" aria-hidden="true" />}
        action={isDemoMode() ? <Pill variant="yellow">Demo session</Pill> : null}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title="Account"
          subtitle="How the District shows you — everywhere your name appears."
          icon={<UserRound className="size-4" aria-hidden="true" />}
        >
          <AccountForm
            handle={profile.handle}
            displayName={profile.display_name}
            bio={profile.bio ?? ""}
            avatarEmoji={avatar.emoji}
            avatarGradientId={avatar.gradientId}
          />
        </Panel>

        <div className="grid content-start gap-4">
          <Panel
            title="Security"
            subtitle="Your sign-in credential."
            icon={<KeyRound className="size-4" aria-hidden="true" />}
            bodyClassName="grid gap-3"
          >
            <dl className="m-0 grid">
              <DataRow
                label="Email"
                value={
                  email ?? (
                    <span className="text-muted">
                      {supabaseOn ? "Not set on this account" : "No account email"}
                    </span>
                  )
                }
              />
              <DataRow label="Handle" value={`@${profile.handle}`} />
              <DataRow
                label="Verified human"
                value={profile.is_verified_human ? "Yes" : "Not yet"}
              />
            </dl>

            {supabaseOn ? (
              <PasswordForm />
            ) : (
              <Inset>
                <b className="block text-[12px] font-extrabold">Demo mode has no passwords</b>
                <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-muted">
                  This deployment runs on the in-memory dataset and signs every visitor in as
                  <span className="font-mono text-cyan"> @{profile.handle}</span>. There is no
                  account to secure and nothing to change. Configure Supabase and real
                  accounts — sign-up, sign-in and this form — turn on.
                </p>
              </Inset>
            )}
          </Panel>

          <Panel
            title="Spend policy"
            subtitle="Enforced server-side on every hold."
            icon={<ShieldCheck className="size-4" aria-hidden="true" />}
            bodyClassName="grid gap-3"
          >
            <p className="m-0 text-[11.5px] leading-relaxed text-ink">
              The approval threshold and the autonomous daily ceiling are wallet columns,
              checked inside the same transaction that places a hold. They are edited where
              the money is.
            </p>
            {wallet ? (
              <dl className="m-0 grid">
                <DataRow
                  label="Approval threshold"
                  value={formatCents(wallet.approval_threshold_cents)}
                />
                <DataRow
                  label="Autonomous daily limit"
                  value={formatCents(wallet.autonomous_spend_limit_cents)}
                />
                <DataRow
                  label="Unattended spend"
                  value={wallet.autonomous_paused ? "Paused" : "Allowed"}
                />
              </dl>
            ) : null}
            <Link href="/wallet" className={buttonClasses("outline", "sm", "w-full")}>
              Edit in the Wallet
            </Link>
          </Panel>

          <Panel
            title="Session"
            subtitle="End this session on this device."
            bodyClassName="grid gap-2"
          >
            <SignOutButton />
          </Panel>
        </div>
      </div>
    </div>
  );
}
