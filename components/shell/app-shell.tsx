import type { ReactNode } from "react";
import { getRepo, isDemoMode } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
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

  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-[10px] focus:bg-[#101827] focus:px-3 focus:py-2 focus:text-[12px] focus:font-extrabold"
      >
        Skip to content
      </a>

      <Sidebar unreadCount={unreadCount} />

      <div className="flex min-h-dvh flex-col lg:pl-[220px]">
        <TopBar
          availableCents={availableCents}
          unreadCount={unreadCount}
          displayName={profile?.display_name ?? "Guest"}
          roleLabel={profile?.is_creator ? "Builder Mode" : "Member"}
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
      <BottomNav unreadCount={unreadCount} />
    </ToastProvider>
  );
}
