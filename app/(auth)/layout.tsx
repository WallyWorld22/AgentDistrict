import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/shell/brand";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Auth pages sit outside the app shell: a centred card on the District
 * background, with the demo-session banner shown whenever Supabase is not
 * configured (BUILD_SPEC §4).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const demo = !isSupabaseConfigured();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-4 px-4 py-12">
      <Brand className="justify-center" />

      {demo ? (
        <p className="m-0 rounded-[14px] border border-[#1b7253] bg-[#0c251d] px-3.5 py-2.5 text-center text-[11px] font-bold text-[#71f0b5]">
          Demo session — no Supabase configured. You are already signed in as
          <span className="font-extrabold"> @austin</span>.
        </p>
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
  );
}
