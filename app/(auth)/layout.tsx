import type { ReactNode } from "react";
import Link from "next/link";
import { getRepo } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Brand } from "@/components/shell/brand";
import { ToastProvider } from "@/components/ui/toast";
import { DemoBanner } from "@/components/auth/DemoBanner";

/**
 * Auth pages sit outside the app shell: a centred card on the District
 * background, with the dismissible demo strip shown whenever Supabase is not
 * configured (BUILD_SPEC §4).
 *
 * `ToastProvider` is mounted here as well as in `AppShell`. Every mutation form
 * in the District is an `<ActionForm>`, and `ActionForm` calls `useToast()`
 * unconditionally — without a provider on this side of the tree the sign-in and
 * sign-up forms threw *"useToast must be used inside <ToastProvider>"* and
 * `/login` answered **500** on any deployment that actually had Supabase
 * configured. Demo mode never rendered a form, which is why it went unnoticed.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const demo = !isSupabaseConfigured();
  const profile = demo ? await getRepo().getCurrentProfile() : null;

  return (
    <ToastProvider>
      <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-4 px-4 py-12">
        <Brand className="justify-center" />

        {demo ? (
          <DemoBanner
            handle={profile?.handle ?? "austin"}
            name={profile?.display_name ?? "Austin"}
          />
        ) : null}

        <div className="bg-card-surface rounded-card border border-line p-5 shadow-[var(--shadow-float)]">
          {children}
        </div>

        <p className="m-0 text-center text-[11px] text-muted">
          <Link
            href="/"
            className="inline-block py-2 font-extrabold text-blue hover:text-cyan"
          >
            ← Back to the District
          </Link>
        </p>
      </main>
    </ToastProvider>
  );
}
