import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { WorldBar } from "./world-bar";

/**
 * The AgentDistrict shell (BUILD_SPEC §3).
 *
 * Desktop (≥1024px): 220px sidebar + sticky top bar + fixed bottom @World bar.
 * Mobile: top bar + fixed bottom nav + floating @World button.
 * The Toast provider is mounted here so every page can call `useToast()`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-[10px] focus:bg-[#101827] focus:px-3 focus:py-2 focus:text-[12px] focus:font-extrabold"
      >
        Skip to content
      </a>

      <Sidebar />

      <div className="flex min-h-dvh flex-col lg:pl-[220px]">
        <TopBar />
        <main
          id="main"
          className="animate-fade-in mx-auto w-full max-w-[1250px] flex-1 px-3 pt-4 pb-[112px] sm:px-4 lg:pb-[96px]"
        >
          {children}
        </main>
      </div>

      <WorldBar />
      <BottomNav />
    </ToastProvider>
  );
}
