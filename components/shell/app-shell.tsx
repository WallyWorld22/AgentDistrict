import type { ReactNode } from "react";
import { getRepo, isDemoMode } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { parseProfileAvatar } from "@/lib/data/ext/profiles";
import { ToastProvider } from "@/components/ui/toast";
import { DemoBanner } from "@/components/auth/DemoBanner";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { WorldBar } from "./world-bar";

/**
 * The AgentDistrict shell (BUILD_SPEC §3).
 *
 * Desktop (≥1024px): 220px sidebar + sticky top bar + fixed bottom @World bar
 * that spans the full viewport width (docs/reference/desktop-home.png).
 * Mobile: top bar + fixed bottom nav + floating @World button.
 * The Toast provider is mounted here so every page can call `useToast()`.
 *
 * This is the one place that reads the signed-in profile, their wallet and
 * their unread count, and hands them down as props — the chrome shows live
 * numbers rather than the reference screenshot's literals.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const repo = getRepo();
  const profile = await getCurrentProfile(repo);

  const [wallet, threads] = profile
    ? await Promise.all([repo.getWallet(profile.id), repo.listThreads(profile.id)])
    : [null, []];

  const availableCents = wallet ? wallet.balance_cents - wallet.held_cents : 0;
  const unreadCount = threads.reduce((total, thread) => total + thread.unread_count, 0);

  const displayName = profile?.display_name ?? "Guest";
  const roleLabel = profile?.is_creator ? "Builder Mode" : "Member";
  // The chosen emoji/gradient is resolved here, in the one place that already
  // holds the profile — the client chip receives a CSS value from a fixed list,
  // never the raw column (see lib/data/ext/profiles.ts).
  const districtAvatar = profile ? parseProfileAvatar(profile.avatar_url) : null;
  const avatar = districtAvatar
    ? { emoji: districtAvatar.emoji, gradient: districtAvatar.gradient }
    : null;
  const isAdmin = profile?.is_admin === true;

  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-[10px] focus:bg-[#101827] focus:px-3 focus:py-2 focus:text-[12px] focus:font-extrabold"
      >
        Skip to content
      </a>

      <Sidebar unreadCount={unreadCount} isAdmin={isAdmin} />

      <div className="flex min-h-dvh flex-col lg:pl-[220px]">
        <TopBar
          availableCents={availableCents}
          unreadCount={unreadCount}
          displayName={displayName}
          roleLabel={roleLabel}
          signedIn={profile !== null}
          avatar={avatar}
        />
        <main
          id="main"
          // Focusable, or the skip link only moves the viewport: browsers that
          // do not implement a sequential-focus starting point leave focus
          // behind and the next Tab restarts at the top of the sidebar.
          tabIndex={-1}
          className="animate-fade-in mx-auto w-full max-w-[1440px] flex-1 px-3 pt-4 pb-[112px] focus-visible:outline-none sm:px-4 lg:pb-[92px]"
        >
          {/* One banner for the whole app; it hides itself once dismissed. */}
          {isDemoMode() && profile ? (
            <DemoBanner
              handle={profile.handle}
              name={profile.display_name}
              className="mb-3"
            />
          ) : null}
          {children}
        </main>
      </div>

      <WorldBar />
      <BottomNav
        unreadCount={unreadCount}
        isAdmin={isAdmin}
        account={{ signedIn: profile !== null, displayName, roleLabel }}
      />
    </ToastProvider>
  );
}
